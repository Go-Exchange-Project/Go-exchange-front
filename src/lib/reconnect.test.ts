import { describe, expect, it } from "vitest";
import { webSocketReconnectDelay } from "./reconnect";

describe("webSocketReconnectDelay", () => {
  it("backs off exponentially and caps at the maximum delay", () => {
    expect(webSocketReconnectDelay(0)).toBe(1_000);
    expect(webSocketReconnectDelay(1)).toBe(2_000);
    expect(webSocketReconnectDelay(2)).toBe(4_000);
    expect(webSocketReconnectDelay(3)).toBe(8_000);
    expect(webSocketReconnectDelay(4)).toBe(10_000);
    expect(webSocketReconnectDelay(10)).toBe(10_000);
  });

  it("normalizes negative and fractional attempts", () => {
    expect(webSocketReconnectDelay(-1)).toBe(1_000);
    expect(webSocketReconnectDelay(1.8)).toBe(2_000);
  });
});
