import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  cancelOrder,
  createOrder,
  fetchMarketRules,
  fetchOrder,
  fetchOrderBookSnapshot,
  fetchTrades,
  fetchWallets,
  isUnauthorizedError,
  orderFailureDetail,
} from "./api";

describe("apiRequest error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "AUTH_EXPIRED_TOKEN",
              message: "authorization token expired",
            },
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(fetchWallets("expired-token")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "AUTH_EXPIRED_TOKEN",
      message: "authorization token expired",
    });
  });

  it("keeps legacy string errors readable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "old error" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchWallets("token")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "old error",
    });
  });

  it("identifies unauthorized API errors", () => {
    expect(isUnauthorizedError(new ApiError(401, "AUTH_REQUIRED", "login"))).toBe(
      true,
    );
    expect(isUnauthorizedError(new ApiError(409, "CONFLICT", "conflict"))).toBe(
      false,
    );
  });

  it("fetches public market rules with the selected coin symbol", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/markets/rules?coin_symbol=BTC");
      return new Response(
        JSON.stringify({
          data: {
            coin_symbol: "BTC",
            quote_symbol: "KRW",
            trading_enabled: true,
            trading_status: "ACTIVE",
            min_order_notional: "0",
            min_order_quantity: "0.00000001",
            base_quantity_step: "0.00000001",
            fee_rate: "0.0005",
            tick_rules: [{ upper_bound: null, tick_size: "1000" }],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketRules("BTC")).resolves.toMatchObject({
      coin_symbol: "BTC",
      trading_enabled: true,
      trading_status: "ACTIVE",
      min_order_notional: "0",
      min_order_quantity: "0.00000001",
      base_quantity_step: "0.00000001",
      fee_rate: "0.0005",
    });
  });

  it("fetches the current public orderbook snapshot for a coin symbol", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/orderbook?coin_symbol=AVAX");
      return new Response(
        JSON.stringify({
          data: {
            coin_symbol: "AVAX",
            asks: [
              { price: "10200", quantity: "1" },
              { price: "10300", quantity: "1" },
            ],
            bids: [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOrderBookSnapshot("AVAX")).resolves.toMatchObject({
      coin_symbol: "AVAX",
      asks: [
        { price: "10200", quantity: "1" },
        { price: "10300", quantity: "1" },
      ],
      bids: [],
    });
  });

  it("fetches authenticated trade history with fee fields", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/trades?limit=5");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer account-token",
      );
      return new Response(
        JSON.stringify({
          data: {
            trades: [
              {
                id: 1,
                idempotency_key: "trade-key",
                engine_sequence: 11,
                engine_event_id: "trade-11",
                coin_symbol: "BTC",
                side: "BUY",
                price: "5000",
                quantity: "1",
                fee_rate: "0.0005",
                buyer_fee: "2.5",
                buyer_fee_asset: "KRW",
                seller_fee: "2.5",
                seller_fee_asset: "KRW",
                traded_at: "2026-05-26T00:00:00Z",
                buy_order_id: 2,
                sell_order_id: 1,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrades("account-token", 5)).resolves.toMatchObject({
      trades: [
        {
          side: "BUY",
          fee_rate: "0.0005",
          buyer_fee: "2.5",
          buyer_fee_asset: "KRW",
          seller_fee: "2.5",
          seller_fee_asset: "KRW",
        },
      ],
    });
  });
});

describe("cancelOrder 202 계약", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("202 접수 응답의 command_id와 ACCEPTED를 보존한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            message: "cancellation accepted",
            order_id: 42,
            command_id: 7,
            status: "ACCEPTED",
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder("token", 42);

    expect(result).toEqual({
      message: "cancellation accepted",
      order_id: 42,
      command_id: 7,
      status: "ACCEPTED",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });

  it("단건 주문 조회가 인증 헤더와 AbortSignal을 전달한다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: { order: { id: 42, status: "CANCELLED" } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const result = await fetchOrder("token", 42, controller.signal);

    expect(result.order.status).toBe("CANCELLED");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/orders/42");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(init.signal).toBe(controller.signal);
  });
});

describe("createOrder idempotency contract", () => {
  const validInput = {
    coin_symbol: "BTC",
    side: "BUY" as const,
    order_type: "LIMIT" as const,
    price: "5000",
    amount: "1",
    quote_amount: "0",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Idempotency-Key header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { message: "order accepted", order_id: 1 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOrder("token", validInput, "key-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("key-1");
  });

  // 202는 "주문은 있는데 그 뒤를 서버가 확정하지 못했다"이다. 실패로 던지면 사용자는
  // 이미 존재하는 주문을 다시 내려 한다.
  it("returns the PENDING outcome from a 202 instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { order_id: 7, status: "PENDING", idempotent_replay: true },
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(createOrder("token", validInput, "key-1")).resolves.toMatchObject({
      order_id: 7,
      status: "PENDING",
      idempotent_replay: true,
    });
  });

  // 503도 order_id와 durable outcome을 싣는다. 오류에서 이를 잃으면 사용자가 그 주문을
  // 찾아갈 수 없다.
  it("keeps order_id and status from a 503 failure body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "SERVICE_UNAVAILABLE", message: "order was not accepted" },
              data: { order_id: 9, status: "REJECTED" },
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const error = await createOrder("token", validInput, "key-1").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(orderFailureDetail(error)).toEqual({ order_id: 9, status: "REJECTED" });
  });

  it("reports no failure detail for errors without an outcome body", () => {
    expect(orderFailureDetail(new ApiError(500, "INTERNAL", "boom"))).toBeNull();
    expect(orderFailureDetail(new TypeError("Failed to fetch"))).toBeNull();
  });
});
