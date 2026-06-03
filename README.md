# Go Exchange Frontend

Go Exchange Frontend는 Go Exchange Backend와 연동되는 거래소 MVP UI입니다.
회원가입/로그인, 개발용 지갑 충전, 지정가/시장가 주문, 주문 취소, 잔고/주문/체결 조회, 실시간 호가/체결 표시를 제공합니다.

## 주요 기능

| 영역 | 상태 | 설명 |
| --- | --- | --- |
| 인증 UI | 완료 | 회원가입, 로그인, 로그아웃, token 저장 |
| 계정 패널 | 완료 | KRW/코인 available, locked, 총 보유량, 평균매수가, 평가손익 표시 |
| 개발용 충전 | 완료 | `VITE_ENABLE_DEV_TOOLS=true`일 때 KRW/선택 코인 fund 버튼 표시 |
| 주문 폼 | 완료 | 지정가/시장가 BUY/SELL, decimal string 전송 |
| 주문 정책 | 완료 | backend market rules 기반 tick size, 최소 주문금액, 수량 step 검증 |
| 주문 목록 | 완료 | open order 표시와 cancel |
| 체결 내역 | 완료 | 사용자 체결, 수수료 asset 표시 |
| 호가/체결 스트림 | 완료 | backend WebSocket orderbook/trade 수신 |
| WebSocket 재연결 | 완료 | exponential backoff helper 적용 |
| E2E 검증 | 완료 | Playwright로 16개 핵심 거래 시나리오 검증 |

## 기술 스택

- React 18.3.1
- TypeScript 5.8.3
- Vite 5.4.19
- Tailwind CSS 3.4.17
- shadcn/Radix UI components
- TanStack React Query 5.83.0
- React Router 6.30.1
- Recharts 2.15.4
- Vitest 3.2.4
- Playwright 1.57.0

## 실행 방법

백엔드가 `http://localhost:8080`에서 실행 중이어야 합니다.

`.env.local` 예시:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
VITE_ENABLE_DEV_TOOLS=true
VITE_DEV_TOOLS_TOKEN=<local-dev-tools-token>
```

개발 서버:

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 백엔드 계약

HTTP API:

- `POST /auth/register`
- `POST /auth/login`
- `GET /markets/rules?coin_symbol=BTC`
- `POST /orders`
- `DELETE /orders/:id`
- `GET /orders`
- `GET /wallets`
- `GET /trades`
- `POST /dev/wallets/fund`

WebSocket:

- `GET /ws`
- `orderbook` 메시지로 선택 코인 호가를 갱신합니다.
- `trade` 메시지로 실시간 체결 내역을 갱신합니다.

프론트는 금액과 수량을 `number`가 아니라 decimal string으로 백엔드에 전달합니다.
백엔드 응답의 decimal string은 표시 단계에서만 포맷합니다.

## 개발용 지갑 충전

로컬 시연에서는 실제 입출금 대신 개발용 fund API를 사용합니다.

프론트:

```text
VITE_ENABLE_DEV_TOOLS=true
VITE_DEV_TOOLS_TOKEN=<local-dev-tools-token>
```

백엔드:

```text
GOEXCHANGE_ENABLE_DEV_TOOLS=true
GOEXCHANGE_DEV_TOOLS_TOKEN=<local-dev-tools-token>
```

두 token이 다르면 `POST /dev/wallets/fund`가 `DEV_TOOLS_FORBIDDEN`으로 실패합니다.

## 테스트

단위 테스트:

```powershell
npm test -- --run
```

Lint:

```powershell
npm run lint
```

Build:

```powershell
npm run build
```

E2E:

```powershell
npm run test:e2e
```

E2E는 로컬 백엔드가 먼저 실행되어 있어야 합니다.
자세한 내용은 [E2E.md](E2E.md)를 참고하세요.

## E2E 주요 검증 시나리오

- 회원가입, KRW 충전, 지정가 매수 주문, 취소
- 매도자/매수자 API 체결과 양쪽 지갑 정산
- 평균매수가 가중평균과 전량 매도 후 리셋
- 주문 정책 오류 상태 코드
- market rules API
- 인증 오류와 dev token 보호
- 타인 주문 취소 방지
- self-trade skip 후 다른 사용자 주문과 체결
- 부분 체결 주문 취소 시 남은 hold만 release
- 가격 개선 환급
- 시장가 매수/매도, 유동성 없음, 자기 주문만 있는 경우
- 중복 취소 시 locked balance 이중 release 방지

## 현재 한계

- 실제 입출금 UI가 없습니다. 개발용 fund 버튼은 로컬 시연 전용입니다.
- 차트는 MVP 수준의 표시용 UI입니다.
- 사용자별 실시간 알림 stream은 아직 없습니다.
- 운영 배포용 환경 분리와 모니터링 화면은 후속 작업입니다.
