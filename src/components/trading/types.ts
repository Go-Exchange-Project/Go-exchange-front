export interface Coin {
  symbol: string;
  name: string;
  nameKr: string;
  price: number;
  change: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
}

export interface OrderFormData {
  side: "BUY" | "SELL";
  type: "limit" | "market";
  price: number;
  amount: number;
}
