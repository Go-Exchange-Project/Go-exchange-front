export interface MarketTickRule {
  upper_bound: string | null;
  tick_size: string;
}

export interface MarketRules {
  coin_symbol: string;
  quote_symbol: string;
  trading_enabled: boolean;
  trading_status: "ACTIVE" | "HALTED";
  min_order_notional: string;
  min_order_quantity: string;
  base_quantity_step: string;
  fee_rate: string;
  tick_rules: MarketTickRule[];
}

export const MIN_KRW_ORDER_NOTIONAL = 5000;
export const DEFAULT_TRADING_FEE_RATE = 0.0005;
export const DEFAULT_MIN_ORDER_QUANTITY = "0.00000001";
export const DEFAULT_BASE_QUANTITY_STEP = "0.00000001";
export const DEFAULT_TRADING_STATUS = "ACTIVE";

const MARKET_STATUSES: Record<string, MarketRules["trading_status"]> = {
  HALT: "HALTED",
};

const BASE_QUANTITY_POLICIES: Record<
  string,
  { min_order_quantity: string; base_quantity_step: string }
> = {
  BTC: {
    min_order_quantity: DEFAULT_MIN_ORDER_QUANTITY,
    base_quantity_step: DEFAULT_BASE_QUANTITY_STEP,
  },
  ETH: {
    min_order_quantity: "0.0000001",
    base_quantity_step: "0.0000001",
  },
  XRP: {
    min_order_quantity: "1",
    base_quantity_step: "1",
  },
};

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
  const normalizedSymbol = coinSymbol.toUpperCase();
  const quantityPolicy =
    BASE_QUANTITY_POLICIES[normalizedSymbol] ?? BASE_QUANTITY_POLICIES.BTC;
  const tradingStatus = MARKET_STATUSES[normalizedSymbol] ?? DEFAULT_TRADING_STATUS;

  return {
    coin_symbol: normalizedSymbol,
    quote_symbol: "KRW",
    trading_enabled: tradingStatus === "ACTIVE",
    trading_status: tradingStatus,
    min_order_notional: String(MIN_KRW_ORDER_NOTIONAL),
    min_order_quantity: quantityPolicy.min_order_quantity,
    base_quantity_step: quantityPolicy.base_quantity_step,
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

export function tradingEnabled(rules?: MarketRules | null) {
  return rules?.trading_enabled ?? true;
}

export function tradingStatus(rules?: MarketRules | null) {
  return rules?.trading_status ?? DEFAULT_TRADING_STATUS;
}

export function minOrderQuantity(rules?: MarketRules | null) {
  return Number(rules?.min_order_quantity ?? DEFAULT_MIN_ORDER_QUANTITY);
}

export function baseQuantityStep(rules?: MarketRules | null) {
  return rules?.base_quantity_step ?? DEFAULT_BASE_QUANTITY_STEP;
}

export function isBaseQuantityStepAligned(
  amount: string,
  rules?: MarketRules | null,
) {
  return isDecimalStepAligned(amount, baseQuantityStep(rules));
}

export function isBaseQuantityAtLeastMinimum(
  amount: string,
  rules?: MarketRules | null,
) {
  return compareDecimalStrings(
    amount,
    rules?.min_order_quantity ?? DEFAULT_MIN_ORDER_QUANTITY,
  ) >= 0;
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

function isDecimalStepAligned(value: string, step: string) {
  const scale = Math.max(decimalScale(value), decimalScale(step));
  const valueUnits = decimalToUnits(value, scale);
  const stepUnits = decimalToUnits(step, scale);
  if (valueUnits === null || stepUnits === null || stepUnits <= 0n) {
    return false;
  }
  return valueUnits > 0n && valueUnits % stepUnits === 0n;
}

function compareDecimalStrings(left: string, right: string) {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  const leftUnits = decimalToUnits(left, scale);
  const rightUnits = decimalToUnits(right, scale);
  if (leftUnits === null || rightUnits === null) {
    return -1;
  }
  if (leftUnits === rightUnits) {
    return 0;
  }
  return leftUnits > rightUnits ? 1 : -1;
}

function decimalScale(value: string) {
  const normalized = normalizeDecimalString(value);
  if (!normalized.includes(".")) {
    return 0;
  }
  return normalized.split(".")[1]?.length ?? 0;
}

function decimalToUnits(value: string, scale: number) {
  const normalized = normalizeDecimalString(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const [integerPart, fractionPart = ""] = normalized.split(".");
  const unitsText = `${integerPart}${fractionPart.padEnd(scale, "0")}`;
  return BigInt(unitsText || "0");
}

function normalizeDecimalString(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes(".")) {
    return trimmed;
  }
  const [integerPart, fractionPart = ""] = trimmed.split(".");
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  return normalizedFraction === "" ? integerPart : `${integerPart}.${normalizedFraction}`;
}
