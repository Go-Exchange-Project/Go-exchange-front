import { expect, type APIRequestContext, test } from "@playwright/test";

const apiBaseURL =
  process.env.E2E_API_BASE_URL ??
  process.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8080";
const devToolsToken =
  process.env.E2E_DEV_TOOLS_TOKEN ??
  process.env.VITE_DEV_TOOLS_TOKEN ??
  "e2e-dev-token";

const password = "E2ePassword123!";

interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
  };
}

interface Wallet {
  coin_symbol: string;
  available_balance: string;
  locked_balance: string;
}

interface WalletsResponse {
  wallets: Wallet[];
}

interface OrderResponse {
  id: number;
  side: "BUY" | "SELL";
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED";
  filled_amount: string;
  remaining: string;
}

interface OrdersResponse {
  orders: OrderResponse[];
}

interface CancelOrderResponse {
  status: "CANCELLED";
  released_asset: string;
  released_amount: string;
}

test.beforeEach(async ({ request }) => {
  const ready = await isBackendReady(request);
  test.skip(!ready, `backend is not reachable at ${apiBaseURL}`);
});

test("user can register, fund KRW, place a buy order, and cancel it from the UI", async ({
  page,
}) => {
  const email = uniqueEmail("ui");

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Trader");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-status")).toHaveText("Authenticated");

  await page.getByTestId("fund-krw").click();
  await expect(page.getByText("KRW available 1000000")).toBeVisible();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");

  await page.getByTestId("order-price").fill("5000");
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();

  await expect(page.getByTestId("order-message")).toContainText(
    "Order accepted",
  );
  await expect(page.getByTestId("krw-available")).toHaveText("995000");
  await expect(page.getByTestId("krw-locked")).toHaveText("5000");
  await expect(page.getByTestId("open-order-count")).toHaveText("1");

  const cancelButton = page.locator('[data-testid^="cancel-order-"]');
  await expect(cancelButton).toHaveCount(1);
  await cancelButton.click();

  await expect(page.getByText("Released 5000 KRW")).toBeVisible();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");
  await expect(page.getByTestId("krw-locked")).toHaveText("0");
  await expect(page.getByTestId("open-order-count")).toHaveText("0");
});

test("seller and buyer orders match through HTTP APIs and settle both wallets", async ({
  request,
}) => {
  const seller = await register(request, "seller");
  const buyer = await register(request, "buyer");

  await fundWallet(request, seller.token, "BTC", "1");
  await fundWallet(request, buyer.token, "KRW", "5000");

  const sellOrder = await createOrder(request, seller.token, {
    coin_symbol: "BTC",
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: "BTC",
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });

  await expect
    .poll(async () => {
      const buyerWallets = await fetchWallets(request, buyer.token);
      return walletBalance(buyerWallets, "BTC")?.available_balance ?? "0";
    })
    .toBe("0.9995");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const sellerWallets = await fetchWallets(request, seller.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  const sellerOrders = await fetchOrders(request, seller.token);

  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "KRW")).toMatchObject({
    available_balance: "4997.5",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "BTC")).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });
  expect(findOrder(buyerOrders, buyOrder.order_id)?.status).toBe("FILLED");
  expect(findOrder(sellerOrders, sellOrder.order_id)?.status).toBe("FILLED");
});

test("order validation uses precise HTTP status codes", async ({ request }) => {
  const user = await register(request, "status");

  const invalidPrice = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "BUY",
      order_type: "LIMIT",
      price: "bad-price",
      amount: "1",
    },
  });
  expect(invalidPrice.status()).toBe(422);

  const invalidTick = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "BUY",
      order_type: "LIMIT",
      price: "5001",
      amount: "1",
    },
  });
  expect(invalidTick.status()).toBe(422);

  const belowMinimum = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "BUY",
      order_type: "LIMIT",
      price: "100",
      amount: "1",
    },
  });
  expect(belowMinimum.status()).toBe(422);

  const insufficientBalance = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "BUY",
      order_type: "LIMIT",
      price: "5000",
      amount: "1",
    },
  });
  expect(insufficientBalance.status()).toBe(409);
});

