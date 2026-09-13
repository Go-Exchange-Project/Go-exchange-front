import { useRef, useState } from "react";
import {
  ApiError,
  TransferInput,
  TransferRequest,
  isUnauthorizedError,
  requestDeposit,
  requestWithdrawal,
} from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotencyKey";

export type TransferDirection = "deposit" | "withdrawal";

interface TransferFormProps {
  token: string;
  direction: TransferDirection;
  assetOptions: string[];
  selectedAsset: string;
  onAssetChange: (asset: string) => void;
  onSubmitted: (transfer: TransferRequest) => void;
  onAuthExpired: () => void;
}

// railForAsset은 은행 레일이 KRW에만 대응한다는 백엔드 제약(rail='BANK' ⟺
// asset='KRW')을 그대로 따른다. 자산을 고르면 레일이 자동으로 정해지므로
// 사용자가 잘못된 조합을 고를 수 없다.
function railForAsset(asset: string): "BANK" | "CHAIN" {
  return asset === "KRW" ? "BANK" : "CHAIN";
}

// TransferForm은 입금·출금 모두에 쓰는 같은 모양의 폼이다. 방향(direction)만
// 다르고 나머지 입력·검증·제출 흐름은 같다.
const TransferForm = ({
  token,
  direction,
  assetOptions,
  selectedAsset,
  onAssetChange,
  onSubmitted,
  onAuthExpired,
}: TransferFormProps) => {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 응답을 받지 못한 시도의 키를 들고 있는다. OrderForm.tsx와 같은
  // pendingAttemptRef+fingerprint 패턴이지만 키를 버리는 조건은 더 단순하다
  // (OrderForm은 주문 실패 detail·408·429까지 구분한다 —
  // shouldRetainIdempotencyKeyAfterError). RequestWithdrawal은 요청·잠금
  // 분개를 먼저 커밋한 뒤에야 응답을 만든다(외부 Submit 실패 자체는 삼켜져
  // RECEIVED로 정상 응답된다 — transfer_service.go의 dispatchAndReload). 그
  // 커밋 이후, 응답을 만드는 마지막 재조회가 실패하면 요청·잠금은 이미
  // 커밋된 채로 5xx가 내려간다. 그때 키를 버리면 재시도가 새 키로 가서 서버
  // 멱등성(같은 client_request_key)을 우회해 잠금이 하나 더 생긴다.
  // 프록시·게이트웨이가 만드는 모호한 5xx도 같은 이유로 구분할 수 없다.
  // 그래서 5xx는 network error와 같게 취급해 키를 유지한다 — 4xx(서버가
  // 요청 자체를 판정해 거절함)에서만 버린다.
  const pendingAttemptRef = useRef<{ key: string; fingerprint: string } | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const rail = railForAsset(selectedAsset);
      const fingerprint = JSON.stringify({ direction, rail, asset: selectedAsset, amount });
      if (!pendingAttemptRef.current || pendingAttemptRef.current.fingerprint !== fingerprint) {
        pendingAttemptRef.current = { key: newIdempotencyKey(), fingerprint };
      }
      const clientRequestKey = pendingAttemptRef.current.key;

      const input: TransferInput = {
        rail,
        asset: selectedAsset,
        amount,
        client_request_key: clientRequestKey,
      };
      const result =
        direction === "deposit"
          ? await requestDeposit(token, input)
          : await requestWithdrawal(token, input);
      pendingAttemptRef.current = null; // 성공 — 이 시도는 끝났다
      setMessage(
        direction === "deposit"
          ? `입금 요청이 접수됐습니다 (#${result.transfer.id})`
          : `출금 요청이 접수됐습니다 (#${result.transfer.id})`,
      );
      setAmount("");
      onSubmitted(result.transfer);
    } catch (err) {
      // 4xx는 서버가 요청을 판정했다는 뜻이다 — 같은 키를 다시 보내도 같은
      // 결과가 반복되므로 버린다. network error(응답 없음)와 5xx는 요청이
      // 서버에 도달해 커밋됐을 수 있으므로 키를 유지한다.
      if (err instanceof ApiError && err.status < 500) {
        pendingAttemptRef.current = null;
      }
      if (isUnauthorizedError(err)) {
        onAuthExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-3 rounded border border-trading-border bg-muted p-3 text-xs">
      <label className="block text-muted-foreground">자산</label>
      <select
        value={selectedAsset}
        onChange={(event) => onAssetChange(event.target.value)}
        data-testid="transfer-asset"
        className="mt-1 w-full rounded border border-trading-border bg-background px-2 py-1.5 text-foreground outline-none"
      >
        {assetOptions.map((asset) => (
          <option key={asset} value={asset}>
            {asset}
          </option>
        ))}
      </select>

      <label className="mt-2 block text-muted-foreground">금액</label>
      <input
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="금액"
        data-testid="transfer-amount"
        className="mt-1 w-full rounded border border-trading-border bg-background px-2 py-1.5 text-foreground outline-none"
      />

      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting || !amount}
        data-testid={direction === "deposit" ? "submit-deposit" : "submit-withdrawal"}
        className="mt-3 w-full rounded bg-primary px-2 py-2 font-medium text-primary-foreground disabled:opacity-40"
      >
        {isSubmitting ? "처리 중..." : direction === "deposit" ? "입금 요청" : "출금 요청"}
      </button>

      {message && (
        <div className="mt-2 text-emerald-500" data-testid="transfer-message">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-2 text-destructive" data-testid="transfer-error">
          {error}
        </div>
      )}
    </div>
  );
};

export default TransferForm;
