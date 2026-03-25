import { OrderBookEntry } from "./types";

interface OrderBookProps {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  currentPrice: number;
  change: number;
  onPriceClick: (price: number) => void;
}

const formatPrice = (price: number): string => {
  if (price < 1) return price.toFixed(4);
  return price.toLocaleString();
};

const OrderBook = ({ asks, bids, currentPrice, change, onPriceClick }: OrderBookProps) => {
  const maxAmount = Math.max(
    ...asks.map((a) => a.amount),
    ...bids.map((b) => b.amount)
  );

  return (
    <div className="flex flex-col h-full bg-card text-xs">
      {/* Header */}
      <div className="grid grid-cols-3 gap-1 px-3 py-2 text-[10px] text-muted-foreground border-b border-trading-border font-medium">
        <span>가격(KRW)</span>
        <span className="text-right">수량</span>
        <span className="text-right">누적</span>
      </div>

      {/* Asks (sell orders) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {asks.map((entry, i) => {
          const barWidth = (entry.amount / maxAmount) * 100;
          return (
            <div
              key={`ask-${i}`}
              onClick={() => onPriceClick(entry.price)}
              className="relative grid grid-cols-3 gap-1 px-3 py-0.5 cursor-pointer hover:bg-trading-surface-hover"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-trading-sell/10"
                style={{ width: `${barWidth}%` }}
              />
              <span className="relative text-trading-sell font-mono">{formatPrice(entry.price)}</span>
              <span className="relative text-right text-foreground font-mono">{entry.amount.toFixed(3)}</span>
              <span className="relative text-right text-muted-foreground font-mono">
                {asks
                  .slice(i)
                  .reduce((s, e) => s + e.amount, 0)
                  .toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current price */}
      <div className="px-3 py-2 border-y border-trading-border flex items-center justify-between">
        <span
          className={`text-base font-bold font-mono ${
            change >= 0 ? "text-trading-buy" : "text-trading-sell"
          }`}
        >
          {formatPrice(currentPrice)}
        </span>
        <span
          className={`text-[11px] font-mono ${
            change >= 0 ? "text-trading-buy" : "text-trading-sell"
          }`}
        >
          {change >= 0 ? "+" : ""}{change.toFixed(2)}%
        </span>
      </div>

      {/* Bids (buy orders) */}
      <div className="flex-1 overflow-hidden">
        {bids.map((entry, i) => {
          const barWidth = (entry.amount / maxAmount) * 100;
          return (
            <div
              key={`bid-${i}`}
              onClick={() => onPriceClick(entry.price)}
              className="relative grid grid-cols-3 gap-1 px-3 py-0.5 cursor-pointer hover:bg-trading-surface-hover"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-trading-buy/10"
                style={{ width: `${barWidth}%` }}
              />
              <span className="relative text-trading-buy font-mono">{formatPrice(entry.price)}</span>
              <span className="relative text-right text-foreground font-mono">{entry.amount.toFixed(3)}</span>
              <span className="relative text-right text-muted-foreground font-mono">
                {bids
                  .slice(0, i + 1)
                  .reduce((s, e) => s + e.amount, 0)
                  .toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderBook;
