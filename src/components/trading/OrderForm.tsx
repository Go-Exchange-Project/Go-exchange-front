import { useState, useEffect } from "react";

interface OrderFormProps {
  symbol: string;
  currentPrice: number;
  price: number;
  onPriceChange: (price: number) => void;
}

const OrderForm = ({ symbol, currentPrice, price, onPriceChange }: OrderFormProps) => {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = price * (parseFloat(amount) || 0);

  useEffect(() => {
    onPriceChange(currentPrice);
  }, [currentPrice]);

  const handlePercentage = (pct: number) => {
    // In real app, calculate based on balance
    const mockBalance = side === "BUY" ? 10000000 : 0.5;
    if (side === "BUY" && price > 0) {
      setAmount(((mockBalance * pct) / 100 / price).toFixed(8));
    } else {
      setAmount(((mockBalance * pct) / 100).toFixed(8));
    }
  };

  const handleSubmit = async () => {
    if (!price || !parseFloat(amount)) return;
    setIsSubmitting(true);
    try {
      await fetch("http://localhost:8080/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin_symbol: symbol,
          side,
          price,
          amount: parseFloat(amount),
        }),
      });
    } catch {
      // API not available
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPrice = (p: number) => (p < 1 ? p.toFixed(4) : p.toLocaleString());

  return (
    <div className="flex flex-col h-full bg-card border-l border-trading-border">
      {/* Buy/Sell tabs */}
      <div className="flex border-b border-trading-border">
        <button
          onClick={() => setSide("BUY")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            side === "BUY"
              ? "text-trading-buy border-b-2 border-trading-buy"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          매수
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            side === "SELL"
              ? "text-trading-sell border-b-2 border-trading-sell"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          매도
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Order type */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mr-2">주문유형</span>
          {(["limit", "market"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                orderType === t
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "limit" ? "지정가" : "시장가"}
            </button>
          ))}
        </div>

        {/* Available balance */}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">주문가능</span>
          <span className="text-foreground font-mono">
            {side === "BUY" ? "10,000,000 KRW" : `0.500 ${symbol}`}
          </span>
        </div>

        {/* Price input */}
        {orderType === "limit" && (
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              {side === "BUY" ? "매수" : "매도"}가격 (KRW)
            </label>
            <div className="flex items-center border border-trading-border rounded bg-muted">
              <button
                onClick={() => onPriceChange(Math.max(0, price - (price >= 1000000 ? 1000 : 1)))}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-sm"
              >
                −
              </button>
              <input
                type="text"
                value={formatPrice(price)}
                onChange={(e) => onPriceChange(parseFloat(e.target.value.replace(/,/g, "")) || 0)}
                className="flex-1 bg-transparent text-center text-foreground font-mono text-sm outline-none py-1.5"
              />
              <button
                onClick={() => onPriceChange(price + (price >= 1000000 ? 1000 : 1))}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-sm"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Amount input */}
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">
            주문수량 ({symbol})
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-muted text-foreground font-mono text-sm px-3 py-1.5 rounded border border-trading-border outline-none focus:border-primary"
          />
        </div>

        {/* Percentage buttons */}
        <div className="grid grid-cols-4 gap-1">
          {[10, 25, 50, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentage(pct)}
              className="py-1 text-xs text-muted-foreground bg-muted rounded border border-trading-border hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Total */}
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">주문총액 (KRW)</label>
          <input
            type="text"
            value={total > 0 ? total.toLocaleString() : ""}
            readOnly
            placeholder="0"
            className="w-full bg-muted text-foreground font-mono text-sm px-3 py-1.5 rounded border border-trading-border outline-none"
          />
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !price || !parseFloat(amount)}
          className={`w-full py-3 rounded font-bold text-sm mt-auto transition-colors disabled:opacity-40 ${
            side === "BUY"
              ? "bg-trading-buy text-primary-foreground hover:opacity-90"
              : "bg-trading-sell text-destructive-foreground hover:opacity-90"
          }`}
        >
          {isSubmitting ? "주문 중..." : side === "BUY" ? `매수 ${symbol}` : `매도 ${symbol}`}
        </button>
      </div>
    </div>
  );
};

export default OrderForm;
