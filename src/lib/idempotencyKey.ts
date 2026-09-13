// crypto.randomUUID는 secure context에만 있다. http로 IP 접속하면 없으므로 대체가
// 필요하다. OrderForm·TransferForm이 같은 규칙을 쓰도록 여기 하나로 모았다.
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
