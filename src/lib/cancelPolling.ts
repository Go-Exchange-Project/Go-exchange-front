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
  const deadline = Date.now() + timeoutMs;

  try {
    while (!signal.aborted && Date.now() < deadline) {
      const order = await fetchCurrent(signal);
      if (order.status === "CANCELLED" || order.status === "FILLED") {
        return order.status;
      }
      await abortableDelay(intervalMs, signal);
    }
  } catch (error) {
    // abort는 호출자가 의도한 중단이므로 오류로 전파하지 않는다.
    if (!signal.aborted) {
      throw error;
    }
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
