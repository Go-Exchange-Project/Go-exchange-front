import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/trading/Header";
import CoinList from "@/components/trading/CoinList";
import TradingChart from "@/components/trading/TradingChart";
import OrderBook from "@/components/trading/OrderBook";
import OrderForm from "@/components/trading/OrderForm";
import TradeHistory, {
  TradeHistoryEntry,
} from "@/components/trading/TradeHistory";
import AuthPanel from "@/components/trading/AuthPanel";
import { mockCoins } from "@/components/trading/mockData";
import { OrderBookEntry } from "@/components/trading/types";
import {
  AuthResponse,
  AuthUser,
  Order,
  Trade,
  Wallet,
  fetchMarketRules,
  fetchOrders,
  fetchTrades,
  fetchWallets,
  isUnauthorizedError,
} from "@/lib/api";
import { MarketRules, fallbackKRWMarketRules } from "@/lib/orderPolicy";
import { webSocketReconnectDelay } from "@/lib/reconnect";

const TOKEN_STORAGE_KEY = "goexchange.auth.token";
const USER_STORAGE_KEY = "goexchange.auth.user";
const WEBSOCKET_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080/ws";

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

interface TradeMessageData {
  coin_symbol?: string;
  coinSymbol?: string;
  price?: string | number;
  quantity?: string | number;
  time?: string;
  traded_at?: string;
}

type WebSocketMessage =
  | { type: "ticker"; code: string; price: number }
  | {
      type: "orderbook";
      data?: {
        coin_symbol?: string;
        asks?: OrderBookLevel[];
        bids?: OrderBookLevel[];
      };
    }
  | { type: "trade"; data?: TradeMessageData }
  | { type?: string };

const Index = () => {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [orderPrice, setOrderPrice] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const previousSymbolRef = useRef(selectedSymbol);
  const selectedSymbolRef = useRef(selectedSymbol);
  const authTokenRef = useRef<string | null>(null);
  const refreshAccountRef = useRef<() => void>(() => {});

  const [asks, setAsks] = useState<OrderBookEntry[]>([]);
  const [bids, setBids] = useState<OrderBookEntry[]>([]);
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);

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
  const [accountTrades, setAccountTrades] = useState<Trade[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [marketRules, setMarketRules] = useState<MarketRules>(() =>
    fallbackKRWMarketRules("BTC"),
  );

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setAuthToken(null);
    setAuthUser(null);
    setWallets([]);
    setOrders([]);
    setAccountTrades([]);
  }, []);

  const handleAuthExpired = useCallback(() => {
    clearAuthState();
    setAccountError("Session expired. Please log in again.");
  }, [clearAuthState]);

  const refreshAccount = useCallback(async () => {
    if (!authToken) {
      setWallets([]);
      setOrders([]);
      setAccountTrades([]);
      setAccountError(null);
      return;
    }

    try {
      const [walletResult, orderResult, tradeResult] = await Promise.all([
        fetchWallets(authToken),
        fetchOrders(authToken, 10),
        fetchTrades(authToken, 10),
      ]);
      setWallets(walletResult.wallets);
      setOrders(orderResult.orders);
      setAccountTrades(tradeResult.trades);
      setAccountError(null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        handleAuthExpired();
        return;
      }
      setAccountError(
        err instanceof Error ? err.message : "Failed to load account data",
      );
    }
  }, [authToken, handleAuthExpired]);

  const handleAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
    setAuthToken(auth.token);
    setAuthUser(auth.user);
    setAccountError(null);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthState();
    setAccountError(null);
  }, [clearAuthState]);

  useEffect(() => {
    authTokenRef.current = authToken;
    refreshAccountRef.current = refreshAccount;
  }, [authToken, refreshAccount]);

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
    selectedSymbolRef.current = selectedSymbol;
    if (previousSymbolRef.current === selectedSymbol) {
      return;
    }
    previousSymbolRef.current = selectedSymbol;
    setCurrentPrice(selectedCoin.price);
    setOrderPrice(selectedCoin.price);
    setAsks([]);
    setBids([]);
    setTrades([]);
  }, [selectedCoin.price, selectedSymbol]);

  useEffect(() => {
    let cancelled = false;

    fetchMarketRules(selectedSymbol)
      .then((rules) => {
        if (!cancelled) {
          setMarketRules(rules);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarketRules(fallbackKRWMarketRules(selectedSymbol));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    let stopped = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      const delay = webSocketReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      clearReconnectTimer();
      reconnectTimer = setTimeout(connect, delay);
    };

    const handleMessage = (event: MessageEvent<string>) => {
      const data = parseWebSocketMessage(event.data);
      if (!data) return;

      if (data.type === "ticker") {
        const symbol = data.code.replace("KRW-", "");
        if (symbol === selectedSymbolRef.current) {
          setCurrentPrice(data.price);
        }
      } else if (data.type === "orderbook") {
        const snapshotSymbol = data.data?.coin_symbol;
        if (snapshotSymbol && snapshotSymbol !== selectedSymbolRef.current) {
          return;
        }
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
      } else if (data.type === "trade") {
        const trade = toTradeHistoryEntry(data.data);
        if (!trade) return;
        if (trade.coinSymbol && trade.coinSymbol !== selectedSymbolRef.current) {
          return;
        }
        setTrades((prev) => [trade, ...prev].slice(0, 50));
        if (authTokenRef.current) {
          refreshAccountRef.current();
        }
      }
    };

    function connect() {
      if (stopped) return;
      try {
        const ws = new WebSocket(WEBSOCKET_URL);
        wsRef.current = ws;
        ws.onopen = () => {
          reconnectAttempt = 0;
          if (authTokenRef.current) {
            refreshAccountRef.current();
          }
        };
        ws.onmessage = handleMessage;
        ws.onerror = () => {
          ws.close();
        };
        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

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
              <TradeHistory trades={trades} />
            </div>
          </div>
        </div>

        <div
          className="w-[320px] min-w-[280px] flex-shrink-0 overflow-y-auto border-l border-trading-border"
          data-testid="account-sidebar"
        >
          <AuthPanel
            token={authToken}
            user={authUser}
            wallets={wallets}
            orders={orders}
            trades={accountTrades}
            error={accountError}
            selectedSymbol={selectedSymbol}
            onAuth={handleAuth}
            onLogout={handleLogout}
            onAuthExpired={handleAuthExpired}
            onRefresh={refreshAccount}
          />
          <OrderForm
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            price={orderPrice}
            onPriceChange={setOrderPrice}
            authToken={authToken}
            wallets={wallets}
            marketRules={marketRules}
            onAuthExpired={handleAuthExpired}
            onOrderAccepted={refreshAccount}
          />
        </div>
      </div>
    </div>
  );
};

function parseWebSocketMessage(value: string): WebSocketMessage | null {
  try {
    return JSON.parse(value) as WebSocketMessage;
  } catch {
    return null;
  }
}

function toTradeHistoryEntry(
  trade: TradeMessageData | undefined,
): TradeHistoryEntry | null {
  if (!trade) return null;

  const price = Number(trade.price);
  const amount = Number(trade.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(amount)) {
    return null;
  }

  const tradedAt = trade.time ?? trade.traded_at;
  return {
    time: tradedAt ? new Date(tradedAt).toLocaleTimeString() : "--:--:--",
    price,
    amount,
    side: "buy",
    coinSymbol: trade.coin_symbol ?? trade.coinSymbol,
  };
}

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
