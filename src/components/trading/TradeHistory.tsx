interface Trade {
  time: string;
  price: number;
  amount: number;
  side: "buy" | "sell";
}

const mockTrades: Trade[] = [
  { time: "20:15:32", price: 106612000, amount: 0.0154, side: "buy" },
  { time: "20:15:28", price: 106611000, amount: 0.2341, side: "sell" },
  { time: "20:15:25", price: 106612000, amount: 0.0087, side: "buy" },
  { time: "20:15:21", price: 106610000, amount: 0.5123, side: "buy" },
  { time: "20:15:18", price: 106615000, amount: 0.0312, side: "sell" },
  { time: "20:15:14", price: 106608000, amount: 0.1245, side: "buy" },
  { time: "20:15:10", price: 106612000, amount: 0.0678, side: "sell" },
  { time: "20:15:06", price: 106606000, amount: 0.3456, side: "buy" },
  { time: "20:15:02", price: 106610000, amount: 0.0091, side: "sell" },
  { time: "20:14:58", price: 106612000, amount: 0.1890, side: "buy" },
];

const TradeHistory = () => {
  return (
    <div className="flex flex-col bg-card border-t border-trading-border">
      <div className="px-3 py-2 text-xs font-medium text-foreground border-b border-trading-border">
        체결내역
      </div>
      <div className="grid grid-cols-3 gap-1 px-3 py-1 text-[10px] text-muted-foreground border-b border-trading-border">
        <span>시간</span>
        <span className="text-right">가격(KRW)</span>
        <span className="text-right">수량</span>
      </div>
      <div className="overflow-y-auto max-h-40">
        {mockTrades.map((trade, i) => (
          <div key={i} className="grid grid-cols-3 gap-1 px-3 py-0.5 text-[11px] font-mono">
            <span className="text-muted-foreground">{trade.time}</span>
            <span className={`text-right ${trade.side === "buy" ? "text-trading-buy" : "text-trading-sell"}`}>
              {trade.price.toLocaleString()}
            </span>
            <span className="text-right text-foreground">{trade.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeHistory;
