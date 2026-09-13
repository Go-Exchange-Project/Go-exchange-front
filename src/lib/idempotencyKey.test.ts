import { afterEach, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey } from "./idempotencyKey";

describe("newIdempotencyKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a non-empty unique value when crypto.randomUUID is available", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();

    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
  });

  it("returns a non-empty unique value when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});

    const a = newIdempotencyKey();
    const b = newIdempotencyKey();

    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
  });
});
