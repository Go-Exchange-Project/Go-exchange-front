import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/trading/Header";
import CoinList from "@/components/trading/CoinList";
import TradingChart from "@/components/trading/TradingChart";
import OrderBook from "@/components/trading/OrderBook";
import OrderForm from "@/components/trading/OrderForm";
import TradeHistory from "@/components/trading/TradeHistory";
import AuthPanel from "@/components/trading/AuthPanel";
import { mockCoins } from "@/components/trading/mockData";
import {
  AuthResponse,
  AuthUser,
  Order,
  Wallet,
  fetchOrders,
  fetchWallets,
} from "@/lib/api";

const TOKEN_STORAGE_KEY = "goexchange.auth.token";
const USER_STORAGE_KEY = "goexchange.auth.user";

interface UpbitTicker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
}

interface OrderBookLevel {
  price: string | number;
  quantity: string | number;
}

type WebSocketMessage =
  | { type: "ticker"; code: string; price: number }
  | {
      type: "orderbook";
      data?: {
        asks?: OrderBookLevel[];
        bids?: OrderBookLevel[];
      };
    }
  | { type?: string };

const Index = () => {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [orderPrice, setOrderPrice] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const previousSymbolRef = useRef(selectedSymbol);

  const [asks, setAsks] = useState([]);
  const [bids, setBids] = useState([]);

  const [coins, setCoins] = useState(mockCoins);
  const selectedCoin =
    coins.find((c) => c.symbol === selectedSymbol) || coins[0];
  const [currentPrice, setCurrentPrice] = useState(selectedCoin.price);
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!authToken) {
      setWallets([]);
      setOrders([]);
      setAccountError(null);
      return;
    }

    try {
      const [walletResult, orderResult] = await Promise.all([
        fetchWallets(authToken),
        fetchOrders(authToken, 10),
      ]);
      setWallets(walletResult.wallets);
      setOrders(orderResult.orders);
      setAccountError(null);
    } catch (err) {
      setAccountError(
        err instanceof Error ? err.message : "Failed to load account data",
      );
    }
  }, [authToken]);

  const handleAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
    setAuthToken(auth.token);
    setAuthUser(auth.user);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setAuthToken(null);
    setAuthUser(null);
    setWallets([]);
    setOrders([]);
    setAccountError(null);
  }, []);

  useEffect(() => {
    const symbols = mockCoins.map((c) => `KRW-${c.symbol}`).join(",");

    const fetchPrices = async () => {
      const res = await fetch(
        `https://api.upbit.com/v1/ticker?markets=${symbols}`,
      );
      const data = (await res.json()) as unknown;

      if (!Array.isArray(data)) return;
      const tickers = data.filter(isUpbitTicker);

      setCoins((prev) =>
        prev.map((coin) => {
          const upbit = tickers.find(
            (ticker) => ticker.market === `KRW-${coin.symbol}`,
          );
          if (!upbit) return coin;
          return {
            ...coin,
            price: upbit.trade_price,
            change: upbit.signed_change_rate * 100,
            volume: upbit.acc_trade_price_24h,
          };
        }),
      );
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (previousSymbolRef.current === selectedSymbol) {
      return;
    }
    previousSymbolRef.current = selectedSymbol;
    setCurrentPrice(selectedCoin.price);
    setOrderPrice(selectedCoin.price);
  }, [selectedCoin.price, selectedSymbol]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    try {
      const ws = new WebSocket("ws://localhost:8080/ws");
      wsRef.current = ws;
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as WebSocketMessage;
        if (data.type === "ticker") {
          const symbol = data.code.replace("KRW-", "");
          if (symbol === selectedSymbol) {
            setCurrentPrice(data.price);
          }
        } else if (data.type === "orderbook") {
          setAsks(
            (data.data?.asks || []).map((ask) => ({
              price: Number(ask.price),
              amount: Number(ask.quantity),
            })),
          );
          setBids(
            (data.data?.bids || []).map((bid) => ({
              price: Number(bid.price),
              amount: Number(bid.quantity),
            })),
          );
        }
      };
      ws.onerror = () => {};
      return () => ws.close();
    } catch {
      // WebSocket is optional during local frontend-only development.
    }
  }, [selectedSymbol]);

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] min-w-[240px] flex-shrink-0">
          <CoinList
            coins={coins}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 border-r border-trading-border">
          <div className="h-[55%] border-b border-trading-border">
            <TradingChart
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              change={selectedCoin.change}
            />
          </div>
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 overflow-hidden">
              <OrderBook
                asks={asks}
                bids={bids}
                currentPrice={currentPrice}
                change={selectedCoin.change}
                onPriceClick={handlePriceClick}
              />
            </div>
            <div className="w-[240px] border-l border-trading-border overflow-hidden">
              <TradeHistory />
            </div>
          </div>
        </div>

        <div className="w-[320px] min-w-[280px] flex-shrink-0 flex flex-col min-h-0">
          <AuthPanel
            token={authToken}
            user={authUser}
            wallets={wallets}
            orders={orders}
            error={accountError}
            selectedSymbol={selectedSymbol}
            onAuth={handleAuth}
            onLogout={handleLogout}
            onRefresh={refreshAccount}
          />
          <div className="flex-1 min-h-0">
            <OrderForm
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              price={orderPrice}
              onPriceChange={setOrderPrice}
              authToken={authToken}
              wallets={wallets}
              onOrderAccepted={refreshAccount}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

function isUpbitTicker(value: unknown): value is UpbitTicker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ticker = value as Partial<UpbitTicker>;
  return (
    typeof ticker.market === "string" &&
    typeof ticker.trade_price === "number" &&
    typeof ticker.signed_change_rate === "number" &&
    typeof ticker.acc_trade_price_24h === "number"
  );
}

export default Index;
