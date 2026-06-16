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
  avg_buy_price: string;
}

interface WalletsResponse {
  wallets: Wallet[];
}

interface OrderResponse {
  id: number;
  side: "BUY" | "SELL";
  order_type: "LIMIT" | "MARKET";
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED";
  filled_amount: string;
  filled_quote_amount: string;
  remaining: string;
}

interface OrdersResponse {
  orders: OrderResponse[];
}

interface TradeResponse {
  id: number;
  side: "BUY" | "SELL";
  coin_symbol: string;
  price: string;
  quantity: string;
  fee_rate: string;
  buyer_fee: string;
  buyer_fee_asset: string;
  seller_fee: string;
  seller_fee_asset: string;
}

interface TradesResponse {
  trades: TradeResponse[];
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

test("UI keeps rendering when Upbit ticker fails and selected coin changes account context", async ({
  page,
}) => {
  const upbitConsoleErrors: string[] = [];
  await page.route(/https:\/\/api\.upbit\.com\/v1\/ticker\/all.*/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "upbit unavailable in e2e" }),
    }),
  );
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      (message.text().includes("api.upbit.com") ||
        message.text().includes("ticker/all"))
    ) {
      upbitConsoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Coin Switcher");
  await page.getByTestId("auth-email").fill(uniqueEmail("coin-switch"));
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");
  await expect(page.getByText("BTC/KRW").first()).toBeVisible();
  await expect(page.getByTestId("order-price")).toHaveValue("106,612,000");

  await page.getByText("ETH/KRW").first().click();

  await expect(page.getByText("ETH available")).toBeVisible();
  await expect(page.getByTestId("selected-asset-available")).toHaveText("0");
  await expect(page.getByText("수량 (ETH)")).toBeVisible();
  await expect(page.getByTestId("submit-order")).toHaveText("매수 ETH");
  expect(upbitConsoleErrors).toEqual([]);
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

  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");

  await page.getByTestId("fund-krw").click();
  await expect(page.getByText("KRW 주문 가능 1000000")).toBeVisible();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");
  await expect(page.getByTestId("balance-total-KRW")).toHaveText("1000000");

  await page.getByTestId("fund-selected-asset").click();
  await expect(page.getByText("BTC 주문 가능 1")).toBeVisible();
  await expect(page.getByTestId("selected-asset-available")).toHaveText("1");
  await expect(page.getByTestId("balance-total-BTC")).toHaveText("1");
  await expect
    .poll(async () =>
      page
        .getByTestId("account-sidebar")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);

  await page.getByTestId("order-price").fill("5000");
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();

  await expect(page.getByTestId("order-message")).toContainText(
    "주문 접수",
  );
  await expect(page.getByTestId("krw-available")).toHaveText("994997.5");
  await expect(page.getByTestId("krw-locked")).toHaveText("5002.5");
  await expect(page.getByTestId("open-order-count")).toHaveText("1");

  const cancelButton = page.locator('[data-testid^="cancel-order-"]');
  await expect(cancelButton).toHaveCount(1);
  await cancelButton.click();

  await expect(page.getByText("5002.5 KRW 반환 완료")).toBeVisible();
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
  await fundWallet(request, buyer.token, "KRW", "5002.5");

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
    .toBe("1");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const sellerWallets = await fetchWallets(request, seller.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  const sellerOrders = await fetchOrders(request, seller.token);
  const buyerTrades = await fetchTrades(request, buyer.token);
  const sellerTrades = await fetchTrades(request, seller.token);

  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, "BTC")).toMatchObject({
    available_balance: "1",
    locked_balance: "0",
    avg_buy_price: "5002.5",
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
  expect(buyerTrades.trades[0]).toMatchObject({
    side: "BUY",
    coin_symbol: "BTC",
    price: "5000",
    quantity: "1",
    fee_rate: "0.0005",
    buyer_fee: "2.5",
    buyer_fee_asset: "KRW",
    seller_fee: "2.5",
    seller_fee_asset: "KRW",
  });
  expect(sellerTrades.trades[0]).toMatchObject({
    side: "SELL",
    coin_symbol: "BTC",
    price: "5000",
    quantity: "1",
    fee_rate: "0.0005",
    buyer_fee: "2.5",
    buyer_fee_asset: "KRW",
    seller_fee: "2.5",
    seller_fee_asset: "KRW",
  });
});

