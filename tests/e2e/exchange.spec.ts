import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

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

interface TransferResponse {
  id: number;
  direction: "DEPOSIT" | "WITHDRAWAL";
  rail: "BANK" | "CHAIN";
  asset: string;
  amount: string;
  status: "RECEIVED" | "PROCESSING" | "COMPLETED" | "FAILED";
  external_ref: string | null;
  delayed: boolean;
}

interface TransfersResponse {
  transfers: TransferResponse[];
}

// 취소는 202 "접수"로 응답한다. 이 시점에는 주문이 아직 오더북에 있을 수 있고
// 해제 금액도 확정되지 않았으므로, 최종 상태는 주문 조회로 확인해야 한다.
interface CancelOrderResponse {
  message: string;
  order_id: number;
  command_id: number;
  status: "ACCEPTED";
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

  // "ETH available"(영문)은 UI 한글화(22dff81) 이후로 어디에도 렌더링되지 않는
  // 문구다 — 계정 패널이 ETH로 전환됐다는 같은 사실은 바로 다음 testid 단언이
  // 이미 본다.
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

  // 클릭 직후에는 "취소 요청 접수됨"이지만 polling이 이미 최종 상태를 받았을 수도
  // 있다. 둘 다 허용하고, 최종적으로 "취소 완료"에 도달하는지를 단언한다.
  await expect(page.getByText(/취소 (요청 접수됨|완료)/)).toBeVisible();
  await expect(page.getByText("취소 완료")).toBeVisible();

  await expect(page.getByTestId("krw-available")).toHaveText("1000000");
  await expect(page.getByTestId("krw-locked")).toHaveText("0");
  await expect(page.getByTestId("open-order-count")).toHaveText("0");
});

// 사용자가 입금 과정을 체험하는 경로는 가짜 입금이고, 테스트 준비용 자산은
// 개발용 지급이다(설계 §5.1 용도 분리) — 이 테스트는 전자만 본다.
test("user can deposit through the assets page and see the balance increase after a fake completion notice", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("assets-deposit");

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Assets");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");

  await page.getByTestId("nav-assets").click();
  await expect(page.getByTestId("asset-balance-available-KRW")).toBeVisible();
  await expect(page.getByTestId("asset-balance-available-KRW")).toHaveText("0");

  await page.getByTestId("transfer-amount").fill("500000");
  await page.getByTestId("submit-deposit").click();
  await expect(page.getByTestId("transfer-message")).toContainText(
    "입금 요청이 접수됐습니다",
  );

  const token = await page.evaluate(() =>
    localStorage.getItem("goexchange.auth.token"),
  );
  expect(token).toBeTruthy();

  const transfer = await waitForTransferStatus(
    request,
    token as string,
    "PROCESSING",
  );
  expect(transfer.external_ref).toBeTruthy();

  await sendTransferCallback(request, token as string, transfer.external_ref as string, "SUCCESS");

  await page.getByTestId("refresh-assets").click();
  await expect(page.getByTestId("asset-balance-available-KRW")).toHaveText(
    "500000",
  );

  await page.getByTestId("tab-history").click();
  await expect(page.getByTestId(`transfer-status-${transfer.id}`)).toHaveText(
    "완료",
  );
});

