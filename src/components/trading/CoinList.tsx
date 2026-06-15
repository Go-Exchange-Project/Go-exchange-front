import { useState } from "react";
import { Coin } from "./types";

interface CoinListProps {
  coins: Coin[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}

const formatPrice = (price: number): string => {
  if (price < 1) return price.toFixed(4);
  return price.toLocaleString();
};

const formatVolume = (vol: number): string => {
  if (vol >= 1e12) return (vol / 1e12).toFixed(0) + "조";
  if (vol >= 1e8) return (vol / 1e8).toFixed(0) + "억";
  return vol.toLocaleString();
};

const CoinList = ({ coins, selectedSymbol, onSelect }: CoinListProps) => {
  const [search, setSearch] = useState("");

  const filtered = coins.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase()) ||
      c.nameKr.includes(search)
  );

  return (
    <div className="flex flex-col h-full bg-card border-r border-trading-border">
      {/* Search */}
      <div className="p-2">
        <input
          type="text"
          placeholder="코인명/심볼 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-muted text-foreground text-xs px-2.5 py-1.5 rounded border border-trading-border outline-none focus:border-primary placeholder:text-muted-foreground"
        />
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-1 px-2 py-1 text-[10px] text-muted-foreground border-b border-trading-border">
        <span>코인명</span>
        <span className="text-right w-20">현재가</span>
        <span className="text-right w-16">전일대비</span>
      </div>

      {/* Coin rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((coin) => (
          <div
            key={coin.symbol}
            onClick={() => onSelect(coin.symbol)}
            className={`grid grid-cols-[1fr_auto_auto] gap-1 px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-trading-surface-hover ${
              selectedSymbol === coin.symbol ? "bg-trading-surface-hover" : ""
            }`}
          >
            <div className="flex flex-col">
              <span className="text-foreground font-medium text-[11px]">{coin.nameKr}</span>
              <span className="text-muted-foreground text-[10px]">{coin.symbol}/KRW</span>
            </div>
            <span
              className={`text-right w-20 font-mono text-[11px] ${
                coin.change >= 0 ? "text-trading-buy" : "text-trading-sell"
              }`}
            >
              {formatPrice(coin.price)}
            </span>
            <span
              className={`text-right w-16 font-mono text-[11px] ${
                coin.change >= 0 ? "text-trading-buy" : "text-trading-sell"
              }`}
            >
              {coin.change >= 0 ? "+" : ""}
              {coin.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CoinList;
