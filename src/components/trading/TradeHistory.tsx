import { useState, useEffect } from "react";

interface Trade {
  time: string;
  price: number;
  amount: number;
  side: "buy" | "sell";
}

const TradeHistory = () => {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080/ws");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "trade") {
        const trade = data.data;
        setTrades((prev) =>
          [
            {
              time: new Date(trade.time).toLocaleTimeString(),
              price: parseFloat(trade.price),
              amount: parseFloat(trade.quantity),
              side: "buy" as "buy" | "sell",
            },
            ...prev,
          ].slice(0, 50),
        );
      }
    };
    return () => ws.close();
  }, []);

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
        {trades.map((trade, i) => (
          <div
            key={i}
            className="grid grid-cols-3 gap-1 px-3 py-0.5 text-[11px] font-mono"
          >
            <span className="text-muted-foreground">{trade.time}</span>
            <span
              className={`text-right ${trade.side === "buy" ? "text-trading-buy" : "text-trading-sell"}`}
            >
              {trade.price.toLocaleString()}
            </span>
            <span className="text-right text-foreground">
              {trade.amount.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeHistory;
