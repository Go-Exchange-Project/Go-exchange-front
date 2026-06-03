const UPBIT_KRW_TICKER_URL =
  "https://api.upbit.com/v1/ticker/all?quote_currencies=KRW";

export interface UpbitTicker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchKRWMarketTickers(
  fetcher: Fetcher = fetch,
): Promise<UpbitTicker[]> {
  try {
    const response = await fetcher(UPBIT_KRW_TICKER_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return [];
    }

    const data = (await response.json().catch(() => [])) as unknown;
    return parseKRWMarketTickers(data);
  } catch {
    return [];
  }
}

export function parseKRWMarketTickers(data: unknown): UpbitTicker[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isKRWMarketTicker);
}

function isKRWMarketTicker(value: unknown): value is UpbitTicker {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const ticker = value as Partial<UpbitTicker>;
  return (
    typeof ticker.market === "string" &&
    ticker.market.startsWith("KRW-") &&
    typeof ticker.trade_price === "number" &&
    Number.isFinite(ticker.trade_price) &&
    typeof ticker.signed_change_rate === "number" &&
    Number.isFinite(ticker.signed_change_rate) &&
    typeof ticker.acc_trade_price_24h === "number" &&
    Number.isFinite(ticker.acc_trade_price_24h)
  );
}
