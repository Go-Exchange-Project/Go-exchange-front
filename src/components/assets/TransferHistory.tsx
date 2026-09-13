import { TransferRequest } from "@/lib/api";

interface TransferHistoryProps {
  transfers: TransferRequest[];
}

// transferStatusLabel은 백엔드 설계 §8.7을 따른다: PROCESSING+확인 표시가 있으면
// "처리 지연", COMPLETED는 완료다. §8.7에 명시가 없는 RECEIVED와 확인 표시 없는
// PROCESSING은 중립적인 문구로 채운다 — 운영자용 사유(review_reason 등)는
// 애초에 응답에 없으므로 이 함수가 볼 수도 없다. FAILED는 failure_reason이
// 있으면 함께 보여준다 — 그건 review_reason과 달리 사용자에게 공개해도 되는
// 사유다.
function transferStatusLabel(transfer: TransferRequest): string {
  switch (transfer.status) {
    case "RECEIVED":
      return "접수됨 · 처리 대기";
    case "PROCESSING":
      return transfer.delayed ? "처리 지연 · 외부 상태 자동 확인 중" : "처리 중";
    case "COMPLETED":
      return "완료";
    case "FAILED":
      return transfer.failure_reason ? `실패 · ${transfer.failure_reason}` : "실패";
    default:
      return transfer.status;
  }
}

const TransferHistory = ({ transfers }: TransferHistoryProps) => {
  if (transfers.length === 0) {
    return (
      <div className="mt-3 rounded border border-trading-border bg-muted p-3 text-xs text-muted-foreground">
        처리 내역 없음
      </div>
    );
  }

  return (
    <div className="mt-3 rounded border border-trading-border bg-muted">
      {transfers.map((transfer) => (
        <div
          key={transfer.id}
          data-testid="transfer-row"
          className="flex items-center justify-between border-b border-trading-border/60 px-3 py-2 text-xs last:border-b-0"
        >
          <div>
            <div className="font-medium text-foreground">
              {transfer.direction === "DEPOSIT" ? "입금" : "출금"} {transfer.asset}
            </div>
            <div className="font-mono text-muted-foreground">{transfer.amount}</div>
          </div>
          <div className="text-muted-foreground" data-testid={`transfer-status-${transfer.id}`}>
            {transferStatusLabel(transfer)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransferHistory;
