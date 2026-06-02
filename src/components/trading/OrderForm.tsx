import { useEffect, useState } from "react";
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

  const normalizedAmount = normalizeDecimalInput(amount);
  const amountNumber = Number(normalizedAmount);
  const isMarketOrder = orderType === "market";
  const isMarketBuy = isMarketOrder && side === "BUY";
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
    if (!Number.isFinite(availableBalance) || availableBalance <= 0) return;

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
      setSubmitError("Login is required before placing orders.");
      return;
    }
    if (!isTradingEnabled) {
      setSubmitError(`${symbol} trading is currently ${currentTradingStatus.toLowerCase()}.`);
      return;
    }
    if (!normalizedAmount || Number(normalizedAmount) <= 0) {
      setSubmitError(
        isMarketBuy ? "Enter a valid KRW order amount." : "Enter a valid amount.",
      );
      return;
    }
    if (isLimitOrder && (!normalizedPrice || Number(normalizedPrice) <= 0)) {
      setSubmitError("Enter a valid price.");
      return;
    }
    if (isLimitOrder && !isKRWTickAligned(Number(normalizedPrice), marketRules)) {
      setSubmitError(`Price must align with the ${formatKRWPrice(tickSize, marketRules)} KRW tick.`);
      return;
    }
    if (usesBaseQuantity && !isBaseQuantityAtLeastMinimum(normalizedAmount, marketRules)) {
      setSubmitError(`Amount must be at least ${formatBalance(minimumOrderQuantity)} ${symbol}.`);
      return;
    }
    if (usesBaseQuantity && !isBaseQuantityStepAligned(normalizedAmount, marketRules)) {
      setSubmitError(`Amount must align with the ${quantityStep} ${symbol} step.`);
      return;
    }
    if ((isLimitOrder || isMarketBuy) && total < minimumOrderNotional) {
      setSubmitError(
        `Total must be at least ${minimumOrderNotional.toLocaleString()} KRW.`,
      );
      return;
    }
    if (hasInsufficientBalance) {
      setSubmitError(`Insufficient ${balanceAsset} available balance.`);
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
      setSubmitMessage(`Order accepted #${result.order_id}`);
      setAmount("");
      onOrderAccepted();
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
          Buy
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
          Sell
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-1 text-xs">
          <span className="mr-2 text-muted-foreground">Order type</span>
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
              {value === "limit" ? "Limit" : "Market"}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Available</span>
          <span className="font-mono text-foreground">
            {formatBalance(availableBalance)} {balanceAsset}
          </span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Locked</span>
          <span className="font-mono text-muted-foreground">
            {formatBalance(lockedBalance)} {balanceAsset}
          </span>
        </div>

        {!isTradingEnabled && (
          <div
            className="rounded border border-destructive/40 bg-destructive/10 px-2 py-2 text-[11px] text-destructive"
            data-testid="market-status-warning"
          >
            {symbol} trading is currently {currentTradingStatus.toLowerCase()}.
          </div>
        )}

        {orderType === "limit" && (
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Price (KRW)
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
            {isMarketBuy ? "Order amount (KRW)" : `Amount (${symbol})`}
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

        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            {isMarketBuy ? "Market buy budget (KRW)" : "Total (KRW)"}
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

        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Min total</span>
          <span className="font-mono">{minimumOrderNotional.toLocaleString()} KRW</span>
        </div>
        {isLimitOrder && (
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Tick size</span>
            <span className="font-mono">{formatKRWPrice(tickSize, marketRules)} KRW</span>
          </div>
        )}
        {usesBaseQuantity && (
          <>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Min amount</span>
              <span className="font-mono">
                {formatBalance(minimumOrderQuantity)} {symbol}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Amount step</span>
              <span className="font-mono">
                {quantityStep} {symbol}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Fee rate</span>
          <span className="font-mono">{feeRatePercent.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</span>
        </div>

        {amountNumber > 0 && (
          <div className="rounded border border-trading-border bg-muted px-2 py-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {side === "BUY" ? "KRW to lock" : `${symbol} to lock`}
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
                Available balance is not enough for this order.
              </div>
            )}
            {isBelowMinimumOrder && (
              <div className="mt-1 text-destructive">
                Total must be at least {minimumOrderNotional.toLocaleString()} KRW.
              </div>
            )}
            {isBelowMinimumQuantity && (
              <div className="mt-1 text-destructive">
                Amount must be at least {formatBalance(minimumOrderQuantity)} {symbol}.
              </div>
            )}
            {hasInvalidQuantityStep && (
              <div className="mt-1 text-destructive">
                Amount must align with the {quantityStep} {symbol} step.
              </div>
            )}
            {hasInvalidTick && (
              <div className="mt-1 text-destructive">
                Price must align with the {formatKRWPrice(tickSize, marketRules)} KRW tick.
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
            ? "Submitting..."
            : !authToken
              ? "Login required"
              : !isTradingEnabled
                ? `${symbol} trading halted`
              : `${side === "BUY" ? "Buy" : "Sell"} ${symbol}`}
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