// 첫 출금 요청의 응답이 유실된 뒤 재시도해도, 서버는 이미 그 요청을 커밋했을
// 수 있다(RequestWithdrawal이 잠금 트랜잭션 커밋 후 트랜잭션 밖에서 외부
// Submit을 부른다). client_request_key를 유지해야 재시도가 새 요청·새 잠금을
// 만들지 않는다.
test("retrying a withdrawal after a lost response does not double-lock funds", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("assets-withdraw-retry");

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Withdraw Retry");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");

  await page.getByTestId("fund-krw").click();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");

  await page.getByTestId("nav-assets").click();
  await page.getByTestId("tab-withdrawal").click();
  await expect(page.getByTestId("asset-balance-available-KRW")).toHaveText("1000000");

  // 첫 호출만 가로챈다: 서버에는 실제로 보내되(route.fetch()) 브라우저에는
  // 응답이 유실된 것처럼 보여준다(route.abort()). 재시도는 그대로 통과시킨다.
  let interceptedRequests = 0;
  await page.route("**/transfers/withdrawals", async (route) => {
    interceptedRequests += 1;
    if (interceptedRequests === 1) {
      await route.fetch();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.getByTestId("transfer-amount").fill("100000");
  await page.getByTestId("submit-withdrawal").click();
  await expect(page.getByTestId("transfer-error")).toBeVisible();

  // 재시도 — 금액을 바꾸지 않는다. TransferForm이 같은 client_request_key를
  // 재사용해야 한다.
  await page.getByTestId("submit-withdrawal").click();
  await expect(page.getByTestId("transfer-message")).toContainText(
    "출금 요청이 접수됐습니다",
  );

  await page.unroute("**/transfers/withdrawals");

  const token = await page.evaluate(() =>
    localStorage.getItem("goexchange.auth.token"),
  );
  expect(token).toBeTruthy();

  const transfers = await fetchTransfers(request, token as string);
  const withdrawals = transfers.transfers.filter(
    (t) => t.direction === "WITHDRAWAL",
  );
  expect(withdrawals).toHaveLength(1);
  expect(withdrawals[0].external_ref).toBeTruthy();

  await page.getByTestId("refresh-assets").click();
  await expect(page.getByTestId("asset-balance-locked-KRW")).toHaveText(
    "100000",
  );
  await expect(page.getByTestId("asset-balance-available-KRW")).toHaveText(
    "900000",
  );
});

test("retrying an order after a lost response does not double-submit", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("order-retry");

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Order Retry");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");

  await page.getByTestId("fund-krw").click();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");

  // "**/orders"는 주문 목록 조회(GET)에도 걸린다. POST(제출)인 첫 요청만
  // 가로채 서버에는 실제로 보내되(route.fetch()) 브라우저에는 응답이 유실된
  // 것처럼 보여준다(route.abort()). 그 외 요청(GET 목록·재시도 POST)은 그대로
  // 통과시킨다.
  let interceptedPostRequests = 0;
  await page.route("**/orders", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    interceptedPostRequests += 1;
    if (interceptedPostRequests === 1) {
      await route.fetch();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.getByTestId("order-price").fill("5000");
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();
  await expect(page.getByTestId("order-error")).toBeVisible();

  // 재시도 — 입력을 바꾸지 않는다. OrderForm이 같은 Idempotency-Key를 재사용해야
  // 한다.
  await page.getByTestId("submit-order").click();
  await expect(page.getByTestId("order-message")).toContainText("주문 접수");

  await page.unroute("**/orders");

  const token = await page.evaluate(() =>
    localStorage.getItem("goexchange.auth.token"),
  );
  expect(token).toBeTruthy();

  const orders = await fetchOrders(request, token as string);
  expect(orders.orders).toHaveLength(1);

  await expect(page.getByTestId("krw-available")).toHaveText("994997.5");
  await expect(page.getByTestId("krw-locked")).toHaveText("5002.5");

  // 이 파일의 테스트는 하나의 BTC 오더북을 공유한다(1387행 주석 참조). 미체결로
  // 남기면 뒤 테스트의 체결 상대가 되어 그 테스트를 조용히 깨뜨리므로 되돌린다.
  await cancelOrder(request, token as string, orders.orders[0].id);
  await waitForOrderStatus(request, token as string, orders.orders[0].id, "CANCELLED");
});

// 브라우저가 실제로 헤더를 붙이는지는 단위 테스트로 알 수 없다. 빠지면 서버가 400을
// 내므로 주문 자체가 되지 않는다.
test("browser order submission carries an Idempotency-Key header", async ({ page }) => {
  const orderKeys: (string | undefined)[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/orders")) {
      orderKeys.push(request.headers()["idempotency-key"]);
    }
  });

  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-name").fill("E2E Idempotent");
  await page.getByTestId("auth-email").fill(uniqueEmail("idem"));
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-status")).toHaveText("로그인됨");

  await page.getByTestId("fund-krw").click();
  await expect(page.getByTestId("krw-available")).toHaveText("1000000");

  await page.getByTestId("order-price").fill("5000");
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();
  await expect(page.getByTestId("order-message")).toContainText("주문 접수");

  expect(orderKeys).toHaveLength(1);
  expect(orderKeys[0]).toBeTruthy();

  // 서버 응답이 도착했으므로 다음 제출은 새 주문 의도다 — 같은 키를 쓰면 새 주문 대신
  // 이전 결과가 replay된다.
  await page.getByTestId("order-amount").fill("1");
  await page.getByTestId("submit-order").click();
  await expect
    .poll(() => orderKeys.length)
    .toBe(2);
  expect(orderKeys[1]).toBeTruthy();
  expect(orderKeys[1]).not.toBe(orderKeys[0]);
  await expect(page.getByTestId("open-order-count")).toHaveText("2");

  // 남긴 주문은 오더북에 그대로 쌓여 뒤 테스트의 체결 상대가 된다. 반드시 되돌린다.
  await cancelAllOpenOrdersFromUI(page);
});

