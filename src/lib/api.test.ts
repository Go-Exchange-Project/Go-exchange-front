import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchWallets, isUnauthorizedError } from "./api";

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
});