test("average buy price uses weighted buys and resets after a full sell", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("AVG");
  const buyer = await register(request, "avg-buyer");
  const lowSeller = await register(request, "avg-low-seller");
  const highSeller = await register(request, "avg-high-seller");
  const exitBuyer = await register(request, "avg-exit-buyer");

  await fundWallet(request, lowSeller.token, coinSymbol, "1");
  await fundWallet(request, highSeller.token, coinSymbol, "1");
  await fundWallet(request, buyer.token, "KRW", "12006");
  await fundWallet(request, exitBuyer.token, "KRW", "16008");

  const lowSell = await createOrder(request, lowSeller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const firstBuy = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  await waitForOrderStatus(request, lowSeller.token, lowSell.order_id, "FILLED");
  await waitForOrderStatus(request, buyer.token, firstBuy.order_id, "FILLED");

  const highSell = await createOrder(request, highSeller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "7000",
    amount: "1",
  });
  const secondBuy = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "7000",
    amount: "1",
  });
  await waitForOrderStatus(request, highSeller.token, highSell.order_id, "FILLED");
  await waitForOrderStatus(request, buyer.token, secondBuy.order_id, "FILLED");

  let buyerWallets = await fetchWallets(request, buyer.token);
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "2",
    locked_balance: "0",
    avg_buy_price: "6003",
  });
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });

  const exitSell = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "8000",
    amount: "2",
  });
  const exitBuy = await createOrder(request, exitBuyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "8000",
    amount: "2",
  });
  await waitForOrderStatus(request, buyer.token, exitSell.order_id, "FILLED");
  await waitForOrderStatus(request, exitBuyer.token, exitBuy.order_id, "FILLED");

  buyerWallets = await fetchWallets(request, buyer.token);
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
    avg_buy_price: "0",
  });
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "15992",
    locked_balance: "0",
  });
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

  const invalidQuantityStep = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "BTC",
      side: "SELL",
      order_type: "MARKET",
      price: "0",
      amount: "0.000000015",
      quote_amount: "0",
    },
  });
  expect(invalidQuantityStep.status()).toBe(422);

  const invalidXRPQuantityStep = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "XRP",
      side: "SELL",
      order_type: "MARKET",
      price: "0",
      amount: "1.5",
      quote_amount: "0",
    },
  });
  expect(invalidXRPQuantityStep.status()).toBe(422);

  const haltedMarket = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(user.token),
    data: {
      coin_symbol: "HALT",
      side: "BUY",
      order_type: "LIMIT",
      price: "5000",
      amount: "1",
    },
  });
  expect(haltedMarket.status()).toBe(409);

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

test("market rules API exposes disabled KRW notional minimum and tick sizes", async ({
  request,
}) => {
  const response = await request.get(`${apiBaseURL}/markets/rules?coin_symbol=btc`);

  expect(response.status()).toBe(200);
  await expect(responseData(response)).resolves.toMatchObject({
    coin_symbol: "BTC",
    quote_symbol: "KRW",
    trading_enabled: true,
    trading_status: "ACTIVE",
    min_order_notional: "0",
    min_order_quantity: "0.00000001",
    base_quantity_step: "0.00000001",
    fee_rate: "0.0005",
    tick_rules: expect.arrayContaining([
      { upper_bound: "0.00001", tick_size: "0.00000001" },
      { upper_bound: "5000", tick_size: "1" },
      { upper_bound: "10000", tick_size: "5" },
      { upper_bound: "2000000", tick_size: "1000" },
      { upper_bound: null, tick_size: "1000" },
    ]),
  });

  const xrpResponse = await request.get(`${apiBaseURL}/markets/rules?coin_symbol=xrp`);
  expect(xrpResponse.status()).toBe(200);
  await expect(responseData(xrpResponse)).resolves.toMatchObject({
    coin_symbol: "XRP",
    trading_enabled: true,
    trading_status: "ACTIVE",
    min_order_quantity: "1",
    base_quantity_step: "1",
  });

  const haltedResponse = await request.get(`${apiBaseURL}/markets/rules?coin_symbol=halt`);
  expect(haltedResponse.status()).toBe(200);
  await expect(responseData(haltedResponse)).resolves.toMatchObject({
    coin_symbol: "HALT",
    trading_enabled: false,
    trading_status: "HALTED",
  });
});