// 응답을 받지 못한 요청의 재전송을 모사한다. 같은 키면 주문도 hold도 한 번이어야 한다.
test("duplicate order submission with the same key creates one order", async ({
  request,
}) => {
  const user = await register(request, "dup-key");
  await fundWallet(request, user.token, "KRW", "1000000");

  const key = newIdempotencyKey();
  const order = {
    coin_symbol: "BTC",
    side: "BUY" as const,
    order_type: "LIMIT" as const,
    price: "5000",
    amount: "1",
  };

  const first = await createOrder(request, user.token, order, key);
  const second = await createOrder(request, user.token, order, key);

  expect(second.order_id).toBe(first.order_id);
  expect(second.idempotent_replay).toBe(true);
  expect(first.idempotent_replay).toBeUndefined();

  const orders = await fetchOrders(request, user.token);
  expect(orders.orders.filter((o) => o.id === first.order_id)).toHaveLength(1);

  // hold도 한 번만 잡혀야 한다. 두 번이면 5002.5의 두 배가 잠긴다.
  const wallets = await fetchWallets(request, user.token);
  expect(walletBalance(wallets, "KRW")).toMatchObject({
    locked_balance: "5002.5",
    available_balance: "994997.5",
  });

  // 남긴 주문은 오더북에 그대로 쌓여 뒤 테스트의 체결 상대가 된다. 반드시 되돌린다.
  await cancelOrder(request, user.token, first.order_id);
  await waitForOrderStatus(request, user.token, first.order_id, "CANCELLED");
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
    headers: orderHeaders(user.token, newIdempotencyKey()),
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
  await waitForOrderStatus(request, owner.token, order.order_id, "CANCELLED");
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
  expect(cancelResult).toMatchObject({ status: "ACCEPTED" });
  expect(cancelResult.command_id).toBeGreaterThan(0);

  // 응답은 해제 금액을 알지 못한다 — 지갑·원장 결과로만 확인한다.
  await waitForOrderStatus(request, buyer.token, buyOrder.order_id, "CANCELLED");

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
  expect(firstCancel).toMatchObject({ status: "ACCEPTED" });

  // 최종 상태가 반영된 뒤의 재요청만 409다. 그 전에는 같은 command로 202가 돌아온다
  // — 그 창은 백엔드 통합 테스트가 고정한다.
  await waitForOrderStatus(request, buyer.token, buyOrder.order_id, "CANCELLED");

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
      // 호출마다 새 키다. 같은 사용자에게 두 번 지급하는 테스트가 여럿 있고,
      // 그것들은 재시도가 아니라 실제로 두 번 지급하려는 것이다.
      request_key: newIdempotencyKey(),
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
  // 기본값은 호출마다 새 키다 — 각 helper 호출은 서로 다른 주문 의도다.
  // 같은 키의 재전송을 검증하는 테스트만 명시적으로 키를 넘긴다.
  idempotencyKey: string = newIdempotencyKey(),
) {
  const response = await request.post(`${apiBaseURL}/orders`, {
    headers: orderHeaders(token, idempotencyKey),
    data,
  });
  if (!response.ok()) {
    throw new Error(`create order failed: ${response.status()} ${await response.text()}`);
  }
  return responseData<{ order_id: number; idempotent_replay?: boolean }>(response);
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
  expect(response.status()).toBe(202);
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

async function fetchTransfers(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseURL}/transfers?limit=20`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  return responseData<TransfersResponse>(response);
}

async function waitForTransferStatus(
  request: APIRequestContext,
  token: string,
  status: TransferResponse["status"],
) {
  let latest: TransferResponse | undefined;
  await expect
    .poll(async () => {
      const transfers = await fetchTransfers(request, token);
      latest = transfers.transfers[0];
      return latest?.status;
    })
    .toBe(status);
  return latest as TransferResponse;
}

// sendTransferCallback은 가짜 은행·가짜 체인이 우리에게 알림을 보내는 것을
// 흉내 낸다. 운영 라우트가 아니라 dev 그룹에 있으므로, /dev/wallets/fund와
// 같은 계약(로그인 토큰 + 개발자 토큰)을 요구한다.
async function sendTransferCallback(
  request: APIRequestContext,
  token: string,
  externalRef: string,
  outcome: "SUCCESS" | "FAILURE",
) {
  const response = await request.post(`${apiBaseURL}/dev/transfers/callback`, {
    headers: {
      ...authHeaders(token),
      "X-GoExchange-Dev-Token": devToolsToken,
    },
    data: {
      external_ref: externalRef,
      event_id: `e2e-callback-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      outcome,
    },
  });
  test.skip(
    response.status() === 404,
    "backend dev transfer callback endpoint is disabled; set GOEXCHANGE_ENABLE_DEV_TOOLS=true",
  );
  if (!response.ok()) {
    throw new Error(
      `transfer callback failed: ${response.status()} ${await response.text()}`,
    );
  }
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

