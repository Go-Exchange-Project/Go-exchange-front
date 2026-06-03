import { describe, expect, it, vi } from "vitest";
import { fetchKRWMarketTickers, parseKRWMarketTickers } from "./upbitTicker";

describe("parseKRWMarketTickers", () => {
  it("keeps only valid KRW ticker payloads", () => {
    expect(
      parseKRWMarketTickers([
        tickerFixture({ market: "KRW-BTC" }),
        tickerFixture({ market: "BTC-ETH" }),
        tickerFixture({ trade_price: Number.NaN }),
        { market: "KRW-ETH" },
        null,
      ]),
    ).toEqual([tickerFixture({ market: "KRW-BTC" })]);
  });

  it("returns an empty list for non-array payloads", () => {
    expect(parseKRWMarketTickers({ market: "KRW-BTC" })).toEqual([]);
  });
});

describe("fetchKRWMarketTickers", () => {
  it("fetches all KRW tickers from Upbit's market ticker endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse([tickerFixture({ market: "KRW-BTC" })]),
    );

    await expect(fetchKRWMarketTickers(fetcher)).resolves.toEqual([
      tickerFixture({ market: "KRW-BTC" }),
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.upbit.com/v1/ticker/all?quote_currencies=KRW",
      { headers: { accept: "application/json" } },
    );
  });

  it("returns an empty list on HTTP errors, bad JSON, or network errors", async () => {
    await expect(
      fetchKRWMarketTickers(vi.fn().mockResolvedValue(jsonResponse([], false))),
    ).resolves.toEqual([]);
    await expect(
      fetchKRWMarketTickers(
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new Error("bad json")),
        } as Response),
      ),
    ).resolves.toEqual([]);
    await expect(
      fetchKRWMarketTickers(
        vi.fn().mockRejectedValue(new Error("network unavailable")),
      ),
    ).resolves.toEqual([]);
  });
});

function tickerFixture(overrides: Partial<ReturnType<typeof baseTicker>> = {}) {
  return {
    ...baseTicker(),
    ...overrides,
  };
}

function baseTicker() {
  return {
    market: "KRW-BTC",
    trade_price: 100000,
    signed_change_rate: 0.01,
    acc_trade_price_24h: 1000000000,
  };
}

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as Response;
}
