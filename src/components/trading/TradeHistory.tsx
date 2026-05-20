export interface TradeHistoryEntry {
  time: string;
  price: number;
  amount: number;
  side: "buy" | "sell";
  coinSymbol?: string;
}

interface TradeHistoryProps {
  trades: TradeHistoryEntry[];
}

const TradeHistory = ({ trades }: TradeHistoryProps) => {
  return (
    <div className="flex flex-col bg-card border-t border-trading-border">
      <div className="px-3 py-2 text-xs font-medium text-foreground border-b border-trading-border">
        Recent trades
      </div>
      <div className="grid grid-cols-3 gap-1 px-3 py-1 text-[10px] text-muted-foreground border-b border-trading-border">
        <span>Time</span>
        <span className="text-right">Price (KRW)</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="overflow-y-auto max-h-40">
        {trades.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            No trades yet
          </div>
        ) : (
          trades.map((trade, i) => (
            <div
              key={`${trade.time}-${trade.price}-${trade.amount}-${i}`}
              className="grid grid-cols-3 gap-1 px-3 py-0.5 text-[11px] font-mono"
            >
              <span className="text-muted-foreground">{trade.time}</span>
              <span
                className={`text-right ${
                  trade.side === "buy" ? "text-trading-buy" : "text-trading-sell"
                }`}
              >
                {trade.price.toLocaleString()}
              </span>
              <span className="text-right text-foreground">
                {trade.amount.toFixed(4)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TradeHistory;
