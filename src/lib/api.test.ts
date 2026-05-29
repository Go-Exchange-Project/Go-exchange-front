import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchMarketRules,
  fetchTrades,
  fetchWallets,
  isUnauthorizedError,
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
          coin_symbol: "BTC",
          quote_symbol: "KRW",
          min_order_notional: "5000",
          min_order_quantity: "0.00000001",
          base_quantity_step: "0.00000001",
          fee_rate: "0.0005",
          tick_rules: [{ upper_bound: null, tick_size: "1000" }],
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
      min_order_notional: "5000",
      min_order_quantity: "0.00000001",
      base_quantity_step: "0.00000001",
      fee_rate: "0.0005",
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
              buyer_fee: "0.0005",
              buyer_fee_asset: "BTC",
              seller_fee: "2.5",
              seller_fee_asset: "KRW",
              traded_at: "2026-05-26T00:00:00Z",
              buy_order_id: 2,
              sell_order_id: 1,
            },
          ],
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
          buyer_fee: "0.0005",
          buyer_fee_asset: "BTC",
          seller_fee: "2.5",
          seller_fee_asset: "KRW",
        },
      ],
    });
  });
});
