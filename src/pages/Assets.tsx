import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/trading/Header";
import { mockCoins } from "@/components/trading/mockData";
import TransferForm, { TransferDirection } from "@/components/assets/TransferForm";
import TransferHistory from "@/components/assets/TransferHistory";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  TransferRequest,
  Wallet,
  fetchTransfers,
  fetchWallets,
  isUnauthorizedError,
} from "@/lib/api";

const ASSET_OPTIONS = ["KRW", ...mockCoins.map((coin) => coin.symbol)];

type AssetsTab = TransferDirection | "history";

// Assets 페이지는 "자산 목록 → 선택한 자산의 잔액 → 입금 / 출금 / 처리 내역 탭"
// 구조다(계획서 Task 7 Step 1). 입출금 폼을 거래 화면(Index.tsx)에 끼워 넣지
// 않는 것이 이 페이지를 따로 두는 이유다 — 주문과 입출금은 다른 일이다.
const Assets = () => {
  const { authToken, clearAuthSession } = useAuthSession();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [selectedAsset, setSelectedAsset] = useState("KRW");
  const [tab, setTab] = useState<AssetsTab>("deposit");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authToken) {
      setWallets([]);
      setTransfers([]);
      return;
    }
    try {
      const [walletResult, transferResult] = await Promise.all([
        fetchWallets(authToken),
        fetchTransfers(authToken, 20),
      ]);
      setWallets(walletResult.wallets);
      setTransfers(transferResult.transfers);
      setError(null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        clearAuthSession();
        setError("로그인이 만료됐습니다. 거래 화면에서 다시 로그인해 주세요.");
        return;
      }
      setError(err instanceof Error ? err.message : "자산 정보를 불러오지 못했습니다.");
    }
  }, [authToken, clearAuthSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedWallet = wallets.find((wallet) => wallet.coin_symbol === selectedAsset);

  if (!authToken) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <div className="text-center">
            <p>로그인이 필요합니다.</p>
            <Link to="/" className="text-primary underline">
              거래 화면에서 로그인하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">자산</h1>
            <button
              type="button"
              onClick={() => refresh()}
              data-testid="refresh-assets"
              className="rounded border border-trading-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              새로고침
            </button>
          </div>

          <div className="mt-3 rounded border border-trading-border">
            <div className="border-b border-trading-border px-3 py-2 text-xs text-muted-foreground">
              자산 목록
            </div>
            <div className="max-h-40 overflow-y-auto">
              {ASSET_OPTIONS.map((asset) => {
                const wallet = wallets.find((w) => w.coin_symbol === asset);
                return (
                  <button
                    type="button"
                    key={asset}
                    onClick={() => setSelectedAsset(asset)}
                    data-testid={`select-asset-${asset}`}
                    className={`flex w-full items-center justify-between border-b border-trading-border/60 px-3 py-2 text-left text-xs last:border-b-0 ${
                      selectedAsset === asset ? "bg-muted" : ""
                    }`}
                  >
                    <span className="font-medium text-foreground">{asset}</span>
                    <span
                      className="font-mono text-muted-foreground"
                      data-testid={`asset-balance-total-${asset}`}
                    >
                      {wallet?.total_balance ?? "0"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-trading-border bg-muted px-3 py-2">
              <div className="text-muted-foreground">사용 가능</div>
              <div
                className="mt-1 font-mono text-foreground"
                data-testid={`asset-balance-available-${selectedAsset}`}
              >
                {selectedWallet?.available_balance ?? "0"}
              </div>
            </div>
            <div className="rounded border border-trading-border bg-muted px-3 py-2">
              <div className="text-muted-foreground">잠금</div>
              <div
                className="mt-1 font-mono text-foreground"
                data-testid={`asset-balance-locked-${selectedAsset}`}
              >
                {selectedWallet?.locked_balance ?? "0"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-1 text-xs">
            {(
              [
                { key: "deposit", label: "입금" },
                { key: "withdrawal", label: "출금" },
                { key: "history", label: "처리 내역" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                data-testid={`tab-${item.key}`}
                className={`flex-1 rounded border px-2 py-1.5 ${
                  tab === item.key
                    ? "border-primary text-foreground"
                    : "border-trading-border text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {(tab === "deposit" || tab === "withdrawal") && (
            <TransferForm
              token={authToken}
              direction={tab}
              assetOptions={ASSET_OPTIONS}
              selectedAsset={selectedAsset}
              onAssetChange={setSelectedAsset}
              onSubmitted={() => {
                void refresh();
              }}
              onAuthExpired={() => {
                clearAuthSession();
                setError("로그인이 만료됐습니다. 거래 화면에서 다시 로그인해 주세요.");
              }}
            />
          )}

          {tab === "history" && <TransferHistory transfers={transfers} />}

          {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default Assets;
