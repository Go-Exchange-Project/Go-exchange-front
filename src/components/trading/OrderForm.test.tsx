import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderForm from "./OrderForm";
import { createOrder } from "@/lib/api";
import type { MarketRules } from "@/lib/orderPolicy";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    createOrder: vi.fn(),
  };
});

const createOrderMock = vi.mocked(createOrder);

const marketRules: MarketRules = {
  coin_symbol: "BTC",
  quote_symbol: "KRW",
  trading_enabled: true,
  trading_status: "ACTIVE",
  min_order_notional: "5000",
  min_order_quantity: "0.00000001",
  base_quantity_step: "0.00000001",
  fee_rate: "0.0005",
  tick_rules: [{ upper_bound: null, tick_size: "1000" }],
};

const baseProps = {
  symbol: "BTC",
  currentPrice: 5000,
  price: 5000,
  onPriceChange: vi.fn(),
  authToken: "token",
  wallets: [
    {
      id: 1,
      coin_symbol: "KRW",
      available_balance: "10000",
      locked_balance: "0",
      total_balance: "10000",
      avg_buy_price: "0",
    },
    {
      id: 2,
      coin_symbol: "BTC",
      available_balance: "1",
      locked_balance: "0",
      total_balance: "1",
      avg_buy_price: "0",
    },
  ],
  marketRules,
  onAuthExpired: vi.fn(),
  onOrderAccepted: vi.fn(),
};

describe("OrderForm market orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrderMock.mockResolvedValue({ message: "order accepted", order_id: 1 });
  });

  it("submits a market buy with quote_amount as the KRW budget", async () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.click(screen.getByTestId("order-type-market"));
    expect(screen.getAllByText("시장가 매수 예산 (KRW)")).toHaveLength(1);
    expect(screen.queryByTestId("order-total")).not.toBeInTheDocument();
    expect(screen.getByTestId("market-order-note")).toHaveTextContent(
      "시장가 매수는 이 KRW 예산으로 가장 낮은 매도 호가부터 즉시 체결합니다.",
    );
    expect(screen.getByTestId("submit-order")).toHaveTextContent("시장가 매수 BTC");

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "10000" },
    });
    fireEvent.click(screen.getByTestId("submit-order"));

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledWith("token", {
        coin_symbol: "BTC",
        side: "BUY",
        order_type: "MARKET",
        price: "0",
        amount: "0",
        quote_amount: "10000",
      });
    });
  });

  it("submits a market sell with amount as the coin quantity", async () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.click(screen.getByTestId("order-side-sell"));
    fireEvent.click(screen.getByTestId("order-type-market"));
    expect(screen.getByText("시장가 매도 수량 (BTC)")).toBeInTheDocument();
    expect(screen.queryByTestId("order-total")).not.toBeInTheDocument();
    expect(screen.getByTestId("market-order-note")).toHaveTextContent(
      "오더북에 남지 않습니다",
    );
    expect(screen.getByTestId("submit-order")).toHaveTextContent("시장가 매도 BTC");

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "0.5" },
    });
    fireEvent.click(screen.getByTestId("submit-order"));

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledWith("token", {
        coin_symbol: "BTC",
        side: "SELL",
        order_type: "MARKET",
        price: "0",
        amount: "0.5",
        quote_amount: "0",
      });
    });
  });

  it("refreshes account data again after a market order can complete asynchronously", async () => {
    const onOrderAccepted = vi.fn();
    render(<OrderForm {...baseProps} onOrderAccepted={onOrderAccepted} />);

    fireEvent.click(screen.getByTestId("order-type-market"));
    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "10000" },
    });
    fireEvent.click(screen.getByTestId("submit-order"));

    await waitFor(() => {
      expect(screen.getByTestId("order-message")).toHaveTextContent(
        "시장가 주문 접수 #1",
      );
      expect(onOrderAccepted).toHaveBeenCalledTimes(1);
    });
    await waitFor(
      () => {
        expect(onOrderAccepted).toHaveBeenCalledTimes(2);
      },
      { timeout: 1000 },
    );
  });

  it("does not silently ignore percentage clicks before balances are loaded", () => {
    const onOrderAccepted = vi.fn();
    render(
      <OrderForm
        {...baseProps}
        wallets={[]}
        onOrderAccepted={onOrderAccepted}
      />,
    );

    fireEvent.click(screen.getByText("100%"));

    expect(screen.getByTestId("order-error")).toHaveTextContent(
      "KRW 주문 가능 잔고가 아직 없거나 최신 상태가 아닙니다.",
    );
    expect(onOrderAccepted).toHaveBeenCalledTimes(1);
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("blocks base quantity amounts below the market minimum", () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "0.000000001" },
    });
    expect(
      screen.getByText("수량은 최소 0.00000001 BTC 이상이어야 합니다."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("submit-order")).toBeDisabled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("blocks base quantity amounts outside the configured step", () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "1.000000015" },
    });
    expect(
      screen.getByText("수량은 0.00000001 BTC 단위에 맞아야 합니다."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("submit-order")).toBeDisabled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("includes the buyer KRW fee in the limit buy locked amount", () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "1" },
    });

    expect(screen.getByText("5,002.5 KRW")).toBeInTheDocument();
    expect(screen.getByTestId("submit-order")).not.toBeDisabled();
  });

  it("allows low-priced limit orders when KRW notional minimum is disabled", async () => {
    render(
      <OrderForm
        {...baseProps}
        symbol="XRP"
        currentPrice={1848}
        price={1848}
        wallets={[
          {
            id: 1,
            coin_symbol: "KRW",
            available_balance: "2000",
            locked_balance: "0",
            total_balance: "2000",
            avg_buy_price: "0",
          },
        ]}
        marketRules={{
          ...marketRules,
          coin_symbol: "XRP",
          min_order_notional: "0",
          min_order_quantity: "1",
          base_quantity_step: "1",
          tick_rules: [{ upper_bound: null, tick_size: "1" }],
        }}
      />,
    );

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "1" },
    });

    expect(screen.getByTestId("submit-order")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("submit-order"));

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledWith("token", {
        coin_symbol: "XRP",
        side: "BUY",
        order_type: "LIMIT",
        price: "1848",
        amount: "1",
        quote_amount: "0",
      });
    });
  });

  it("blocks order submission when the market is halted", () => {
    render(
      <OrderForm
        {...baseProps}
        marketRules={{
          ...marketRules,
          trading_enabled: false,
          trading_status: "HALTED",
        }}
      />,
    );

    expect(screen.getByTestId("market-status-warning")).toHaveTextContent(
      "BTC 거래가 현재 중지되었습니다.",
    );
    expect(screen.getByTestId("submit-order")).toHaveTextContent(
      "BTC 거래 중지",
    );
    expect(screen.getByTestId("submit-order")).toBeDisabled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });
});
