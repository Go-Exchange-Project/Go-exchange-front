import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TransferForm from "./TransferForm";
import { ApiError, requestWithdrawal } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    requestDeposit: vi.fn(),
    requestWithdrawal: vi.fn(),
  };
});

const requestWithdrawalMock = vi.mocked(requestWithdrawal);

const baseProps = {
  token: "token",
  direction: "withdrawal" as const,
  assetOptions: ["KRW", "BTC"],
  selectedAsset: "KRW",
  onAssetChange: vi.fn(),
  onSubmitted: vi.fn(),
  onAuthExpired: vi.fn(),
};

const acceptedTransfer = {
  id: 1,
  direction: "WITHDRAWAL" as const,
  rail: "BANK" as const,
  asset: "KRW",
  amount: "1000",
  fee_amount: "0",
  status: "PROCESSING" as const,
  external_ref: "FAKE-BANK-transfer:1",
  delayed: false,
  created_at: new Date().toISOString(),
};

describe("TransferForm client_request_key lifecycle", () => {
  const submitWithdrawal = (amount: string) => {
    fireEvent.change(screen.getByTestId("transfer-amount"), { target: { value: amount } });
    fireEvent.click(screen.getByTestId("submit-withdrawal"));
  };

  const keyOfCall = (index: number) => requestWithdrawalMock.mock.calls[index][1].client_request_key;

  beforeEach(() => {
    vi.clearAllMocks();
    requestWithdrawalMock.mockResolvedValue({ transfer: acceptedTransfer });
  });

  // 응답이 도착하지 않으면 서버가 이미 그 요청을 만들었는지 알 수 없다. 같은
  // 키로 다시 보내야 출금이 두 번 접수되지 않는다.
  it("reuses the same key when the first attempt gets no response", async () => {
    requestWithdrawalMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // RequestWithdrawal은 요청·잠금 분개를 먼저 커밋한 뒤에야 응답을 만든다 —
  // 그 커밋 이후 응답을 만드는 마지막 재조회가 실패하거나, 프록시·게이트웨이가
  // 모호한 5xx를 돌려주면 요청·잠금은 이미 커밋돼 있을 수 있다. 키를 바꾸면
  // 재시도가 잠금을 하나 더 만든다.
  it("reuses the same key after a 5xx response", async () => {
    requestWithdrawalMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "upstream error"),
    );
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 서버가 응답하면 그 시도는 끝났다. 다음 제출은 새 요청 의도이므로 새
  // 키여야 한다 — 같은 키를 쓰면 새 요청 대신 이전 결과가 replay된다.
  it("creates a new key after a successful response", async () => {
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // 4xx는 서버가 요청을 판정해 거절했다는 뜻이다. 같은 키로 다시 보내도 같은
  // 결과가 반복되므로 새 키가 필요하다.
  it("creates a new key after a 4xx response", async () => {
    requestWithdrawalMock.mockRejectedValueOnce(
      new ApiError(422, "VALIDATION", "invalid amount"),
    );
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // 입력이 바뀌면 다른 요청이다. 같은 키를 쓰면 서버가 409로 거절한다.
  it("creates a new key when the amount changes", async () => {
    requestWithdrawalMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));

    submitWithdrawal("2000");
    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // crypto.randomUUID가 없는 환경(http로 IP 접속 등)에서 그 호출이 try 밖에
  // 있으면 예외가 finally를 건너뛰어 isSubmitting이 풀리지 않는다.
  it("submits with a non-empty key and clears isSubmitting when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    render(<TransferForm {...baseProps} />);

    submitWithdrawal("1000");

    await waitFor(() => expect(requestWithdrawalMock).toHaveBeenCalledTimes(1));
    expect(keyOfCall(0)).toBeTruthy();
    // isSubmitting이 풀렸는지는 disabled만으로 볼 수 없다 — 성공 후 amount도
    // 비워져 disabled 조건(isSubmitting || !amount)이 둘 다 참일 수 있다.
    // "처리 중..." 문구가 사라졌는지로 isSubmitting 자체를 직접 본다.
    await waitFor(() =>
      expect(screen.getByTestId("submit-withdrawal")).not.toHaveTextContent("처리 중"),
    );

    vi.unstubAllGlobals();
  });
});
