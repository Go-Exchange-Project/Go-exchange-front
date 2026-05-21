import { expect, type APIRequestContext, test } from "@playwright/test";

const apiBaseURL =
  process.env.E2E_API_BASE_URL ??
  process.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8080";

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
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED";
}

interface OrdersResponse {
  orders: OrderResponse[];
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

  await page.getByTestId("order-price").fill("100");
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();

  await expect(page.getByTestId("order-message")).toContainText(
    "Order accepted",
  );
  await expect(page.getByTestId("krw-available")).toHaveText("999900");
  await expect(page.getByTestId("krw-locked")).toHaveText("100");
  await expect(page.getByTestId("open-order-count")).toHaveText("1");

  const cancelButton = page.locator('[data-testid^="cancel-order-"]');
  await expect(cancelButton).toHaveCount(1);
  await cancelButton.click();

  await expect(page.getByText("Released 100 KRW")).toBeVisible();
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
  await fundWallet(request, buyer.token, "KRW", "1000");

  const sellOrder = await createOrder(request, seller.token, {
    coin_symbol: "BTC",
    side: "SELL",
    order_type: "LIMIT",
    price: "100",
    amount: "1",
  });
  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: "BTC",
    side: "BUY",
    order_type: "LIMIT",
    price: "100",
    amount: "1",
  });

  await expect
    .poll(async () => {
      const buyerWallets = await fetchWallets(request, buyer.token);
      return walletBalance(buyerWallets, "BTC")?.available_balance ?? "0";
    })
    .toBe("1");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const sellerWallets = await fetchWallets(request, seller.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  const sellerOrders = await fetchOrders(request, seller.token);

  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "900",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "KRW")).toMatchObject({
    available_balance: "100",
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

  const insufficientBalance = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "BUY",
      order_type: "LIMIT",
      price: "100",
      amount: "1",
    },
  });
  expect(insufficientBalance.status()).toBe(409);
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
    headers: authHeaders(token),
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

function walletBalance(wallets: WalletsResponse, coinSymbol: string) {
  return wallets.wallets.find((wallet) => wallet.coin_symbol === coinSymbol);
}

function findOrder(orders: OrdersResponse, orderID: number) {
  return orders.orders.find((order) => order.id === orderID);
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function uniqueEmail(role: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `e2e-${role}-${suffix}@example.com`;
}
