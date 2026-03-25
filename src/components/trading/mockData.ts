import { Coin, OrderBookEntry } from "./types";

export const mockCoins: Coin[] = [
  { symbol: "BTC", name: "Bitcoin", nameKr: "비트코인", price: 106612000, change: 1.39, volume: 155395000000 },
  { symbol: "ETH", name: "Ethereum", nameKr: "이더리움", price: 3258000, change: 1.34, volume: 105669000000 },
  { symbol: "XRP", name: "Ripple", nameKr: "리플", price: 2123, change: 0.71, volume: 164321000000 },
  { symbol: "SOL", name: "Solana", nameKr: "솔라나", price: 138000, change: 2.00, volume: 45053000000 },
  { symbol: "DOGE", name: "Dogecoin", nameKr: "도지코인", price: 145, change: 2.11, volume: 27516000000 },
  { symbol: "ADA", name: "Cardano", nameKr: "에이다", price: 405, change: 2.27, volume: 9846000000 },
  { symbol: "DOT", name: "Polkadot", nameKr: "폴카닷", price: 5010, change: 2.77, volume: 18533000000 },
  { symbol: "AVAX", name: "Avalanche", nameKr: "아발란체", price: 77.5, change: 3.20, volume: 19700000000 },
  { symbol: "MATIC", name: "Polygon", nameKr: "폴리곤", price: 679, change: -5.03, volume: 20119000000 },
  { symbol: "LINK", name: "Chainlink", nameKr: "체인링크", price: 9.55, change: 29.23, volume: 71312000000 },
  { symbol: "ATOM", name: "Cosmos", nameKr: "코스모스", price: 4152, change: -0.60, volume: 8268000000 },
  { symbol: "UNI", name: "Uniswap", nameKr: "유니스왑", price: 1439, change: 1.27, volume: 7177000000 },
  { symbol: "SHIB", name: "Shiba Inu", nameKr: "시바이누", price: 0.00922, change: -0.22, volume: 9103000000 },
  { symbol: "TRX", name: "TRON", nameKr: "트론", price: 213, change: 7.04, volume: 17872000000 },
];

export function generateOrderBook(basePrice: number): { asks: OrderBookEntry[]; bids: OrderBookEntry[] } {
  const asks: OrderBookEntry[] = [];
  const bids: OrderBookEntry[] = [];
  const step = basePrice >= 1000000 ? 1000 : basePrice >= 10000 ? 100 : basePrice >= 100 ? 1 : 0.001;

  for (let i = 10; i >= 1; i--) {
    asks.push({
      price: basePrice + step * i,
      amount: parseFloat((Math.random() * 5).toFixed(3)),
    });
  }

  for (let i = 1; i <= 10; i++) {
    bids.push({
      price: basePrice - step * i,
      amount: parseFloat((Math.random() * 5).toFixed(3)),
    });
  }

  return { asks, bids };
}
