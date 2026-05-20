import { useState } from "react";
import {
  AuthResponse,
  AuthUser,
  DEV_TOOLS_ENABLED,
  Order,
  Wallet,
  cancelOrder,
  fundWallet,
  loginUser,
  registerUser,
} from "@/lib/api";
import { X } from "lucide-react";

interface AuthPanelProps {
  token: string | null;
  user: AuthUser | null;
  wallets: Wallet[];
  orders: Order[];
  error: string | null;
  selectedSymbol: string;
  onAuth: (auth: AuthResponse) => void;
  onLogout: () => void;
  onRefresh: () => void;
}

const AuthPanel = ({
  token,
  user,
  wallets,
  orders,
  error,
  selectedSymbol,
  onAuth,
  onLogout,
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
      setAuthError(err instanceof Error ? err.message : "Auth failed");
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
    const visibleWallets = wallets.filter(
      (wallet) =>
        wallet.available_balance !== "0" || wallet.locked_balance !== "0",
    );

    const handleDevFund = async (coinSymbol: string, amount: string) => {
      setIsFunding(true);
      setAuthError(null);
      setAccountMessage(null);
      try {
        const result = await fundWallet(token, { coin_symbol: coinSymbol, amount });
        setAccountMessage(
          `${result.wallet.coin_symbol} available ${result.wallet.available_balance}`,
        );
        onRefresh();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Funding failed");
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
          `Released ${result.released_amount} ${result.released_asset}`,
        );
        onRefresh();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Cancel failed");
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
            <div className="text-muted-foreground">Authenticated</div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={onRefresh}
              className="rounded border border-trading-border px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
            <button
              onClick={onLogout}
              className="rounded border border-trading-border px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">KRW available</div>
            <div className="truncate font-mono text-foreground">
              {krwWallet?.available_balance ?? "0"}
            </div>
          </div>
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">KRW locked</div>
            <div className="truncate font-mono text-foreground">
              {krwWallet?.locked_balance ?? "0"}
            </div>
          </div>
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">
              {selectedSymbol} available
            </div>
            <div className="truncate font-mono text-foreground">
              {selectedWallet?.available_balance ?? "0"}
            </div>
          </div>
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">{selectedSymbol} locked</div>
            <div className="truncate font-mono text-foreground">
              {selectedWallet?.locked_balance ?? "0"}
            </div>
          </div>
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">Open orders</div>
            <div className="font-mono text-foreground">{openOrders.length}</div>
          </div>
          <div className="rounded border border-trading-border bg-muted px-2 py-2">
            <div className="text-muted-foreground">Assets</div>
            <div className="font-mono text-foreground">{wallets.length}</div>
          </div>
        </div>

        {visibleWallets.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto rounded border border-trading-border bg-muted px-2 py-1.5">
            {visibleWallets.map((wallet) => (
              <div
                key={wallet.coin_symbol}
                className="flex items-center justify-between gap-2 py-0.5 font-mono text-[11px]"
              >
                <span className="text-foreground">{wallet.coin_symbol}</span>
                <span className="truncate text-muted-foreground">
                  A {wallet.available_balance} / L {wallet.locked_balance}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 rounded border border-trading-border bg-muted">
          <div className="flex items-center justify-between border-b border-trading-border px-2 py-1.5">
            <span className="text-muted-foreground">Open orders</span>
            <span className="font-mono text-foreground">{openOrders.length}</span>
          </div>
          <div className="max-h-28 overflow-y-auto px-2 py-1">
            {visibleOpenOrders.length === 0 ? (
              <div className="py-1 text-muted-foreground">No open orders</div>
            ) : (
              visibleOpenOrders.slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-[44px_1fr_26px] items-center gap-2 py-1"
                >
                  <span
                    className={`font-medium ${
                      order.side === "BUY"
                        ? "text-trading-buy"
                        : "text-trading-sell"
                    }`}
                  >
                    {order.side}
                  </span>
                  <div className="min-w-0 font-mono text-[11px]">
                    <div className="truncate text-foreground">
                      {order.coin_symbol} {order.remaining}
                    </div>
                    <div className="truncate text-muted-foreground">
                      @ {order.price}
                    </div>
                  </div>
                  <button
                    type="button"
                    title={`Cancel order #${order.id}`}
                    aria-label={`Cancel order #${order.id}`}
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

        {DEV_TOOLS_ENABLED && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleDevFund("KRW", "1000000")}
              disabled={isFunding}
              className="rounded border border-trading-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Fund KRW +1,000,000
            </button>
            <button
              onClick={() => handleDevFund(selectedSymbol, "1")}
              disabled={isFunding}
              className="rounded border border-trading-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Fund {selectedSymbol} +1
            </button>
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
            className={`flex-1 rounded border px-2 py-1 ${
              mode === item
                ? "border-primary text-foreground"
                : "border-trading-border text-muted-foreground"
            }`}
          >
            {item === "login" ? "Login" : "Register"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
        />
      )}
      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
      />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        placeholder="Password"
        className="mt-2 w-full rounded border border-trading-border bg-muted px-2 py-1 text-foreground outline-none"
      />

      {authError && (
        <div className="mt-2 text-[11px] text-destructive">{authError}</div>
      )}

      <button
        onClick={submit}
        disabled={isSubmitting || !email || !password}
        className="mt-2 w-full rounded bg-primary px-2 py-2 font-medium text-primary-foreground disabled:opacity-40"
      >
        {isSubmitting ? "Submitting..." : mode === "login" ? "Login" : "Create account"}
      </button>
    </div>
  );
};

export default AuthPanel;
