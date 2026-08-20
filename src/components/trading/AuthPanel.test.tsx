import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthPanel from "./AuthPanel";
import * as api from "@/lib/api";
import * as cancelPolling from "@/lib/cancelPolling";
import type { Order, Trade, Wallet } from "@/lib/api";

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
      "90,000 KRW",
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

  it("formats a finite-precision average buy price without exposing decimal noise", () => {
    render(
      <AuthPanel
        {...baseProps}
        wallets={[
          walletFixture({
            coin_symbol: "BTC",
            available_balance: "1",
            total_balance: "1",
            avg_buy_price: "50000010.9999999999999999",
          }),
        ]}
        marketPrices={{ BTC: 100000 }}
      />,
    );

    const avgBuyPrice = screen.getByTestId("balance-avg-buy-BTC");
    expect(avgBuyPrice).not.toHaveTextContent(
      "50000010.9999999999999999",
    );
    expect(avgBuyPrice).toHaveTextContent("50,000,011 KRW");
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

describe("AuthPanel 취소 접수와 최종 상태 표시", () => {
  const openOrder: Order = {
    id: 42,
    coin_symbol: "BTC",
    side: "BUY",
    order_type: "LIMIT",
    status: "PENDING",
    price: "100",
    amount: "5",
    quote_amount: "0",
    filled_amount: "0",
    filled_quote_amount: "0",
    remaining: "5",
    created_at: "2026-08-20T00:00:00Z",
  };

  const acceptance = {
    message: "cancellation accepted",
    order_id: 42,
    command_id: 7,
    status: "ACCEPTED" as const,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const clickCancel = () => {
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));
  };

  it("202 직후에는 접수됨을 표시한다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    clickCancel();

    expect(await screen.findByText(/취소 요청 접수됨/)).toBeInTheDocument();
    // 이 응답은 해제 금액을 알지 못한다 — undefined가 화면에 나오면 안 된다.
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("CANCELLED에 도달하면 취소 완료를 표시한다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockResolvedValue("CANCELLED");

    render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    clickCancel();

    expect(await screen.findByText(/취소 완료/)).toBeInTheDocument();
  });

  it("FILLED면 취소 전에 체결됐음을 알리고 실패로 표시하지 않는다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockResolvedValue("FILLED");

    render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    clickCancel();

    expect(await screen.findByText(/취소 전에 체결/)).toBeInTheDocument();
    expect(screen.queryByText(/실패/)).not.toBeInTheDocument();
  });

  it("시간이 초과되면 처리 중 상태를 유지한다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockResolvedValue(null);

    render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    clickCancel();

    expect(await screen.findByText(/처리 중/)).toBeInTheDocument();
    expect(screen.queryByText(/실패/)).not.toBeInTheDocument();
  });

  it("unmount되면 polling을 중단한다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockImplementation(
      (_fetchCurrent, signal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      },
    );

    const { unmount } = render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    clickCancel();
    await screen.findByText(/취소 요청 접수됨/);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe("AuthPanel 계정 전환 시 취소 polling 정리", () => {
  const openOrder: Order = {
    id: 42,
    coin_symbol: "BTC",
    side: "BUY",
    order_type: "LIMIT",
    status: "PENDING",
    price: "100",
    amount: "5",
    quote_amount: "0",
    filled_amount: "0",
    filled_quote_amount: "0",
    remaining: "5",
    created_at: "2026-08-20T00:00:00Z",
  };

  const acceptance = {
    message: "cancellation accepted",
    order_id: 42,
    command_id: 7,
    status: "ACCEPTED" as const,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 로그아웃해도 이 컴포넌트는 mount된 채 props만 바뀐다. 이전 계정의 polling이
  // 살아 있으면 재로그인한 계정 화면을 이전 계정 데이터로 덮어쓴다.
  it("token이 null로 바뀌면 진행 중인 polling을 중단한다", async () => {
    vi.spyOn(api, "cancelOrder").mockResolvedValue(acceptance);
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockImplementation(
      (_fetchCurrent, signal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      },
    );

    const { rerender } = render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));
    await screen.findByText(/취소 요청 접수됨/);

    rerender(<AuthPanel {...baseProps} token={null} user={null} orders={[]} />);

    expect(capturedSignal?.aborted).toBe(true);
  });

  // cancelOrder가 반환되기 전에 로그아웃하면, 그 뒤의 상태 갱신은 남의 계정 화면을
  // 건드리는 것이다.
  it("cancelOrder 응답 전에 로그아웃하면 접수 문구를 남기지 않는다", async () => {
    let resolveCancel: (value: typeof acceptance) => void = () => {};
    vi.spyOn(api, "cancelOrder").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const pollSpy = vi
      .spyOn(cancelPolling, "pollCancelOutcome")
      .mockImplementation(() => new Promise(() => {}));
    const onRefresh = vi.fn();

    const { rerender } = render(
      <AuthPanel {...baseProps} orders={[openOrder]} onRefresh={onRefresh} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));

    rerender(
      <AuthPanel {...baseProps} token={null} user={null} orders={[]} onRefresh={onRefresh} />,
    );
    resolveCancel(acceptance);
    await Promise.resolve();

    expect(pollSpy).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // 뒤늦게 반환한 이전 요청의 finally가 현재 취소의 진행 상태까지 지우면,
  // 아직 처리 중인 취소의 버튼이 다시 눌리게 된다.
  it("이전 계정의 요청이 뒤늦게 끝나도 현재 취소의 진행 상태를 지우지 않는다", async () => {
    const resolvers: Array<(value: typeof acceptance) => void> = [];
    vi.spyOn(api, "cancelOrder").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.spyOn(cancelPolling, "pollCancelOutcome").mockImplementation(
      () => new Promise(() => {}),
    );

    const { rerender } = render(<AuthPanel {...baseProps} orders={[openOrder]} />);
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));

    // 로그아웃 후 다른 계정으로 재로그인하고, 그 계정의 주문을 취소한다.
    rerender(<AuthPanel {...baseProps} token={null} user={null} orders={[]} />);
    const otherOrder: Order = { ...openOrder, id: 77 };
    rerender(
      <AuthPanel
        {...baseProps}
        token="token-b"
        user={{ id: 2, name: "Other", email: "other@example.com" }}
        orders={[otherOrder]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));
    expect(screen.getByRole("button", { name: /취소/ })).toBeDisabled();

    // 계정 A의 요청이 이제서야 반환된다.
    resolvers[0](acceptance);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByRole("button", { name: /취소/ })).toBeDisabled();
  });
});
