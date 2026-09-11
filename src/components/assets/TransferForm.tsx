import { useState } from "react";
import {
  TransferInput,
  TransferRequest,
  isUnauthorizedError,
  requestDeposit,
  requestWithdrawal,
} from "@/lib/api";

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

  const submit = async () => {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const input: TransferInput = {
        rail: railForAsset(selectedAsset),
        asset: selectedAsset,
        amount,
        client_request_key: crypto.randomUUID(),
      };
      const result =
        direction === "deposit"
          ? await requestDeposit(token, input)
          : await requestWithdrawal(token, input);
      setMessage(
        direction === "deposit"
          ? `입금 요청이 접수됐습니다 (#${result.transfer.id})`
          : `출금 요청이 접수됐습니다 (#${result.transfer.id})`,
      );
      setAmount("");
      onSubmitted(result.transfer);
    } catch (err) {
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
      {error && <div className="mt-2 text-destructive">{error}</div>}
    </div>
  );
};

export default TransferForm;