test("market rules API exposes KRW minimum notional and tick sizes", async ({
  request,
}) => {
  const response = await request.get(`${apiBaseURL}/markets/rules?coin_symbol=btc`);

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    coin_symbol: "BTC",
    quote_symbol: "KRW",
    min_order_notional: "5000",
    fee_rate: "0.0005",
    tick_rules: expect.arrayContaining([
      { upper_bound: "10000", tick_size: "5" },
      { upper_bound: null, tick_size: "1000" },
    ]),
  });
});

test("protected APIs return structured auth errors and dev tools require a dev token", async ({
  request,
}) => {
  const missingAuth = await request.get(`${apiBaseURL}/wallets`);
  expect(missingAuth.status()).toBe(401);
  await expectErrorCode(missingAuth, "AUTH_REQUIRED");

  const user = await register(request, "dev-guard");
  const missingDevToken = await request.post(`${apiBaseURL}/dev/wallets/fund`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "KRW",
      amount: "1",
    },
  });
  expect(missingDevToken.status()).toBe(403);
  await expectErrorCode(missingDevToken, "DEV_TOOLS_FORBIDDEN");
});

test("incoming buy skips the user's own best ask and matches another seller", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("SKIP");
  const trader = await register(request, "self-skip-trader");
  const otherSeller = await register(request, "self-skip-seller");

  await fundWallet(request, trader.token, coinSymbol, "1");
  await fundWallet(request, trader.token, "KRW", "5100");
  await fundWallet(request, otherSeller.token, coinSymbol, "1");

  const ownSell = await createOrder(request, trader.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const otherSell = await createOrder(request, otherSeller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5100",
    amount: "1",
  });
  const buyOrder = await createOrder(request, trader.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5100",
    amount: "1",
  });

  await waitForOrderStatus(request, trader.token, buyOrder.order_id, "FILLED");
  await waitForOrderStatus(request, otherSeller.token, otherSell.order_id, "FILLED");

  const traderOrders = await fetchOrders(request, trader.token);
  const traderWallets = await fetchWallets(request, trader.token);
  const otherSellerWallets = await fetchWallets(request, otherSeller.token);

  expect(findOrder(traderOrders, ownSell.order_id)?.status).toBe("PENDING");
  expect(walletBalance(traderWallets, coinSymbol)).toMatchObject({
    available_balance: "0.9995",
    locked_balance: "1",
  });
  expect(walletBalance(traderWallets, "KRW")).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });
  expect(walletBalance(otherSellerWallets, "KRW")).toMatchObject({
    available_balance: "5097.45",
    locked_balance: "0",
  });
});

test("partially filled buy order releases only remaining KRW when cancelled", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("PART");
  const buyer = await register(request, "partial-buyer");
  const seller = await register(request, "partial-seller");

  await fundWallet(request, buyer.token, "KRW", "10000");
  await fundWallet(request, seller.token, coinSymbol, "1");

  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "2",
  });
  const sellOrder = await createOrder(request, seller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });

  await waitForOrderStatus(request, buyer.token, buyOrder.order_id, "PARTIAL");
  await waitForOrderStatus(request, seller.token, sellOrder.order_id, "FILLED");

  const cancelResult = await cancelOrder(request, buyer.token, buyOrder.order_id);
  expect(cancelResult).toMatchObject({
    status: "CANCELLED",
    released_asset: "KRW",
    released_amount: "5000",
  });

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "5000",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "0.9995",
    locked_balance: "0",
  });
  expect(findOrder(buyerOrders, buyOrder.order_id)).toMatchObject({
    status: "CANCELLED",
    filled_amount: "1",
    remaining: "1",
  });
});

test("buyer receives KRW refund when a limit buy gets price improvement", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("REFUND");
  const seller = await register(request, "refund-seller");
  const buyer = await register(request, "refund-buyer");

  await fundWallet(request, seller.token, coinSymbol, "1");
  await fundWallet(request, buyer.token, "KRW", "5500");

  const sellOrder = await createOrder(request, seller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5500",
    amount: "1",
  });

  await waitForOrderStatus(request, buyer.token, buyOrder.order_id, "FILLED");
  await waitForOrderStatus(request, seller.token, sellOrder.order_id, "FILLED");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const sellerWallets = await fetchWallets(request, seller.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "500",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "0.9995",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "KRW")).toMatchObject({
    available_balance: "4997.5",
    locked_balance: "0",
  });
});

