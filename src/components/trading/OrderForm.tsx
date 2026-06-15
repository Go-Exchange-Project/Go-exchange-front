import { useEffect, useRef, useState } from "react";
import { Wallet, createOrder, isUnauthorizedError } from "@/lib/api";
import {
  MarketRules,
  addKRWTick,
  baseQuantityStep,
  formatKRWPrice,
  isBaseQuantityAtLeastMinimum,
  isBaseQuantityStepAligned,
  isKRWTickAligned,
  krwTickSize,
  minOrderQuantity,
  minOrderNotional,
  subtractKRWTick,
  tradingEnabled,
  tradingFeeRate,
  tradingStatus,
} from "@/lib/orderPolicy";

interface OrderFormProps {
  symbol: string;
  currentPrice: number;
  price: number;
  onPriceChange: (price: number) => void;
  authToken: string | null;
  wallets: Wallet[];
  marketRules: MarketRules;
  onAuthExpired: () => void;
  onOrderAccepted: () => void;
}

const OrderForm = ({
  symbol,
  currentPrice,
  price,
  onPriceChange,
  authToken,
  wallets,
  marketRules,
  onAuthExpired,
  onOrderAccepted,
}: OrderFormProps) => {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [amount, setAmount] = useState("");
  const [rawPrice, setRawPrice] = useState(String(price));
  const [userEditedPrice, setUserEditedPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const marketRefreshTimerRef = useRef<number | null>(null);

  const normalizedAmount = normalizeDecimalInput(amount);
  const amountNumber = Number(normalizedAmount);
  const isMarketOrder = orderType === "market";
  const isMarketBuy = isMarketOrder && side === "BUY";
  const isMarketSell = isMarketOrder && side === "SELL";
  const isLimitOrder = orderType === "limit";
  const usesBaseQuantity = !isMarketBuy;
  const total = isMarketBuy
    ? Number.isFinite(amountNumber)
      ? amountNumber
      : 0
    : price * (Number.isFinite(amountNumber) ? amountNumber : 0);
  const minimumOrderNotional = minOrderNotional(marketRules);
  const minimumOrderQuantity = minOrderQuantity(marketRules);
  const quantityStep = baseQuantityStep(marketRules);
  const isTradingEnabled = tradingEnabled(marketRules);
  const currentTradingStatus = tradingStatus(marketRules);
  const feeRate = tradingFeeRate(marketRules);
  const feeRatePercent = Number.isFinite(feeRate) ? feeRate * 100 : 0;
  const feeMultiplier = 1 + (Number.isFinite(feeRate) ? feeRate : 0);
  const estimatedBuyFee =
    side === "BUY" && isLimitOrder && Number.isFinite(total) ? total * feeRate : 0;
  const tickSize = krwTickSize(price, marketRules);
  const hasInvalidTick =
    isLimitOrder && price > 0 && !isKRWTickAligned(price, marketRules);
  const isBelowMinimumOrder =
    (isLimitOrder || isMarketBuy) &&
    amountNumber > 0 &&
    Number.isFinite(total) &&
    total > 0 &&
    total < minimumOrderNotional;
  const hasInvalidQuantityStep =
    usesBaseQuantity &&
    amountNumber > 0 &&
    normalizedAmount !== "" &&
    !isBaseQuantityStepAligned(normalizedAmount, marketRules);
  const isBelowMinimumQuantity =
    usesBaseQuantity &&
    amountNumber > 0 &&
    normalizedAmount !== "" &&
    !isBaseQuantityAtLeastMinimum(normalizedAmount, marketRules);
  const selectedWallet = wallets.find((wallet) =>
    side === "BUY" ? wallet.coin_symbol === "KRW" : wallet.coin_symbol === symbol,
  );
  const availableBalance = Number(selectedWallet?.available_balance ?? 0);
  const lockedBalance = Number(selectedWallet?.locked_balance ?? 0);
  const requiredBalance =
    side === "BUY" ? (isMarketBuy ? total : total + estimatedBuyFee) : amountNumber;
  const balanceAsset = side === "BUY" ? "KRW" : symbol;
  const hasInsufficientBalance =
    !!authToken &&
    amountNumber > 0 &&
    Number.isFinite(requiredBalance) &&
    requiredBalance > availableBalance;
  const amountLabel = isMarketBuy
    ? "시장가 매수 예산 (KRW)"
    : isMarketSell
      ? `시장가 매도 수량 (${symbol})`
      : `수량 (${symbol})`;
  const shouldShowTotalField = isLimitOrder;
  const shouldShowMinimumNotional = isLimitOrder || isMarketBuy;
  const marketOrderNote = isMarketBuy
    ? "시장가 매수는 이 KRW 예산으로 가장 낮은 매도 호가부터 즉시 체결합니다. 남은 KRW는 자동으로 반환됩니다."
    : isMarketSell
      ? `시장가 매도는 입력한 ${symbol} 수량을 가장 높은 매수 호가부터 즉시 체결합니다. 미체결 ${symbol}은 자동 반환되며 오더북에 남지 않습니다.`
      : "";

  useEffect(() => {
    return () => {
      if (marketRefreshTimerRef.current !== null) {
        window.clearTimeout(marketRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userEditedPrice) {
      onPriceChange(currentPrice);
      setRawPrice(formatKRWPrice(currentPrice, marketRules));
    }
  }, [currentPrice, marketRules, onPriceChange, userEditedPrice]);

  useEffect(() => {
    if (!userEditedPrice) {
      setRawPrice(formatKRWPrice(price, marketRules));
    }
  }, [marketRules, price, userEditedPrice]);

  const handlePercentage = (pct: number) => {
    setSubmitMessage(null);
    if (!authToken) {
      setSubmitError("비율 버튼을 사용하려면 로그인이 필요합니다.");
      return;
    }
    if (!Number.isFinite(availableBalance) || availableBalance <= 0) {
      setSubmitError(
        `${balanceAsset} 주문 가능 잔고가 아직 없거나 최신 상태가 아닙니다. 계정 정보를 다시 불러온 뒤 한 번 더 눌러 주세요.`,
      );
      onOrderAccepted();
      return;
    }
    setSubmitError(null);

    if (isMarketBuy) {
      setAmount(((availableBalance * pct) / 100).toFixed(0));
      return;
    }
    if (side === "BUY" && price > 0) {
      setAmount(((availableBalance * pct) / 100 / price / feeMultiplier).toFixed(8));
      return;
    }
    setAmount(((availableBalance * pct) / 100).toFixed(8));
  };

  const selectOrderType = (value: "limit" | "market") => {
    setOrderType(value);
    setAmount("");
    setSubmitMessage(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    const normalizedPrice = normalizeDecimalInput(rawPrice) || String(price);
    setSubmitMessage(null);
    setSubmitError(null);

    if (!authToken) {
      setSubmitError("주문하려면 로그인이 필요합니다.");
      return;
    }
    if (!isTradingEnabled) {
      setSubmitError(`${symbol} 거래가 현재 중지되었습니다.`);
      return;
    }
    if (!normalizedAmount || Number(normalizedAmount) <= 0) {
      setSubmitError(
        isMarketBuy ? "올바른 KRW 주문 예산을 입력해 주세요." : "올바른 수량을 입력해 주세요.",
      );
      return;
    }
    if (isLimitOrder && (!normalizedPrice || Number(normalizedPrice) <= 0)) {
      setSubmitError("올바른 가격을 입력해 주세요.");
      return;
    }
    if (isLimitOrder && !isKRWTickAligned(Number(normalizedPrice), marketRules)) {
      setSubmitError(`가격은 ${formatKRWPrice(tickSize, marketRules)} KRW 단위에 맞아야 합니다.`);
      return;
    }
    if (usesBaseQuantity && !isBaseQuantityAtLeastMinimum(normalizedAmount, marketRules)) {
      setSubmitError(`수량은 최소 ${formatBalance(minimumOrderQuantity)} ${symbol} 이상이어야 합니다.`);
      return;
    }
    if (usesBaseQuantity && !isBaseQuantityStepAligned(normalizedAmount, marketRules)) {
      setSubmitError(`수량은 ${quantityStep} ${symbol} 단위에 맞아야 합니다.`);
      return;
    }
    if ((isLimitOrder || isMarketBuy) && total < minimumOrderNotional) {
      setSubmitError(
        `주문 금액은 최소 ${minimumOrderNotional.toLocaleString()} KRW 이상이어야 합니다.`,
      );
      return;
    }
    if (hasInsufficientBalance) {
      setSubmitError(`주문 가능한 ${balanceAsset} 잔고가 부족합니다.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createOrder(authToken, {
        coin_symbol: symbol,
        side,
        order_type: isMarketOrder ? "MARKET" : "LIMIT",
        price: isMarketOrder ? "0" : normalizedPrice,
        amount: isMarketBuy ? "0" : normalizedAmount,
        quote_amount: isMarketBuy ? normalizedAmount : "0",
      });
      setSubmitMessage(
        isMarketOrder
          ? `시장가 주문 접수 #${result.order_id}. 미체결 ${
              isMarketBuy ? "KRW" : symbol
            }는 자동으로 반환됩니다.`
          : `주문 접수 #${result.order_id}`,
      );
      setAmount("");
      onOrderAccepted();
      if (isMarketOrder) {
        if (marketRefreshTimerRef.current !== null) {
          window.clearTimeout(marketRefreshTimerRef.current);
        }
        marketRefreshTimerRef.current = window.setTimeout(() => {
          onOrderAccepted();
          marketRefreshTimerRef.current = null;
        }, 500);
      }
    } catch (err) {
      if (isUnauthorizedError(err)) {
        onAuthExpired();
        return;
      }
      setSubmitError(err instanceof Error ? err.message : "Order request failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col bg-card">
      <div className="flex border-b border-trading-border">
        <button
          onClick={() => setSide("BUY")}
          data-testid="order-side-buy"
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            side === "BUY"
              ? "border-b-2 border-trading-buy text-trading-buy"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          매수
        </button>
        <button
          onClick={() => setSide("SELL")}
          data-testid="order-side-sell"
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            side === "SELL"
              ? "border-b-2 border-trading-sell text-trading-sell"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          매도
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-1 text-xs">
          <span className="mr-2 text-muted-foreground">주문 유형</span>
          {(["limit", "market"] as const).map((value) => (
            <button
              key={value}
              onClick={() => selectOrderType(value)}
              data-testid={`order-type-${value}`}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                orderType === value
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "limit" ? "지정가" : "시장가"}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">주문 가능</span>
          <span className="font-mono text-foreground">
            {formatBalance(availableBalance)} {balanceAsset}
          </span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">잠금</span>
          <span className="font-mono text-muted-foreground">
            {formatBalance(lockedBalance)} {balanceAsset}
          </span>
        </div>

        {!isTradingEnabled && (
          <div
            className="rounded border border-destructive/40 bg-destructive/10 px-2 py-2 text-[11px] text-destructive"
            data-testid="market-status-warning"
          >
            {symbol} 거래가 현재 중지되었습니다.
          </div>
        )}

        {orderType === "limit" && (
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              가격 (KRW)
            </label>
            <div className="flex items-center rounded border border-trading-border bg-muted">
              <button
                type="button"
                onClick={() => {
                  const nextPrice = subtractKRWTick(price, marketRules);
                  setUserEditedPrice(true);
                  setRawPrice(formatKRWPrice(nextPrice, marketRules));
                  onPriceChange(nextPrice);
                }}
                className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                -
              </button>
              <input
                type="text"
                value={rawPrice}
                data-testid="order-price"
                onChange={(event) => {
                  setUserEditedPrice(true);
                  setRawPrice(event.target.value);
                  onPriceChange(
                    Number(normalizeDecimalInput(event.target.value)) || 0,
                  );
                }}
                onBlur={() => setRawPrice(formatKRWPrice(price, marketRules))}
                className="flex-1 bg-transparent py-1.5 text-center font-mono text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const nextPrice = addKRWTick(price, marketRules);
                  setUserEditedPrice(true);
                  setRawPrice(formatKRWPrice(nextPrice, marketRules));
                  onPriceChange(nextPrice);
                }}
                className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                +
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            {amountLabel}
          </label>
          <input
            type="text"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
            data-testid="order-amount"
            className="w-full rounded border border-trading-border bg-muted px-3 py-1.5 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[10, 25, 50, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentage(pct)}
              className="rounded border border-trading-border bg-muted py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
            >
              {pct}%
            </button>
          ))}
        </div>

        {shouldShowTotalField && (
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              총 주문 금액 (KRW)
            </label>
            <input
              type="text"
              value={total > 0 ? total.toLocaleString() : ""}
              readOnly
              placeholder="0"
              data-testid="order-total"
              className="w-full rounded border border-trading-border bg-muted px-3 py-1.5 font-mono text-sm text-foreground outline-none"
            />
          </div>
        )}

        {isMarketOrder && (
          <div
            className="rounded border border-trading-border bg-muted px-2 py-2 text-[11px] text-muted-foreground"
            data-testid="market-order-note"
          >
            {marketOrderNote}
          </div>
        )}
        {shouldShowMinimumNotional && (
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{isMarketBuy ? "최소 예산" : "최소 주문 금액"}</span>
            <span className="font-mono">{minimumOrderNotional.toLocaleString()} KRW</span>
          </div>
        )}
        {isLimitOrder && (
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>호가 단위</span>
            <span className="font-mono">{formatKRWPrice(tickSize, marketRules)} KRW</span>
          </div>
        )}
        {usesBaseQuantity && (
          <>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>최소 수량</span>
              <span className="font-mono">
                {formatBalance(minimumOrderQuantity)} {symbol}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>수량 단위</span>
              <span className="font-mono">
                {quantityStep} {symbol}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>수수료율</span>
          <span className="font-mono">{feeRatePercent.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</span>
        </div>

        {amountNumber > 0 && (
          <div className="rounded border border-trading-border bg-muted px-2 py-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {side === "BUY" ? "잠글 KRW" : `잠글 ${symbol}`}
              </span>
              <span
                className={`font-mono ${
                  hasInsufficientBalance ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatBalance(requiredBalance)} {balanceAsset}
              </span>
            </div>
            {hasInsufficientBalance && (
              <div className="mt-1 text-destructive">
                주문 가능한 잔고가 부족합니다.
              </div>
            )}
            {isBelowMinimumOrder && (
              <div className="mt-1 text-destructive">
                주문 금액은 최소 {minimumOrderNotional.toLocaleString()} KRW 이상이어야 합니다.
              </div>
            )}
            {isBelowMinimumQuantity && (
              <div className="mt-1 text-destructive">
                수량은 최소 {formatBalance(minimumOrderQuantity)} {symbol} 이상이어야 합니다.
              </div>
            )}
            {hasInvalidQuantityStep && (
              <div className="mt-1 text-destructive">
                수량은 {quantityStep} {symbol} 단위에 맞아야 합니다.
              </div>
            )}
            {hasInvalidTick && (
              <div className="mt-1 text-destructive">
                가격은 {formatKRWPrice(tickSize, marketRules)} KRW 단위에 맞아야 합니다.
              </div>
            )}
          </div>
        )}

        {submitError && (
          <div className="text-[11px] text-destructive" data-testid="order-error">
            {submitError}
          </div>
        )}
        {submitMessage && (
          <div className="text-[11px] text-emerald-500" data-testid="order-message">
            {submitMessage}
          </div>
        )}

        <button
          onClick={handleSubmit}
          data-testid="submit-order"
          disabled={
            isSubmitting ||
            !authToken ||
            !isTradingEnabled ||
            (isLimitOrder && !price) ||
            !(amountNumber > 0) ||
            hasInvalidTick ||
            isBelowMinimumOrder ||
            isBelowMinimumQuantity ||
            hasInvalidQuantityStep ||
            hasInsufficientBalance
          }
          className={`mt-auto w-full rounded py-3 text-sm font-bold transition-colors disabled:opacity-40 ${
            side === "BUY"
              ? "bg-trading-buy text-primary-foreground hover:opacity-90"
              : "bg-trading-sell text-destructive-foreground hover:opacity-90"
          }`}
        >
          {isSubmitting
            ? "제출 중..."
            : !authToken
              ? "로그인 필요"
              : !isTradingEnabled
                ? `${symbol} 거래 중지`
                : `${isMarketOrder ? "시장가 " : ""}${side === "BUY" ? "매수" : "매도"} ${symbol}`}
        </button>
      </div>
    </div>
  );
};

const normalizeDecimalInput = (value: string) => value.replace(/,/g, "").trim();

const formatBalance = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value < 1 ? value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : value.toLocaleString();
};

export default OrderForm;
