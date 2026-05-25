export const MIN_KRW_ORDER_NOTIONAL = 5000;

const KRW_TICK_RULES = [
  { upperBound: 1, tickSize: 0.00001 },
  { upperBound: 10, tickSize: 0.01 },
  { upperBound: 100, tickSize: 0.1 },
  { upperBound: 1000, tickSize: 1 },
  { upperBound: 10000, tickSize: 5 },
  { upperBound: 100000, tickSize: 10 },
  { upperBound: 500000, tickSize: 50 },
  { upperBound: 1000000, tickSize: 100 },
  { upperBound: 2000000, tickSize: 500 },
] as const;

const MAX_KRW_TICK_SIZE = 1000;

export function krwTickSize(price: number) {
  if (!Number.isFinite(price) || price <= 0) {
    return 1;
  }

  for (const rule of KRW_TICK_RULES) {
    if (price < rule.upperBound) {
      return rule.tickSize;
    }
  }
  return MAX_KRW_TICK_SIZE;
}

export function isKRWTickAligned(price: number) {
  if (!Number.isFinite(price) || price <= 0) {
    return false;
  }

  const tick = krwTickSize(price);
  const ratio = price / tick;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

export function addKRWTick(price: number) {
  return normalizeKRWPrice(price + krwTickSize(price));
}

export function subtractKRWTick(price: number) {
  const tick = krwTickSize(price);
  return normalizeKRWPrice(Math.max(tick, price - tick));
}

export function formatKRWPrice(price: number) {
  if (!Number.isFinite(price)) {
    return "";
  }

  const decimals = decimalPlaces(krwTickSize(Math.abs(price)));
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function normalizeKRWPrice(price: number) {
  if (!Number.isFinite(price)) {
    return 0;
  }

  const decimals = decimalPlaces(krwTickSize(Math.abs(price)));
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
