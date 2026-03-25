interface TradingChartProps {
  symbol: string;
  currentPrice: number;
  change: number;
}

const TradingChart = ({ symbol, currentPrice, change }: TradingChartProps) => {
  const formatPrice = (p: number) => (p < 1 ? p.toFixed(4) : p.toLocaleString());

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Coin info bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-trading-border">
        <span className="text-foreground font-bold text-sm">{symbol}/KRW</span>
        <span
          className={`text-lg font-bold font-mono ${
            change >= 0 ? "text-trading-buy" : "text-trading-sell"
          }`}
        >
          {formatPrice(currentPrice)}
        </span>
        <span
          className={`text-xs font-mono ${
            change >= 0 ? "text-trading-buy" : "text-trading-sell"
          }`}
        >
          {change >= 0 ? "▲" : "▼"} {change >= 0 ? "+" : ""}{change.toFixed(2)}%
        </span>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Simulated candlestick chart background */}
        <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--trading-buy))" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(var(--trading-buy))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Simulated price line */}
          <polyline
            fill="none"
            stroke="hsl(var(--trading-buy))"
            strokeWidth="2"
            points={generateChartPoints()}
          />
          <polygon
            fill="url(#chartGrad)"
            points={`${generateChartPoints()},800,300,0,300`}
          />
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((y) => (
            <line
              key={y}
              x1="0"
              y1={`${y * 100}%`}
              x2="100%"
              y2={`${y * 100}%`}
              stroke="hsl(var(--trading-border))"
              strokeWidth="0.5"
            />
          ))}
        </svg>

        {/* Price label */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className={`px-2 py-1 rounded text-xs font-mono ${
            change >= 0 ? "bg-trading-buy text-primary-foreground" : "bg-trading-sell text-destructive-foreground"
          }`}>
            {formatPrice(currentPrice)}
          </div>
        </div>

        {/* Time labels */}
        <div className="absolute bottom-1 left-0 right-0 flex justify-between px-4 text-[10px] text-muted-foreground">
          <span>2024</span>
          <span>2024.06</span>
          <span>2025</span>
          <span>2025.03</span>
        </div>

        {/* Interval selector */}
        <div className="absolute top-2 left-2 flex gap-1">
          {["1분", "5분", "15분", "1시간", "4시간", "일", "주"].map((interval, i) => (
            <button
              key={interval}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                i === 5
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

function generateChartPoints(): string {
  const points: string[] = [];
  let price = 150;
  for (let i = 0; i <= 40; i++) {
    price += (Math.random() - 0.45) * 15;
    price = Math.max(50, Math.min(280, price));
    points.push(`${i * 20},${300 - price}`);
  }
  return points.join(" ");
}

export default TradingChart;
