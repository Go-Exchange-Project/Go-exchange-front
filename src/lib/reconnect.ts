export const BASE_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 10_000;

export function webSocketReconnectDelay(attempt: number) {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(
    BASE_RECONNECT_DELAY_MS * 2 ** normalizedAttempt,
    MAX_RECONNECT_DELAY_MS,
  );
}
