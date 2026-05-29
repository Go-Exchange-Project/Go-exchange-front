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

  it("blocks base quantity amounts below the market minimum", () => {
    render(<OrderForm {...baseProps} />);

    fireEvent.change(screen.getByTestId("order-amount"), {
      target: { value: "0.000000001" },
    });
    expect(
      screen.getByText("Amount must be at least 0.00000001 BTC."),
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
      screen.getByText("Amount must align with the 0.00000001 BTC step."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("submit-order")).toBeDisabled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });
});