test("protected APIs return structured auth errors and dev tools require a dev token", async ({
  request,
}) => {
  const missingAuth = await request.get(`${apiBaseURL}/wallets`);
  expect(missingAuth.status()).toBe(401);
  await expectErrorCode(missingAuth, "AUTH_REQUIRED");

  const invalidAuth = await request.get(`${apiBaseURL}/wallets`, {
    headers: authHeaders("not-a-valid-jwt"),
  });
  expect(invalidAuth.status()).toBe(401);
  await expectErrorCode(invalidAuth, "AUTH_INVALID_TOKEN");

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

test("another user cannot cancel someone else's open order", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("FORBID");
  const owner = await register(request, "cancel-owner");
  const attacker = await register(request, "cancel-attacker");

  await fundWallet(request, owner.token, "KRW", "5002.5");
  const order = await createOrder(request, owner.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });

  const forbiddenCancel = await request.delete(
    `${apiBaseURL}/orders/${order.order_id}`,
    { headers: authHeaders(attacker.token) },
  );

  expect(forbiddenCancel.status()).toBe(403);
  await expectErrorCode(forbiddenCancel, "FORBIDDEN");

  const ownerWallets = await fetchWallets(request, owner.token);
  const ownerOrders = await fetchOrders(request, owner.token);
  expect(walletBalance(ownerWallets, "KRW")).toMatchObject({
    available_balance: "0",
    locked_balance: "5002.5",
  });
  expect(findOrder(ownerOrders, order.order_id)?.status).toBe("PENDING");

  await cancelOrder(request, owner.token, order.order_id);
});

test("incoming buy skips the user's own best ask and matches another seller", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("SKIP");
  const trader = await register(request, "self-skip-trader");
  const otherSeller = await register(request, "self-skip-seller");

  await fundWallet(request, trader.token, coinSymbol, "1");
  await fundWallet(request, trader.token, "KRW", "5102.55");
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
    available_balance: "1",
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

  await fundWallet(request, buyer.token, "KRW", "10005");
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
    released_amount: "5002.5",
  });

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "5002.5",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "1",
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
  await fundWallet(request, buyer.token, "KRW", "5502.75");

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
    available_balance: "500.25",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "1",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "KRW")).toMatchObject({
    available_balance: "4997.5",
    locked_balance: "0",
  });
});

test("market buy spends KRW budget, settles fees, and releases unused KRW", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("MBUY");
  const seller = await register(request, "market-buy-seller");
  const buyer = await register(request, "market-buy-buyer");

  await fundWallet(request, seller.token, coinSymbol, "1");
  await fundWallet(request, buyer.token, "KRW", "10000");

  const sellOrder = await createOrder(request, seller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const marketBuy = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "MARKET",
    price: "0",
    amount: "0",
    quote_amount: "10000",
  });

  await waitForOrderStatus(request, seller.token, sellOrder.order_id, "FILLED");
  await waitForOrderStatus(request, buyer.token, marketBuy.order_id, "CANCELLED");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "4997.5",
    locked_balance: "0",
  });
  expect(walletBalance(buyerWallets, coinSymbol)).toMatchObject({
    available_balance: "1",
    locked_balance: "0",
  });
  expect(findOrder(buyerOrders, marketBuy.order_id)).toMatchObject({
    order_type: "MARKET",
    status: "CANCELLED",
    filled_amount: "1",
    filled_quote_amount: "5000",
  });
});

test("market sell consumes the best bid and never rests on the order book", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("MSELL");
  const buyer = await register(request, "market-sell-buyer");
  const seller = await register(request, "market-sell-seller");

  await fundWallet(request, buyer.token, "KRW", "5002.5");
  await fundWallet(request, seller.token, coinSymbol, "1");

  const buyOrder = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const marketSell = await createOrder(request, seller.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "MARKET",
    price: "0",
    amount: "1",
    quote_amount: "0",
  });

  await waitForOrderStatus(request, buyer.token, buyOrder.order_id, "FILLED");
  await waitForOrderStatus(request, seller.token, marketSell.order_id, "FILLED");

  const sellerWallets = await fetchWallets(request, seller.token);
  const sellerOrders = await fetchOrders(request, seller.token);
  expect(walletBalance(sellerWallets, coinSymbol)).toMatchObject({
    available_balance: "0",
    locked_balance: "0",
  });
  expect(walletBalance(sellerWallets, "KRW")).toMatchObject({
    available_balance: "4997.5",
    locked_balance: "0",
  });
  expect(findOrder(sellerOrders, marketSell.order_id)).toMatchObject({
    order_type: "MARKET",
    status: "FILLED",
    filled_amount: "1",
    filled_quote_amount: "5000",
  });
});

