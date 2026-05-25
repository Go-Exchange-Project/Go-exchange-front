export interface MarketTickRule {
  upper_bound: string | null;
  tick_size: string;
}

export interface MarketRules {
  coin_symbol: string;
  quote_symbol: string;
  min_order_notional: string;
  fee_rate: string;
  tick_rules: MarketTickRule[];
}

export const MIN_KRW_ORDER_NOTIONAL = 5000;
export const DEFAULT_TRADING_FEE_RATE = 0.0005;

const KRW_TICK_RULES = [
  { upper_bound: "1", tick_size: "0.00001" },
  { upper_bound: "10", tick_size: "0.01" },
  { upper_bound: "100", tick_size: "0.1" },
  { upper_bound: "1000", tick_size: "1" },
  { upper_bound: "10000", tick_size: "5" },
  { upper_bound: "100000", tick_size: "10" },
  { upper_bound: "500000", tick_size: "50" },
  { upper_bound: "1000000", tick_size: "100" },
  { upper_bound: "2000000", tick_size: "500" },
  { upper_bound: null, tick_size: "1000" },
] as const;

export function fallbackKRWMarketRules(coinSymbol: string): MarketRules {
  return {
    coin_symbol: coinSymbol.toUpperCase(),
    quote_symbol: "KRW",
    min_order_notional: String(MIN_KRW_ORDER_NOTIONAL),
    fee_rate: String(DEFAULT_TRADING_FEE_RATE),
    tick_rules: [...KRW_TICK_RULES],
  };
}

export function minOrderNotional(rules?: MarketRules | null) {
  return Number(rules?.min_order_notional ?? MIN_KRW_ORDER_NOTIONAL);
}

export function tradingFeeRate(rules?: MarketRules | null) {
  return Number(rules?.fee_rate ?? DEFAULT_TRADING_FEE_RATE);
}

export function krwTickSize(price: number, rules?: MarketRules | null) {
  if (!Number.isFinite(price) || price <= 0) {
    return 1;
  }

  const tickRules = rules?.tick_rules?.length
    ? rules.tick_rules
    : fallbackKRWMarketRules("BTC").tick_rules;
  for (const rule of tickRules) {
    const tickSize = Number(rule.tick_size);
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
      continue;
    }
    if (rule.upper_bound === null) {
      return tickSize;
    }
    const upperBound = Number(rule.upper_bound);
    if (Number.isFinite(upperBound) && price < upperBound) {
      return tickSize;
    }
  }
  return 1;
}

export function isKRWTickAligned(price: number, rules?: MarketRules | null) {
  if (!Number.isFinite(price) || price <= 0) {
    return false;
  }

  const tick = krwTickSize(price, rules);
  const ratio = price / tick;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

export function addKRWTick(price: number, rules?: MarketRules | null) {
  return normalizeKRWPrice(price + krwTickSize(price, rules), rules);
}

export function subtractKRWTick(price: number, rules?: MarketRules | null) {
  const tick = krwTickSize(price, rules);
  return normalizeKRWPrice(Math.max(tick, price - tick), rules);
}

export function formatKRWPrice(price: number, rules?: MarketRules | null) {
  if (!Number.isFinite(price)) {
    return "";
  }

  const decimals = decimalPlaces(krwTickSize(Math.abs(price), rules));
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function normalizeKRWPrice(price: number, rules?: MarketRules | null) {
  if (!Number.isFinite(price)) {
    return 0;
  }

  const decimals = decimalPlaces(krwTickSize(Math.abs(price), rules));
  return Number(price.toFixed(decimals));
}

function decimalPlaces(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const text = value.toString();
  if (!text.includes(".")) {
    return 0;
  }
  return text.split(".")[1]?.length ?? 0;
}
