import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderForm from "./OrderForm";
import { ApiError, createOrder } from "@/lib/api";
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
      expect(createOrderMock).toHaveBeenCalledWith(
        "token",
        {
          coin_symbol: "BTC",
          side: "BUY",
          order_type: "MARKET",
          price: "0",
          amount: "0",
          quote_amount: "10000",
        },
        expect.any(String),
        expect.anything(),
      );
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
      expect(createOrderMock).toHaveBeenCalledWith(
        "token",
        {
          coin_symbol: "BTC",
          side: "SELL",
          order_type: "MARKET",
          price: "0",
          amount: "0.5",
          quote_amount: "0",
        },
        expect.any(String),
        expect.anything(),
      );
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
      expect(createOrderMock).toHaveBeenCalledWith(
        "token",
        {
          coin_symbol: "XRP",
          side: "BUY",
          order_type: "LIMIT",
          price: "1848",
          amount: "1",
          quote_amount: "0",
        },
        expect.any(String),
        expect.anything(),
      );
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

describe("OrderForm idempotency key lifecycle", () => {
  const keyOfCall = (index: number) => createOrderMock.mock.calls[index][2];

  const submitLimitBuy = (amount: string) => {
    fireEvent.change(screen.getByTestId("order-amount"), { target: { value: amount } });
    fireEvent.click(screen.getByTestId("submit-order"));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createOrderMock.mockResolvedValue({ message: "order accepted", order_id: 1 });
  });

  it("sends an idempotency key on the first order", async () => {
    render(<OrderForm {...baseProps} />);
    submitLimitBuy("1");

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    expect(keyOfCall(0)).toBeTruthy();
  });

  // 응답이 도착하지 않았으면 서버가 이미 그 주문을 만들었는지 알 수 없다. 같은 키로
  // 다시 보내야 중복 주문이 생기지 않는다.
  it("reuses the same key when the first attempt got no response", async () => {
    createOrderMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 입력이 바뀌면 다른 주문이다. 같은 키를 쓰면 서버가 409로 거절한다.
  it("creates a new key when the order inputs change", async () => {
    createOrderMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    // 잔고(10000 KRW)와 최소 주문금액(5000 KRW) 사이에 드는 수량으로 바꾼다.
    submitLimitBuy("1.5");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // 서버 응답이 도착하면 그 시도는 끝났다. 다음 제출은 새 주문 의도이므로 새 키여야
  // 한다 — 같은 키를 쓰면 새 주문 대신 이전 결과가 replay된다.
  it("creates a new key after a server response", async () => {
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));

    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // 503은 서버가 답한 것이다. REJECTED는 안내대로 새 키가 필요하고, UNKNOWN도 같은 키
  // 반복 제출로는 풀리지 않는다.
  it("creates a new key after a REJECTED 503 response", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "order was not accepted", {
        order_id: 42,
        status: "REJECTED",
      }),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it("shows the order id and outcome for a REJECTED 503", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "order was not accepted", {
        order_id: 42,
        status: "REJECTED",
      }),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");

    await waitFor(() => {
      expect(screen.getByTestId("order-error")).toHaveTextContent("주문 #42");
      expect(screen.getByTestId("order-error")).toHaveTextContent("잠금이 해제됐습니다");
    });
  });

  it("tells the user to check the order status for an UNKNOWN 503", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "state could not be finalized", {
        order_id: 43,
        status: "UNKNOWN",
      }),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");

    await waitFor(() => {
      expect(screen.getByTestId("order-error")).toHaveTextContent("주문 #43");
      expect(screen.getByTestId("order-error")).toHaveTextContent("상태를 먼저 확인");
    });
  });

  // 계정 A의 응답이 늦게 도착해 계정 B의 화면을 덮으면, B 사용자는 자기가 내지 않은
  // 주문의 결과를 보고 A 토큰으로 계정 정보가 갱신된다.
  it("discards a late response from the previous account", async () => {
    let resolveA: (value: { message: string; order_id: number }) => void = () => {};
    createOrderMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveA = resolve; }),
    );
    const onOrderAccepted = vi.fn();

    // 1) 계정 A 주문 요청 대기
    const { rerender } = render(
      <OrderForm {...baseProps} authToken="token-a" onOrderAccepted={onOrderAccepted} />,
    );
    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));

    // 2) 로그아웃 후 계정 B 로그인
    rerender(<OrderForm {...baseProps} authToken={null} onOrderAccepted={onOrderAccepted} />);
    rerender(
      <OrderForm {...baseProps} authToken="token-b" onOrderAccepted={onOrderAccepted} />,
    );
    onOrderAccepted.mockClear();

    // 3) B가 새 주문 시작
    createOrderMock.mockResolvedValueOnce({ message: "order accepted", order_id: 99 });
    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("order-message")).toHaveTextContent("주문 접수 #99"),
    );
    const acceptedForB = onOrderAccepted.mock.calls.length;

    // 4) A 요청이 뒤늦게 완료
    resolveA({ message: "order accepted", order_id: 1 });
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    // 5) A의 응답이 B의 화면을 바꾸지 않았다
    expect(screen.getByTestId("order-message")).toHaveTextContent("주문 접수 #99");
    expect(screen.queryByTestId("order-error")).not.toBeInTheDocument();
    expect(onOrderAccepted.mock.calls.length).toBe(acceptedForB);
    expect(screen.getByTestId("submit-order")).not.toHaveTextContent("제출 중");
  });

  // A의 늦은 응답이 B의 **진행 중** 제출을 풀어 버리면 B가 같은 주문을 두 번 낼 수 있다.
  it("does not clear the new account's in-flight submitting state", async () => {
    let resolveA: (value: { message: string; order_id: number }) => void = () => {};
    createOrderMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveA = resolve; }),
    );

    const { rerender } = render(<OrderForm {...baseProps} authToken="token-a" />);
    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));

    rerender(<OrderForm {...baseProps} authToken="token-b" />);

    // B의 요청은 끝나지 않는다 — 계속 "제출 중"이어야 한다.
    createOrderMock.mockImplementationOnce(() => new Promise(() => {}));
    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("submit-order")).toHaveTextContent("제출 중"),
    );

    // A가 뒤늦게 끝나도 B의 제출 상태를 건드리면 안 된다.
    resolveA({ message: "order accepted", order_id: 1 });
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId("submit-order")).toHaveTextContent("제출 중");
    expect(screen.getByTestId("submit-order")).toBeDisabled();
  });

  // 계정이 바뀌면 진행 중이던 요청을 실제로 끊는다. 세대 확인만으로는 응답을 기다린다.
  it("aborts the in-flight order request when the account changes", async () => {
    let capturedSignal: AbortSignal | undefined;
    createOrderMock.mockImplementationOnce((_token, _input, _key, signal) => {
      capturedSignal = signal as AbortSignal | undefined;
      return new Promise(() => {});
    });

    const { rerender } = render(<OrderForm {...baseProps} authToken="token-a" />);
    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    expect(capturedSignal?.aborted).toBe(false);

    rerender(<OrderForm {...baseProps} authToken="token-b" />);

    expect(capturedSignal?.aborted).toBe(true);
  });

  // 키는 계정에 묶인다. 계정이 바뀐 뒤 이전 키를 재사용하면 다른 사용자의 키가 된다.
  it("does not reuse the previous account's key after switching", async () => {
    createOrderMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { rerender } = render(<OrderForm {...baseProps} authToken="token-a" />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    rerender(<OrderForm {...baseProps} authToken="token-b" />);

    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  // 202는 주문이 존재한다는 뜻이다. 실패로 표시하면 사용자가 같은 주문을 또 낸다.
  it("does not show a 202 PENDING response as a failure", async () => {
    createOrderMock.mockResolvedValueOnce({
      order_id: 7,
      status: "PENDING",
      idempotent_replay: false,
    });
    const onOrderAccepted = vi.fn();
    render(<OrderForm {...baseProps} onOrderAccepted={onOrderAccepted} />);

    submitLimitBuy("1");

    await waitFor(() => {
      expect(screen.getByTestId("order-message")).toHaveTextContent("주문 #7");
      expect(screen.getByTestId("order-message")).toHaveTextContent("상태를 확인");
    });
    expect(screen.queryByTestId("order-error")).not.toBeInTheDocument();
    expect(onOrderAccepted).toHaveBeenCalled();
  });

  // 202 PENDING은 주문이 이미 존재한다는 뜻이다(위 테스트). 여기서 키를 버리면
  // 사용자가 다시 제출할 때 새 키로 두 번째 주문이 생긴다 — UNKNOWN과 같은 이유로
  // 키를 유지해야 한다.
  it("retains the key after a 202 PENDING response", async () => {
    createOrderMock.mockResolvedValueOnce({
      order_id: 7,
      status: "PENDING",
      idempotent_replay: false,
    });
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));

    submitLimitBuy("1");
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // UNKNOWN도 REJECTED와 달리 보상이 끝나지 않았다 — 같은 키로 재시도해도 서버가
  // 같은 상태를 돌려준다는 안내와 일관되게 키를 유지해야 한다.
  it("reuses the same key after an UNKNOWN 503 response", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "state could not be finalized", {
        order_id: 43,
        status: "UNKNOWN",
      }),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 202 PENDING 성공 응답("retains the key after a 202 PENDING response")과는 다른
  // 경로다 — 여기는 오류 응답(catch)의 data에 status: "PENDING"이 실린 경우로, 서버가
  // 확정하지 못한 상태를 오류로도 보고할 수 있다는 뜻이다. UNKNOWN과 같은 이유로
  // 키를 유지한다.
  it("reuses the same key after a 503 response carrying PENDING", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "state could not be finalized", {
        order_id: 44,
        status: "PENDING",
      }),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 본문 없는 일반 5xx(프록시·게이트웨이)는 서버가 요청을 커밋했는지 알 수 없다 —
  // network error와 같게 취급해 키를 유지한다.
  it("reuses the same key after a 5xx response with no order detail", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(502, "BAD_GATEWAY", "upstream error"),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 408·429는 서버가 요청을 판정한 결과가 아니다 — 처리 여부가 모호하거나(408)
  // 애초에 처리되지 않았다(429). 키를 버리면 실제로 처리된 요청이 새 키로 중복된다.
  it("reuses the same key after a 408 response", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(408, "REQUEST_TIMEOUT", "request timeout"),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  // 확정적 4xx(408·429 제외)는 서버가 요청 자체를 판정해 거절했다는 뜻이다. 같은
  // 키로 다시 보내도 같은 결과가 반복되므로 새 키가 필요하다.
  it("creates a new key after a definitive 4xx response", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(422, "VALIDATION_ERROR", "invalid amount"),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it("reuses the same key after a 429 response", async () => {
    createOrderMock.mockRejectedValueOnce(
      new ApiError(429, "TOO_MANY_REQUESTS", "rate limited"),
    );
    render(<OrderForm {...baseProps} />);

    submitLimitBuy("1");
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("submit-order"));
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));

    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });
});