test("market buy with no liquidity cancels and releases the full KRW budget", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("MBUYEMPTY");
  const buyer = await register(request, "market-buy-empty");

  await fundWallet(request, buyer.token, "KRW", "7000");

  const marketBuy = await createOrder(request, buyer.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "MARKET",
    price: "0",
    amount: "0",
    quote_amount: "7000",
  });

  await waitForOrderStatus(request, buyer.token, marketBuy.order_id, "CANCELLED");

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  const buyerTrades = await fetchTrades(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "7000",
    locked_balance: "0",
  });
  expect(findOrder(buyerOrders, marketBuy.order_id)).toMatchObject({
    order_type: "MARKET",
    status: "CANCELLED",
    filled_amount: "0",
    filled_quote_amount: "0",
  });
  expect(buyerTrades.trades).toHaveLength(0);
});

test("market buy skips the user's own ask and releases the unfilled budget", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("MBUYSELF");
  const trader = await register(request, "market-buy-self");

  await fundWallet(request, trader.token, coinSymbol, "1");
  await fundWallet(request, trader.token, "KRW", "5000");

  const ownSell = await createOrder(request, trader.token, {
    coin_symbol: coinSymbol,
    side: "SELL",
    order_type: "LIMIT",
    price: "5000",
    amount: "1",
  });
  const marketBuy = await createOrder(request, trader.token, {
    coin_symbol: coinSymbol,
    side: "BUY",
    order_type: "MARKET",
    price: "0",
    amount: "0",
    quote_amount: "5000",
  });

  await waitForOrderStatus(request, trader.token, marketBuy.order_id, "CANCELLED");

  const traderOrders = await fetchOrders(request, trader.token);
  const traderWallets = await fetchWallets(request, trader.token);
  const traderTrades = await fetchTrades(request, trader.token);
  expect(findOrder(traderOrders, ownSell.order_id)?.status).toBe("PENDING");
  expect(findOrder(traderOrders, marketBuy.order_id)).toMatchObject({
    order_type: "MARKET",
    status: "CANCELLED",
    filled_amount: "0",
    filled_quote_amount: "0",
  });
  expect(walletBalance(traderWallets, "KRW")).toMatchObject({
    available_balance: "5000",
    locked_balance: "0",
  });
  expect(walletBalance(traderWallets, coinSymbol)).toMatchObject({
    available_balance: "0",
    locked_balance: "1",
  });
  expect(traderTrades.trades).toHaveLength(0);
});

test("duplicate cancel does not release locked balance twice", async ({
  request,
}) => {
  const coinSymbol = uniqueCoinSymbol("CANCEL");
  const buyer = await register(request, "double-cancel");

  await fundWallet(request, buyer.token, "KRW", "5002.5");

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
    released_amount: "5002.5",
  });

  const duplicateCancel = await request.delete(
    `${apiBaseURL}/orders/${buyOrder.order_id}`,
    { headers: authHeaders(buyer.token) },
  );
  expect(duplicateCancel.status()).toBe(409);

  const buyerWallets = await fetchWallets(request, buyer.token);
  const buyerOrders = await fetchOrders(request, buyer.token);
  expect(walletBalance(buyerWallets, "KRW")).toMatchObject({
    available_balance: "5002.5",
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
  return responseData<AuthResponse>(response);
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
    order_type: "LIMIT" | "MARKET";
    price?: string;
    amount?: string;
    quote_amount?: string;
  },
) {
  const response = await request.post(`${apiBaseURL}/orders`, {
    headers: authHeaders(token),
    data,
  });
  if (!response.ok()) {
    throw new Error(`create order failed: ${response.status()} ${await response.text()}`);
  }
  return responseData<{ order_id: number }>(response);
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
  return responseData<CancelOrderResponse>(response);
}

async function fetchWallets(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/wallets`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return responseData<WalletsResponse>(response);
}

async function fetchOrders(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/orders?limit=20`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return responseData<OrdersResponse>(response);
}

async function fetchTrades(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/trades?limit=20`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return responseData<TradesResponse>(response);
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

async function responseData<T = unknown>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
): Promise<T> {
  const body = await response.json();
  if (body && typeof body === "object" && "data" in body) {
    return body.data as T;
  }
  return body as T;
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
