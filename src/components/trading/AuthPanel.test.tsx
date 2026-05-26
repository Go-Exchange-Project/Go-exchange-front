import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthPanel from "./AuthPanel";
import type { Trade } from "@/lib/api";

const baseProps = {
  token: "token",
  user: {
    id: 1,
    name: "Trader",
    email: "trader@example.com",
  },
  wallets: [],
  orders: [],
  error: null,
  selectedSymbol: "BTC",
  onAuth: vi.fn(),
  onLogout: vi.fn(),
  onAuthExpired: vi.fn(),
  onRefresh: vi.fn(),
};

describe("AuthPanel trade history", () => {
  it("shows account trades with the fee asset for the user's side", () => {
    render(
      <AuthPanel
        {...baseProps}
        trades={[
          tradeFixture({
            id: 1,
            side: "BUY",
            buyer_fee: "0.0005",
            buyer_fee_asset: "BTC",
            seller_fee: "2.5",
            seller_fee_asset: "KRW",
          }),
          tradeFixture({
            id: 2,
            side: "SELL",
            buyer_fee: "0.0005",
            buyer_fee_asset: "BTC",
            seller_fee: "2.5",
            seller_fee_asset: "KRW",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("account-trade-count")).toHaveTextContent("2");
    expect(screen.getByTestId("account-trade-fee-1")).toHaveTextContent(
      "Fee 0.0005 BTC",
    );
    expect(screen.getByTestId("account-trade-fee-2")).toHaveTextContent(
      "Fee 2.5 KRW",
    );
  });
});

function tradeFixture(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    idempotency_key: "trade-key",
    engine_sequence: 1,
    engine_event_id: "trade-1",
    coin_symbol: "BTC",
    side: "BUY",
    price: "5000",
    quantity: "1",
    fee_rate: "0.0005",
    buyer_fee: "0.0005",
    buyer_fee_asset: "BTC",
    seller_fee: "2.5",
    seller_fee_asset: "KRW",
    traded_at: "2026-05-26T00:00:00Z",
    buy_order_id: 2,
    sell_order_id: 1,
    ...overrides,
  };
}
