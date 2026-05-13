import { useEffect, useRef } from "react";

interface TradingChartProps {
  symbol: string;
  currentPrice: number;
  change: number;
}

const TradingChart = ({ symbol, currentPrice, change }: TradingChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const formatPrice = (p: number) =>
    p < 1 ? p.toFixed(4) : p.toLocaleString();

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `UPBIT:${symbol}KRW`,
      interval: "D",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1",
      locale: "kr",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
    });

    containerRef.current.appendChild(script);
  }, [symbol]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-trading-border">
        <span className="text-foreground font-bold text-sm">{symbol}/KRW</span>
        <span
          className={`text-lg font-bold font-mono ${change >= 0 ? "text-trading-buy" : "text-trading-sell"}`}
        >
          {formatPrice(currentPrice)}
        </span>
        <span
          className={`text-xs font-mono ${change >= 0 ? "text-trading-buy" : "text-trading-sell"}`}
        >
          {change >= 0 ? "▲" : "▼"} {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      <div className="flex-1 relative">
        <div
          className="tradingview-widget-container"
          ref={containerRef}
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </div>
  );
};

export default TradingChart;
