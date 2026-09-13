import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TransferHistory from "./TransferHistory";
import { TransferRequest } from "@/lib/api";

const baseTransfer: TransferRequest = {
  id: 1,
  direction: "WITHDRAWAL",
  rail: "BANK",
  asset: "KRW",
  amount: "1000",
  fee_amount: "0",
  status: "FAILED",
  external_ref: "FAKE-BANK-transfer:1",
  delayed: false,
  failure_reason: "",
  created_at: new Date().toISOString(),
};

describe("TransferHistory failure reason display", () => {
  it('shows "실패 · {사유}" when failure_reason is present', () => {
    render(<TransferHistory transfers={[{ ...baseTransfer, failure_reason: "ACCOUNT_FROZEN" }]} />);

    expect(screen.getByTestId("transfer-status-1")).toHaveTextContent("실패 · ACCOUNT_FROZEN");
  });

  it('shows plain "실패" when there is no failure_reason', () => {
    render(<TransferHistory transfers={[{ ...baseTransfer, failure_reason: "" }]} />);

    expect(screen.getByTestId("transfer-status-1")).toHaveTextContent("실패");
    expect(screen.getByTestId("transfer-status-1")).not.toHaveTextContent("·");
  });
});
