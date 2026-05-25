import { describe, expect, it } from "vitest";
import {
  MIN_KRW_ORDER_NOTIONAL,
  addKRWTick,
  formatKRWPrice,
  isKRWTickAligned,
  krwTickSize,
  subtractKRWTick,
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
});
