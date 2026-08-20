import { describe, expect, it, vi } from "vitest";

import { pollCancelOutcome } from "./cancelPolling";
import type { Order } from "./api";

function order(status: Order["status"]): Order {
  return {
    id: 42,
    coin_symbol: "BTC",
    side: "BUY",
    order_type: "LIMIT",
    status,
    price: "100",
    amount: "5",
    quote_amount: "0",
    filled_amount: "0",
    filled_quote_amount: "0",
    remaining: "5",
    created_at: "2026-08-20T00:00:00Z",
  };
}

describe("pollCancelOutcome", () => {
  it("PENDING을 지나 CANCELLED에 도달하면 그 상태를 돌려준다", async () => {
    const statuses: Order["status"][] = ["PENDING", "PENDING", "CANCELLED"];
    const fetchCurrent = vi.fn(async () => order(statuses.shift() ?? "CANCELLED"));

    const outcome = await pollCancelOutcome(fetchCurrent, new AbortController().signal, {
      intervalMs: 1,
    });

    expect(outcome).toBe("CANCELLED");
    expect(fetchCurrent).toHaveBeenCalledTimes(3);
  });

  // 취소 전에 체결된 것은 취소 실패가 아니다 — 사용자에게 다른 문구를 보여줘야 한다.
  it("PARTIAL을 지나 FILLED에 도달하면 FILLED를 돌려준다", async () => {
    const statuses: Order["status"][] = ["PARTIAL", "FILLED"];
    const fetchCurrent = vi.fn(async () => order(statuses.shift() ?? "FILLED"));

    const outcome = await pollCancelOutcome(fetchCurrent, new AbortController().signal, {
      intervalMs: 1,
    });

    expect(outcome).toBe("FILLED");
  });

  // end-to-end 상한이 없으므로 시간 초과는 실패가 아니라 "아직 처리 중"이다.
  it("시간이 초과되면 throw하지 않고 null을 돌려준다", async () => {
    const fetchCurrent = vi.fn(async () => order("PENDING"));

    const outcome = await pollCancelOutcome(fetchCurrent, new AbortController().signal, {
      intervalMs: 1,
      timeoutMs: 20,
    });

    expect(outcome).toBeNull();
    expect(fetchCurrent).toHaveBeenCalled();
  });

  it("abort되면 추가 조회 없이 null을 돌려준다", async () => {
    const controller = new AbortController();
    const fetchCurrent = vi.fn(async () => {
      controller.abort();
      return order("PENDING");
    });

    const outcome = await pollCancelOutcome(fetchCurrent, controller.signal, {
      intervalMs: 1,
    });

    expect(outcome).toBeNull();
    expect(fetchCurrent).toHaveBeenCalledTimes(1);
  });

  it("이미 abort된 signal이면 조회하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchCurrent = vi.fn(async () => order("PENDING"));

    const outcome = await pollCancelOutcome(fetchCurrent, controller.signal, {
      intervalMs: 1,
    });

    expect(outcome).toBeNull();
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  // abort로 인한 예외는 호출자에게 전파하지 않는다. 그 외 오류는 그대로 던진다.
  it("abort가 아닌 오류는 호출자에게 전파한다", async () => {
    const fetchCurrent = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      pollCancelOutcome(fetchCurrent, new AbortController().signal, { intervalMs: 1 }),
    ).rejects.toThrow("network down");
  });

  it("abort 중 발생한 오류는 삼키고 null을 돌려준다", async () => {
    const controller = new AbortController();
    const fetchCurrent = vi.fn(async () => {
      controller.abort();
      throw new Error("aborted");
    });

    const outcome = await pollCancelOutcome(fetchCurrent, controller.signal, {
      intervalMs: 1,
    });

    expect(outcome).toBeNull();
  });
});

describe("pollCancelOutcome deadline", () => {
  // deadline을 fetch 호출 전에만 검사하면, 멈춘 fetch 하나가 timeout 계약을
  // 통째로 무효화한다.
  it("진행 중인 fetch가 멈춰도 상한이 지나면 null을 돌려준다", async () => {
    const fetchCurrent = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Order>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );

    const outcome = await pollCancelOutcome(fetchCurrent, new AbortController().signal, {
      intervalMs: 1,
      timeoutMs: 20,
    });

    expect(outcome).toBeNull();
    expect(fetchCurrent).toHaveBeenCalledTimes(1);
  });

  it("호출자가 abort하면 진행 중인 fetch도 함께 끊긴다", async () => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    const fetchCurrent = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Order>((_resolve, reject) => {
          observed = signal;
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );

    const pending = pollCancelOutcome(fetchCurrent, controller.signal, {
      intervalMs: 1,
      timeoutMs: 5_000,
    });
    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(observed?.aborted).toBe(true);
  });
});
