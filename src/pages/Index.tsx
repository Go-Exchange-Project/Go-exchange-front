import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/trading/Header";
import CoinList from "@/components/trading/CoinList";
import TradingChart from "@/components/trading/TradingChart";
import OrderBook from "@/components/trading/OrderBook";
import OrderForm from "@/components/trading/OrderForm";
import TradeHistory from "@/components/trading/TradeHistory";
import { mockCoins, generateOrderBook } from "@/components/trading/mockData";

const Index = () => {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [orderPrice, setOrderPrice] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const selectedCoin =
    mockCoins.find((c) => c.symbol === selectedSymbol) || mockCoins[0];
  const [currentPrice, setCurrentPrice] = useState(selectedCoin.price);
  const orderBook = generateOrderBook(currentPrice);

  const [asks, setAsks] = useState([]);
  const [bids, setBids] = useState([]);

  useEffect(() => {
    setCurrentPrice(selectedCoin.price);
    setOrderPrice(selectedCoin.price);
  }, [selectedSymbol]);

  // WebSocket connection
  useEffect(() => {
    try {
      const ws = new WebSocket("ws://localhost:8080/ws");
      wsRef.current = ws;
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "ticker") {
          setCurrentPrice(data.price);
        } else if (data.type === "orderbook") {
          setAsks(
            (data.data.asks || []).map((a: any) => ({
              price: parseFloat(a.price),
              amount: parseFloat(a.quantity),
            })),
          );
          setBids(
            (data.data.bids || []).map((b: any) => ({
              price: parseFloat(b.price),
              amount: parseFloat(b.quantity),
            })),
          );
        }
      };
      ws.onerror = () => {};
      return () => ws.close();
    } catch {
      // WS not available
    }
  }, []);

  const handlePriceClick = useCallback((price: number) => {
    setOrderPrice(price);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      <div className="flex-1 flex min-h-0">
        {/* Right coin list - 20% */}
        <div className="w-[280px] min-w-[240px] flex-shrink-0">
          <CoinList
            coins={mockCoins}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </div>

        {/* Center - Chart + OrderBook */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-trading-border">
          {/* Chart - top 60% */}
          <div className="h-[55%] border-b border-trading-border">
            <TradingChart
              symbol={selectedSymbol}
              currentPrice={currentPrice}
              change={selectedCoin.change}
            />
          </div>
          {/* OrderBook + Trade history */}
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 overflow-hidden">
              <OrderBook
                asks={asks.length > 0 ? asks : orderBook.asks}
                bids={bids.length > 0 ? bids : orderBook.bids}
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

        {/* Right - Order form - 30% */}
        <div className="w-[320px] min-w-[280px] flex-shrink-0">
          <OrderForm
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            price={orderPrice}
            onPriceChange={setOrderPrice}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