// 이 파일의 테스트는 하나의 BTC 오더북을 공유한다. 미체결로 남긴 주문은 뒤 테스트의
// 체결 상대가 되어 그 테스트를 조용히 깨뜨리므로, 만든 주문은 되돌려 놓는다.
async function cancelAllOpenOrdersFromUI(page: Page) {
  const cancelButtons = page.locator('[data-testid^="cancel-order-"]');
  for (let remaining = await cancelButtons.count(); remaining > 0; remaining--) {
    await cancelButtons.first().click();
    await expect(cancelButtons).toHaveCount(remaining - 1);
  }
  await expect(page.getByTestId("open-order-count")).toHaveText("0");
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// 주문 생성은 Idempotency-Key를 요구한다. 없으면 400이다.
function orderHeaders(token: string, idempotencyKey: string) {
  return { ...authHeaders(token), "Idempotency-Key": idempotencyKey };
}

function newIdempotencyKey() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(role: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `e2e-${role}-${suffix}@example.com`;
}

// accounts.asset은 varchar(16)이다(백엔드 migration 009). 접미사(타임스탬프+무작위)에
// 항상 자리를 남겨야 유일성이 유지되므로, 긴 prefix는 자른다. 이전 구현은
// "E2E"+prefix+13자리 타임스탬프+6자 무작위를 그대로 이어붙여 항상 16자를
// 넘겼다 — 원장 전환 이전의 더 넓은 coin_symbol 컬럼 기준으로 짜인 채 남아 있던
// 헬퍼였다.
function uniqueCoinSymbol(prefix: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  const maxPrefixLength = Math.max(0, 16 - suffix.length);
  return `${prefix.slice(0, maxPrefixLength)}${suffix}`.toUpperCase();
}
