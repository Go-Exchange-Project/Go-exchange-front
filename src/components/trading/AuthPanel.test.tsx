import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthPanel from "./AuthPanel";
import type { Trade, Wallet } from "@/lib/api";

const baseProps = {
  token: "token",
  user: {
    id: 1,
    name: "Trader",
    email: "trader@example.com",
  },
  wallets: [],
  orders: [],
  trades: [],
  error: null,
  selectedSymbol: "BTC",
  marketPrices: {},
  onAuth: vi.fn(),
  onLogout: vi.fn(),
  onAuthExpired: vi.fn(),
  onRefresh: vi.fn(),
};

describe("AuthPanel balances", () => {
  it("shows active balances with available, locked, and total amounts", () => {
    render(
      <AuthPanel
        {...baseProps}
        wallets={[
          walletFixture({
            coin_symbol: "ETH",
            available_balance: "0",
            locked_balance: "0",
            total_balance: "0",
          }),
          walletFixture({
            coin_symbol: "BTC",
            available_balance: "1",
            locked_balance: "0.25",
            total_balance: "1.25",
            avg_buy_price: "90000",
          }),
          walletFixture({
            coin_symbol: "KRW",
            available_balance: "1000000",
            locked_balance: "5000",
            total_balance: "1005000",
          }),
        ]}
        marketPrices={{ BTC: 100000 }}
      />,
    );

    expect(screen.getByTestId("asset-count")).toHaveTextContent("2");
    expect(screen.getByTestId("balance-available-KRW")).toHaveTextContent(
      "1000000",
    );
    expect(screen.getByTestId("balance-locked-KRW")).toHaveTextContent("5000");
    expect(screen.getByTestId("balance-total-KRW")).toHaveTextContent("1005000");
    expect(screen.getByTestId("balance-available-BTC")).toHaveTextContent("1");
    expect(screen.getByTestId("balance-locked-BTC")).toHaveTextContent("0.25");
    expect(screen.getByTestId("balance-total-BTC")).toHaveTextContent("1.25");
    expect(screen.getByTestId("balance-avg-buy-BTC")).toHaveTextContent(
      "90000 KRW",
    );
    expect(screen.getByTestId("balance-value-BTC")).toHaveTextContent(
      "125,000 KRW",
    );
    expect(screen.getByTestId("balance-pnl-BTC")).toHaveTextContent(
      "+12,500 KRW (+11.11%)",
    );
    expect(screen.getByTestId("account-asset-value")).toHaveTextContent(
      "1,130,000 KRW",
    );
    expect(screen.getByTestId("account-unrealized-pnl")).toHaveTextContent(
      "+12,500 KRW (+11.11%)",
    );
    expect(screen.queryByTestId("balance-avg-buy-KRW")).not.toBeInTheDocument();
    expect(screen.queryByTestId("balance-row-ETH")).not.toBeInTheDocument();
  });

  it("shows asset valuation without profit and loss when average buy price is unknown", () => {
    render(
      <AuthPanel
        {...baseProps}
        wallets={[
          walletFixture({
            coin_symbol: "BTC",
            available_balance: "1",
            total_balance: "1",
            avg_buy_price: "0",
          }),
        ]}
        marketPrices={{ BTC: 100000 }}
      />,
    );

    expect(screen.getByTestId("balance-value-BTC")).toHaveTextContent(
      "100,000 KRW",
    );
    expect(screen.getByTestId("balance-pnl-BTC")).toHaveTextContent("-");
    expect(screen.getByTestId("account-asset-value")).toHaveTextContent(
      "100,000 KRW",
    );
    expect(screen.getByTestId("account-unrealized-pnl")).toHaveTextContent("-");
  });
});

describe("AuthPanel trade history", () => {
  it("shows account trades with the fee asset for the user's side", () => {
    render(
      <AuthPanel
        {...baseProps}
        trades={[
          tradeFixture({
            id: 1,
            side: "BUY",
            buyer_fee: "2.5",
            buyer_fee_asset: "KRW",
            seller_fee: "2.5",
            seller_fee_asset: "KRW",
          }),
          tradeFixture({
            id: 2,
            side: "SELL",
            buyer_fee: "2.5",
            buyer_fee_asset: "KRW",
            seller_fee: "2.5",
            seller_fee_asset: "KRW",
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("account-trade-count")).toHaveTextContent("2");
    expect(screen.getByTestId("account-trade-fee-1")).toHaveTextContent(
      "수수료 2.5 KRW",
    );
    expect(screen.getByTestId("account-trade-fee-2")).toHaveTextContent(
      "수수료 2.5 KRW",
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
    buyer_fee: "2.5",
    buyer_fee_asset: "KRW",
    seller_fee: "2.5",
    seller_fee_asset: "KRW",
    traded_at: "2026-05-26T00:00:00Z",
    buy_order_id: 2,
    sell_order_id: 1,
    ...overrides,
  };
}

function walletFixture(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 1,
    coin_symbol: "BTC",
    available_balance: "0",
    locked_balance: "0",
    total_balance: "0",
    avg_buy_price: "0",
    ...overrides,
  };
}
