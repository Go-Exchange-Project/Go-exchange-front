import type { Order } from "./api";

/**
 * null은 실패가 아니다 — 서버가 취소를 내구 기록했지만 아직 종결 상태가 관측되지
 * 않았다는 뜻이다. 취소는 end-to-end 상한을 약속하지 않으므로 UI는 이 경우
 * "접수됨 · 처리 중"을 유지해야 한다.
 */
export type CancelOutcome = "CANCELLED" | "FILLED" | null;

const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function pollCancelOutcome(
  fetchCurrent: (signal: AbortSignal) => Promise<Order>,
  signal: AbortSignal,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<CancelOutcome> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // deadline을 호출 전에만 검사하면 진행 중인 fetch가 멈췄을 때 영원히 반환하지
  // 않는다. 내부 controller가 상한에서 그 fetch까지 끊는다. 호출자의 abort도
  // 여기로 전달해 fetchCurrent가 하나의 signal만 보게 한다.
  const deadlineController = new AbortController();
  const onCallerAbort = () => deadlineController.abort();
  if (signal.aborted) {
    deadlineController.abort();
  } else {
    signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => deadlineController.abort(), timeoutMs);
  const pollSignal = deadlineController.signal;

  try {
    while (!pollSignal.aborted) {
      const order = await fetchCurrent(pollSignal);
      if (order.status === "CANCELLED" || order.status === "FILLED") {
        return order.status;
      }
      await abortableDelay(intervalMs, pollSignal);
    }
  } catch (error) {
    // 상한 도달과 호출자 중단은 모두 의도된 종료다 — 오류로 전파하지 않는다.
    if (!pollSignal.aborted) {
      throw error;
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onCallerAbort);
  }

  return null;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    // listener를 반드시 제거한다 — polling이 길어질수록 누적된다.
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
