# Frontend E2E Tests

The E2E suite verifies the local exchange flow across the browser, HTTP API, matching engine, settlement, and wallet balances.

## Prerequisites

Start the backend first with development wallet funding enabled:

```powershell
cd ..\Go-exchange-back
go run ./cmd
```

The backend should load `.env.local` with at least:

```text
GOEXCHANGE_ENABLE_DEV_TOOLS=true
GOEXCHANGE_DEV_TOOLS_TOKEN=e2e-dev-token
GOEXCHANGE_ENABLE_UPBIT=false
GOEXCHANGE_CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
GOEXCHANGE_WS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

The frontend Playwright config starts Vite automatically on `http://127.0.0.1:3000`.

Install Playwright browsers once if you want to use the default bundled Chromium:

```powershell
npx playwright install chromium
```

If Microsoft Edge or Google Chrome is already installed, you can avoid that download:

```powershell
$env:E2E_BROWSER_CHANNEL="msedge"
```

## Run

```powershell
cd ..\Go-exchange-front
npm run test:e2e
```

Override endpoints when needed:

```powershell
$env:E2E_API_BASE_URL="http://127.0.0.1:8080"
$env:E2E_FRONTEND_BASE_URL="http://127.0.0.1:3000"
$env:E2E_BROWSER_CHANNEL="msedge"
$env:E2E_DEV_TOOLS_TOKEN="e2e-dev-token"
npm run test:e2e
```

The app uses `VITE_WS_URL` for the WebSocket stream. If it is not set, it defaults to `ws://localhost:8080/ws`.

## Coverage

Current coverage includes:

- UI remains usable when the Upbit ticker request fails, and selected coin changes account/order context.
- Browser flow: register, fund KRW/BTC, place a buy order, cancel it, and verify available/locked balances.
- API settlement flow: seller funds coin, buyer funds KRW, matching creates a trade, and both wallets/orders settle.
- Weighted average buy price after multiple buys and reset after full sell.
- Order validation status codes for invalid decimal, tick size, minimum notional, quantity step, halted market, and insufficient balance.
- Market rules API for BTC/XRP/HALT.
- Structured auth errors and dev-tool token guard.
- Cross-user cancel protection.
- Self-trade prevention where the user's own order is skipped but another user's order can still match.
- Partial fill cancellation releases only remaining locked KRW.
- Price improvement refund for a limit buy.
- Market buy budget spending, KRW fee settlement, and unused KRW release.
- Market sell consumes best bid and never rests on the order book.
- Market buy with no liquidity cancels and releases the full budget.
- Market buy with only the user's own ask skips self-trade and releases budget.
- Duplicate cancel does not release locked balance twice.

If the backend is not reachable, tests are skipped with a message. If dev tools are disabled or the dev tools token does not match, wallet-funding tests are skipped or fail with a clear setup error.