test("duplicate cancel does not release locked balance twice", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("CANCEL");
  const buyer = await register(request, "double-cancel");

  await fundWallet(request, buyer.token, "KRW", "5000");

  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });

  const firstCancel = await cancelOrder(request, buyer.token, buyOrder.order_id);
  expect(firstCancel).toMatchObject({
    status: "CANCELLED",
    released_amount: "5000",
  });

  const duplicateCancel = await request.delete(
    `${apiBaseURL}/orders/${buyOrder.order_id}`,
    { headers: authHeaders(buyer.token) },
  );
  expect(duplicateCancel.status()).toBe(409);

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "5000",
    locked_balance: "0",
  });
  expect(findOrder(buyerOrders, buyOrder.order_id)?.status).toBe("CANCELLED");
});

async function isBackendReady(request: APIRequestContext) {
  try {
    const response = await request.get(`${apiBaseURL}/ping`, { timeout: 2_000 });
    return response.ok();
  } catch {
    return false;
  }
}

async function register(request: APIRequestContext, role: string) {
  const email = uniqueEmail(role);
  const response = await request.post(`${apiBaseURL}/auth/register`, {
    data: {
      name: `E2E ${role}`,
      email,
      password,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as AuthResponse;
}

async function fundWallet(
  request: APIRequestContext,
  token: string,
  coinSymbol: string,
  amount: string,
) {
  const response = await request.post(`${apiBaseURL}/dev/wallets/fund`, {
    headers: {
      ...authHeaders(token),
      "X-GoExchange-Dev-Token": devToolsToken,
    },
    data: {
      coin_symbol: coinSymbol,
      amount,
    },
  });
  test.skip(
    response.status() === 404,
    "backend dev wallet endpoint is disabled; set GOEXCHANGE_ENABLE_DEV_TOOLS=true",
  );
  if (!response.ok()) {
    throw new Error(`fund wallet failed: ${response.status()} ${await response.text()}`);
  }
}

async function createOrder(
  request: APIRequestContext,
  token: string,
  data: {
    coin_symbol: string;
    side: "BUY" | "SELL";
    order_type: "LIMIT";
    price: string;
    amount: string;
  },
) {
  const response = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(token),
    data,
  });
  if (!response.ok()) {
    throw new Error(`create order failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { order_id: number };
}

async function cancelOrder(
  request: APIRequestContext,
  token: string,
  orderID: number,
) {
  const response = await request.delete(`${apiBaseURL}/orders/${orderID}`, {
    headers: authHeaders(token),
  });
  if (!response.ok()) {
    throw new Error(`cancel order failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as CancelOrderResponse;
}

async function fetchWallets(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/wallets`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as WalletsResponse;
}

async function fetchOrders(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/orders?limit=20`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as OrdersResponse;
}

async function expectErrorCode(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
  code: string,
) {
  const body = await response.json();
  expect(body).toMatchObject({
    error: {
      code,
    },
  });
}

function walletBalance(wallets: WalletsResponse, coinSymbol: string) {
  return wallets.wallets.find((wallet) => wallet.coin_symbol === coinSymbol);
}

function findOrder(orders: OrdersResponse, orderID: number) {
  return orders.orders.find((order) => order.id === orderID);
}

async function waitForOrderStatus(
  request: APIRequestContext,
  token: string,
  orderID: number,
  status: OrderResponse["status"],
) {
  await expect
    .poll(async () => {
      const orders = await fetchOrders(request, token);
      return findOrder(orders, orderID)?.status;
    })
    .toBe(status);
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function uniqueEmail(role: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `e2e-${role}-${suffix}@example.com`;
}

function uniqueCoinSymbol(prefix: string) {
  return `E2E${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}
