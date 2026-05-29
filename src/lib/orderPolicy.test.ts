import { describe, expect, it } from "vitest";
import {
  MIN_KRW_ORDER_NOTIONAL,
  addKRWTick,
  baseQuantityStep,
  fallbackKRWMarketRules,
  formatKRWPrice,
  isBaseQuantityAtLeastMinimum,
  isBaseQuantityStepAligned,
  isKRWTickAligned,
  krwTickSize,
  minOrderQuantity,
  minOrderNotional,
  subtractKRWTick,
  tradingFeeRate,
  tradingEnabled,
  tradingStatus,
} from "./orderPolicy";

describe("KRW order policy", () => {
  it("uses price-band tick sizes", () => {
    expect(krwTickSize(0.00922)).toBe(0.00001);
    expect(krwTickSize(9.99)).toBe(0.01);
    expect(krwTickSize(10)).toBe(0.1);
    expect(krwTickSize(100)).toBe(1);
    expect(krwTickSize(1000)).toBe(5);
    expect(krwTickSize(10000)).toBe(10);
    expect(krwTickSize(100000)).toBe(50);
    expect(krwTickSize(500000)).toBe(100);
    expect(krwTickSize(1000000)).toBe(500);
    expect(krwTickSize(2000000)).toBe(1000);
  });

  it("checks price alignment against the current tick", () => {
    expect(isKRWTickAligned(5000)).toBe(true);
    expect(isKRWTickAligned(5001)).toBe(false);
    expect(isKRWTickAligned(0.00922)).toBe(true);
  });

  it("increments and decrements by the current tick size", () => {
    expect(addKRWTick(5000)).toBe(5005);
    expect(subtractKRWTick(5000)).toBe(4995);
    expect(subtractKRWTick(0.00922)).toBe(0.00921);
  });

  it("formats prices with the tick precision", () => {
    expect(formatKRWPrice(5000)).toBe("5,000");
    expect(formatKRWPrice(0.00922)).toBe("0.00922");
  });

  it("defines the minimum KRW order notional", () => {
    expect(MIN_KRW_ORDER_NOTIONAL).toBe(5000);
  });

  it("can calculate from API-provided market rules", () => {
    const rules = {
      coin_symbol: "BTC",
      quote_symbol: "KRW",
      trading_enabled: true,
      trading_status: "ACTIVE",
      min_order_notional: "10000",
      min_order_quantity: "0.0001",
      base_quantity_step: "0.0001",
      fee_rate: "0.001",
      tick_rules: [
        { upper_bound: "1000", tick_size: "1" },
        { upper_bound: null, tick_size: "50" },
      ],
    };

    expect(minOrderNotional(rules)).toBe(10000);
    expect(tradingEnabled(rules)).toBe(true);
    expect(tradingStatus(rules)).toBe("ACTIVE");
    expect(minOrderQuantity(rules)).toBe(0.0001);
    expect(baseQuantityStep(rules)).toBe("0.0001");
    expect(tradingFeeRate(rules)).toBe(0.001);
    expect(krwTickSize(5000, rules)).toBe(50);
    expect(isKRWTickAligned(5050, rules)).toBe(true);
    expect(isKRWTickAligned(5051, rules)).toBe(false);
    expect(isBaseQuantityAtLeastMinimum("0.0001", rules)).toBe(true);
    expect(isBaseQuantityAtLeastMinimum("0.00009", rules)).toBe(false);
    expect(isBaseQuantityStepAligned("0.1234", rules)).toBe(true);
    expect(isBaseQuantityStepAligned("0.12345", rules)).toBe(false);
  });

  it("creates fallback rules for the selected symbol", () => {
    expect(fallbackKRWMarketRules("eth")).toMatchObject({
      coin_symbol: "ETH",
      quote_symbol: "KRW",
      trading_enabled: true,
      trading_status: "ACTIVE",
      min_order_notional: "5000",
      min_order_quantity: "0.0000001",
      base_quantity_step: "0.0000001",
      fee_rate: "0.0005",
    });
  });

  it("uses coin-specific fallback base quantity rules", () => {
    expect(fallbackKRWMarketRules("btc")).toMatchObject({
      min_order_quantity: "0.00000001",
      base_quantity_step: "0.00000001",
    });
    expect(fallbackKRWMarketRules("xrp")).toMatchObject({
      min_order_quantity: "1",
      base_quantity_step: "1",
    });
    expect(fallbackKRWMarketRules("unknown")).toMatchObject({
      min_order_quantity: "0.00000001",
      base_quantity_step: "0.00000001",
    });
  });

  it("uses coin-specific fallback trading status rules", () => {
    expect(fallbackKRWMarketRules("btc")).toMatchObject({
      trading_enabled: true,
      trading_status: "ACTIVE",
    });
    expect(fallbackKRWMarketRules("halt")).toMatchObject({
      trading_enabled: false,
      trading_status: "HALTED",
    });
    expect(fallbackKRWMarketRules("unknown")).toMatchObject({
      trading_enabled: true,
      trading_status: "ACTIVE",
    });
  });

  it("validates fallback base quantity precision without floating point rounding", () => {
    expect(isBaseQuantityStepAligned("0.00000001")).toBe(true);
    expect(isBaseQuantityStepAligned("1.000000010")).toBe(true);
    expect(isBaseQuantityStepAligned("0.000000015")).toBe(false);
    expect(isBaseQuantityAtLeastMinimum("0.00000001")).toBe(true);
    expect(isBaseQuantityAtLeastMinimum("0.000000001")).toBe(false);
  });
});
