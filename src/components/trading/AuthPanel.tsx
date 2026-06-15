import { useState, type ReactNode } from "react";
import {
  AuthResponse,
  AuthUser,
  DEV_TOOLS_ENABLED,
  Order,
  Trade,
  Wallet,
  cancelOrder,
  fundWallet,
  isUnauthorizedError,
  loginUser,
  registerUser,
} from "@/lib/api";
import {
  History,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
  WalletCards,
  X,
} from "lucide-react";

interface AuthPanelProps {
  token: string | null;
  user: AuthUser | null;
  wallets: Wallet[];
  orders: Order[];
  trades: Trade[];
  error: string | null;
  selectedSymbol: string;
  marketPrices: Record<string, number>;
  onAuth: (auth: AuthResponse) => void;
  onLogout: () => void;
  onAuthExpired: () => void;
  onRefresh: () => void;
}

const AuthPanel = ({
  token,
  user,
  wallets,
  orders,
  trades,
  error,
  selectedSymbol,
  marketPrices,
  onAuth,
  onLogout,
  onAuthExpired,
  onRefresh,
}: AuthPanelProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("Trader");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [cancelingOrderID, setCancelingOrderID] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      const auth =
        mode === "login"
          ? await loginUser({ email, password })
          : await registerUser({ name, email, password });
      onAuth(auth);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "인증에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (token && user) {
    const krwWallet = wallets.find((wallet) => wallet.coin_symbol === "KRW");
    const selectedWallet = wallets.find(
      (wallet) => wallet.coin_symbol === selectedSymbol,
    );
    const openOrders = orders.filter(
      (order) => order.status === "PENDING" || order.status === "PARTIAL",
    );
    const visibleOpenOrders = [...openOrders].sort((a, b) => {
      if (a.coin_symbol === selectedSymbol && b.coin_symbol !== selectedSymbol) {
        return -1;
      }
      if (a.coin_symbol !== selectedSymbol && b.coin_symbol === selectedSymbol) {
        return 1;
      }
      return b.id - a.id;
    });
    const accountWallets = accountBalanceRows(wallets, selectedSymbol);
    const accountValuation = calculateAccountValuation(wallets, marketPrices);

    const handleDevFund = async (coinSymbol: string, amount: string) => {
      setIsFunding(true);
      setAuthError(null);
      setAccountMessage(null);
      try {
        const result = await fundWallet(token, { coin_symbol: coinSymbol, amount });
        setAccountMessage(
          `${result.wallet.coin_symbol} 주문 가능 ${result.wallet.available_balance}`,
        );
        onRefresh();
      } catch (err) {
        if (isUnauthorizedError(err)) {
          onAuthExpired();
          return;
        }
        setAuthError(err instanceof Error ? err.message : "충전에 실패했습니다.");
      } finally {
        setIsFunding(false);
      }
    };

    const handleCancelOrder = async (orderID: number) => {
      setCancelingOrderID(orderID);
      setAuthError(null);
      setAccountMessage(null);
      try {
        const result = await cancelOrder(token, orderID);
        setAccountMessage(
          `${result.released_amount} ${result.released_asset} 반환 완료`,
        );
        onRefresh();
      } catch (err) {
        if (isUnauthorizedError(err)) {
          onAuthExpired();
          return;
        }
        setAuthError(err instanceof Error ? err.message : "주문 취소에 실패했습니다.");
      } finally {
        setCancelingOrderID(null);
      }
    };

    return (
      <div className="border-b border-trading-border bg-card px-3 py-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {user.email}
            </div>
            <div className="text-muted-foreground" data-testid="auth-status">
              로그인됨
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onRefresh}
              title="계정 새로고침"
              aria-label="계정 새로고침"
              className="flex h-8 w-8 items-center justify-center rounded border border-trading-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="로그아웃"
              aria-label="로그아웃"
              className="flex h-8 w-8 items-center justify-center rounded border border-trading-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <MetricTile
            label="보유자산 평가액"
            value={`${formatKRWAmount(accountValuation.totalValue)} KRW`}
            testId="account-asset-value"
          />
          <MetricTile
            label="평가손익"
            value={
              accountValuation.hasPnl
                ? `${formatSignedKRWAmount(accountValuation.pnl)} (${formatSignedPercent(
                    accountValuation.pnlRate,
                  )})`
                : "-"
            }
            valueClassName={profitLossTextClass(accountValuation.pnl)}
            testId="account-unrealized-pnl"
          />
          <MetricTile
            label="KRW 주문 가능"
            value={krwWallet?.available_balance ?? "0"}
            detailLabel="잠금"
            detailValue={krwWallet?.locked_balance ?? "0"}
            testId="krw-available"
            detailTestId="krw-locked"
          />
          <MetricTile
            label={`${selectedSymbol} 주문 가능`}
            value={selectedWallet?.available_balance ?? "0"}
            detailLabel="잠금"
            detailValue={selectedWallet?.locked_balance ?? "0"}
            testId="selected-asset-available"
            detailTestId="selected-asset-locked"
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center justify-between rounded border border-trading-border/70 px-2 py-1 text-muted-foreground">
            <span>미체결 주문</span>
            <span className="font-mono text-foreground">{openOrders.length}</span>
          </div>
          <div className="flex items-center justify-between rounded border border-trading-border/70 px-2 py-1 text-muted-foreground">
            <span>보유 자산</span>
            <span className="font-mono text-foreground" data-testid="asset-count">
              {accountWallets.length}
            </span>
          </div>
        </div>

        <div className="mt-2 rounded border border-trading-border bg-muted">
          <div className="flex items-center justify-between border-b border-trading-border px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <WalletCards className="h-3.5 w-3.5" />
              보유 자산
            </span>
            <span className="font-mono text-foreground">{accountWallets.length}</span>
          </div>
          <div className="max-h-40 overflow-y-auto px-2 py-1">
            {accountWallets.length === 0 ? (
              <div className="py-1 text-muted-foreground">보유 자산 없음</div>
            ) : (
              accountWallets.map((wallet) => {
                const valuation = calculateWalletValuation(wallet, marketPrices);
                return (
                  <div
                    key={wallet.coin_symbol}
                    className="border-b border-trading-border/60 py-1.5 last:border-b-0"
                    data-testid={`balance-row-${wallet.coin_symbol}`}
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="font-medium text-foreground">
                        {wallet.coin_symbol}
                      </span>
                      <span
                        className="truncate text-foreground"
                        data-testid={`balance-total-${wallet.coin_symbol}`}
                      >
                        {wallet.total_balance}
                      </span>
                    </div>
                    <div className="mt-0.5 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="min-w-0 truncate">
                        가능{" "}
                        <span data-testid={`balance-available-${wallet.coin_symbol}`}>
                          {wallet.available_balance}
                        </span>
                      </span>
                      <span className="min-w-0 truncate text-right">
                        잠금{" "}
                        <span data-testid={`balance-locked-${wallet.coin_symbol}`}>
                          {wallet.locked_balance}
                        </span>
                      </span>
                    </div>
                    {wallet.coin_symbol !== "KRW" && (
                      <>
                        <div className="mt-0.5 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                          <span>평균매수가</span>
                          <span
                            className="min-w-0 truncate text-right"
                            data-testid={`balance-avg-buy-${wallet.coin_symbol}`}
                          >
                            {wallet.avg_buy_price} KRW
                          </span>
                        </div>
                        <div className="mt-0.5 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                          <span>평가액</span>
                          <span
                            className="min-w-0 truncate text-right"
                            data-testid={`balance-value-${wallet.coin_symbol}`}
                          >
                            {valuation
                              ? `${formatKRWAmount(valuation.value)} KRW`
                              : "-"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex justify-between gap-2 font-mono text-[10px]">
                          <span className="text-muted-foreground">손익</span>
                          <span
                            className={`min-w-0 truncate text-right ${
                              valuation
                                ? profitLossTextClass(valuation.pnl)
                                : "text-muted-foreground"
                            }`}
                            data-testid={`balance-pnl-${wallet.coin_symbol}`}
                          >
                            {valuation?.hasPnl
                              ? `${formatSignedKRWAmount(
                                  valuation.pnl,
                                )} (${formatSignedPercent(valuation.pnlRate)})`
                              : "-"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-2 rounded border border-trading-border bg-muted">
          <div className="flex items-center justify-between border-b border-trading-border px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              미체결 주문
            </span>
            <span className="font-mono text-foreground" data-testid="open-order-count">
              {openOrders.length}
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto px-2 py-1">
            {visibleOpenOrders.length === 0 ? (
              <div className="py-1 text-muted-foreground">미체결 주문 없음</div>
            ) : (
              visibleOpenOrders.slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-[44px_1fr_26px] items-center gap-2 py-1"
                  data-testid="open-order-row"
                >
                  <span
                    className={`font-medium ${
                      order.side === "BUY"
                        ? "text-trading-buy"
                        : "text-trading-sell"
                    }`}
                  >
                    {orderSideLabel(order.side)}
                  </span>
                  <div className="min-w-0 font-mono text-[11px]">
                    <div className="truncate text-foreground">
                      {orderPrimaryText(order)}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {orderSecondaryText(order)}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`cancel-order-${order.id}`}
                    title={`주문 #${order.id} 취소`}
                    aria-label={`주문 #${order.id} 취소`}
                    onClick={() => handleCancelOrder(order.id)}
                    disabled={cancelingOrderID === order.id}
                    className="flex h-6 w-6 items-center justify-center rounded border border-trading-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-2 rounded border border-trading-border bg-muted">
          <div className="flex items-center justify-between border-b border-trading-border px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              내 체결
            </span>
            <span
              className="font-mono text-foreground"
              data-testid="account-trade-count"
            >
              {trades.length}
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto px-2 py-1">
            {trades.length === 0 ? (
              <div className="py-1 text-muted-foreground">체결 내역 없음</div>
            ) : (
              trades.slice(0, 6).map((trade) => {
                const fee = tradeFeeForSide(trade);
                return (
                  <div
                    key={trade.id}
                    className="grid grid-cols-[44px_1fr] gap-2 py-1"
                    data-testid="account-trade-row"
                  >
                    <span
                      className={`font-medium ${
                        trade.side === "BUY"
                          ? "text-trading-buy"
                          : "text-trading-sell"
                      }`}
                    >
                      {orderSideLabel(trade.side)}
                    </span>
                    <div className="min-w-0 font-mono text-[11px]">
                      <div className="truncate text-foreground">
                        {trade.coin_symbol} {trade.quantity} @ {trade.price}
                      </div>
                      <div
                        className="truncate text-muted-foreground"
                        data-testid={`account-trade-fee-${trade.id}`}
                      >
                        수수료 {fee.amount} {fee.asset}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {formatTradeTime(trade.traded_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {DEV_TOOLS_ENABLED && (
          <div className="mt-2 rounded border border-trading-border bg-muted p-2">
            <div className="mb-2 flex items-center justify-between text-muted-foreground">
              <span>개발용 충전</span>
              <Plus className="h-3.5 w-3.5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleDevFund("KRW", "1000000")}
              disabled={isFunding}
              data-testid="fund-krw"
              className="rounded border border-trading-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              KRW 1,000,000 충전
            </button>
            <button
              onClick={() => handleDevFund(selectedSymbol, "1")}
              disabled={isFunding}
              data-testid="fund-selected-asset"
              className="rounded border border-trading-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {selectedSymbol} 1 충전
            </button>
            </div>
          </div>
        )}

        {accountMessage && (
          <div className="mt-2 text-[11px] text-emerald-500">
            {accountMessage}
          </div>
        )}
        {authError && (
          <div className="mt-2 text-[11px] text-destructive">{authError}</div>
        )}
        {error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
      </div>
    );
  }

  return (
    <div className="border-b border-trading-border bg-card px-3 py-3 text-xs">
      <div className="flex gap-1">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setMode(item)}
            data-testid={`auth-mode-${item}`}
            className={`flex-1 rounded border px-2 py-1 ${
              mode === item
                ? "border-primary text-foreground"
                : "border-trading-border text-muted-foreground"
            }`}
          >
            {item === "login" ? "로그인" : "회원가입"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="이름"
        data-testid="auth-name"
        className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
      />
      )}
      <input
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      placeholder="이메일"
      data-testid="auth-email"
      className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
    />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      type="password"
      placeholder="비밀번호"
      data-testid="auth-password"
      className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
    />

      {authError && (
        <div className="mt-2 text-[11px] text-destructive">{authError}</div>
      )}
      {error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}

      <button
        onClick={submit}
        disabled={isSubmitting || !email || !password}
        data-testid="auth-submit"
        className="mt-2 w-full rounded bg-primary px-2 py-2 font-medium text-primary-foreground disabled:opacity-40"
      >
        {isSubmitting ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
      </button>
    </div>
  );
};

interface MetricTileProps {
  label: string;
  value: ReactNode;
  detailLabel?: string;
  detailValue?: ReactNode;
  valueClassName?: string;
  testId?: string;
  detailTestId?: string;
}

function MetricTile({
  label,
  value,
  detailLabel,
  detailValue,
  valueClassName = "text-foreground",
  testId,
  detailTestId,
}: MetricTileProps) {
  return (
    <div className="rounded border border-trading-border bg-muted px-2 py-2">
      <div className="truncate text-muted-foreground">{label}</div>
      <div
        className={`truncate font-mono ${valueClassName}`}
        data-testid={testId}
      >
        {value}
      </div>
      {detailLabel && detailValue !== undefined && (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {detailLabel}{" "}
          <span data-testid={detailTestId}>{detailValue}</span>
        </div>
      )}
    </div>
  );
}

function tradeFeeForSide(trade: Trade) {
  if (trade.side === "BUY") {
    return {
      amount: trade.buyer_fee,
      asset: trade.buyer_fee_asset,
    };
  }

  return {
    amount: trade.seller_fee,
    asset: trade.seller_fee_asset,
  };
}

function orderSideLabel(side: "BUY" | "SELL") {
  return side === "BUY" ? "매수" : "매도";
}

function formatTradeTime(value: string) {
  const tradedAt = new Date(value);
  if (Number.isNaN(tradedAt.getTime())) {
    return value;
  }
  return tradedAt.toLocaleTimeString();
}

function accountBalanceRows(wallets: Wallet[], selectedSymbol: string) {
  const selected = selectedSymbol.toUpperCase();
  return wallets
    .filter(hasVisibleBalance)
    .sort((a, b) => {
      const priorityDiff =
        walletSortPriority(a, selected) - walletSortPriority(b, selected);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.coin_symbol.localeCompare(b.coin_symbol);
    });
}

interface WalletValuation {
  value: number;
  pnl: number;
  pnlRate: number;
  hasPnl: boolean;
}

interface AccountValuation {
  totalValue: number;
  pnl: number;
  pnlRate: number;
  hasPnl: boolean;
}

function calculateAccountValuation(
  wallets: Wallet[],
  marketPrices: Record<string, number>,
): AccountValuation {
  const valuation = wallets.reduce(
    (acc, wallet) => {
      if (!hasVisibleBalance(wallet)) {
        return acc;
      }

      if (wallet.coin_symbol === "KRW") {
        acc.totalValue += parseDecimalString(wallet.total_balance);
        return acc;
      }

      const valuation = calculateWalletValuation(wallet, marketPrices);
      if (!valuation) {
        return acc;
      }

      acc.totalValue += valuation.value;
      if (valuation.hasPnl) {
        acc.pnl += valuation.pnl;
        acc.costBasis += valuation.value - valuation.pnl;
        acc.hasPnl = true;
      }
      return acc;
    },
    { totalValue: 0, pnl: 0, costBasis: 0, hasPnl: false },
  );

  return {
    totalValue: valuation.totalValue,
    pnl: valuation.pnl,
    pnlRate:
      valuation.hasPnl && valuation.costBasis > 0
        ? (valuation.pnl / valuation.costBasis) * 100
        : 0,
    hasPnl: valuation.hasPnl,
  };
}

function calculateWalletValuation(
  wallet: Wallet,
  marketPrices: Record<string, number>,
): WalletValuation | null {
  const totalBalance = parseDecimalString(wallet.total_balance);
  const currentPrice = marketPrices[wallet.coin_symbol];
  if (
    wallet.coin_symbol === "KRW" ||
    totalBalance <= 0 ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return null;
  }

  const value = totalBalance * currentPrice;
  const averageBuyPrice = parseDecimalString(wallet.avg_buy_price);
  if (averageBuyPrice <= 0) {
    return { value, pnl: 0, pnlRate: 0, hasPnl: false };
  }

  const costBasis = totalBalance * averageBuyPrice;
  const pnl = value - costBasis;
  return {
    value,
    pnl,
    pnlRate: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
    hasPnl: true,
  };
}

function parseDecimalString(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatKRWAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedKRWAmount(value: number) {
  const absoluteValue = formatKRWAmount(Math.abs(value));
  if (value > 0) return `+${absoluteValue} KRW`;
  if (value < 0) return `-${absoluteValue} KRW`;
  return "0 KRW";
}

function formatSignedPercent(value: number) {
  const absoluteValue = Math.abs(value).toFixed(2);
  if (value > 0) return `+${absoluteValue}%`;
  if (value < 0) return `-${absoluteValue}%`;
  return "0.00%";
}

function profitLossTextClass(value: number) {
  if (value > 0) return "text-trading-buy";
  if (value < 0) return "text-trading-sell";
  return "text-foreground";
}

function hasVisibleBalance(wallet: Wallet) {
  return (
    !isZeroDecimalString(wallet.available_balance) ||
    !isZeroDecimalString(wallet.locked_balance) ||
    !isZeroDecimalString(wallet.total_balance)
  );
}

function walletSortPriority(wallet: Wallet, selectedSymbol: string) {
  if (wallet.coin_symbol === "KRW") {
    return 0;
  }
  if (wallet.coin_symbol === selectedSymbol) {
    return 1;
  }
  if (!isZeroDecimalString(wallet.locked_balance)) {
    return 2;
  }
  return 3;
}

function isZeroDecimalString(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue === 0;
}

function orderPrimaryText(order: Order) {
  if (order.order_type === "MARKET" && order.side === "BUY") {
    return `${order.coin_symbol} 예산 ${order.quote_amount} KRW`;
  }
  return `${order.coin_symbol} ${order.remaining}`;
}

function orderSecondaryText(order: Order) {
  if (order.order_type === "MARKET") {
    return "시장가";
  }
  return `${order.price} KRW`;
}

export default AuthPanel;
