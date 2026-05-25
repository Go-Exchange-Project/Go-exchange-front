import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchMarketRules, fetchWallets, isUnauthorizedError } from "./api";

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
    });
  });
});
