# Go Exchange Frontend

Go Exchange Backend와 연동되는 실시간 가상자산 거래소 MVP 프론트엔드입니다.
회원가입, 로그인, 개발용 자산 충전, 지정가/시장가 주문, 주문 취소, 지갑/주문/체결 조회, 오더북과 체결 스트림 표시를 제공합니다.

프론트엔드는 거래 화면에서 사용자가 실제 거래소와 비슷한 흐름을 따라가며 주문, 체결, 잔고 변화를 확인할 수 있도록 구성했습니다.

## 핵심 기능

| 영역 | 구현 내용 |
| --- | --- |
| 인증 UI | 회원가입, 로그인, 로그아웃, JWT 저장 |
| 계정 패널 | KRW/코인 available, locked, 총 보유량, 평균매수가, 평가손익 표시 |
| 개발용 충전 | 로컬 시연용 KRW/선택 코인 fund 버튼 |
| 주문 폼 | 지정가/시장가 BUY/SELL, decimal string 전송 |
| 주문 정책 | 백엔드 market rules 기반 tick size, 수량 step, 주문 타입 검증 |
| 주문 목록 | open order 표시, 주문 취소 |
| 입출금 | 입금/출금 요청 폼과 요청 내역 표시(`src/components/assets/`) |
| 멱등성 | 주문은 `Idempotency-Key`, 이체는 `client_request_key`를 시도 단위로 생성·재사용 |
| 체결 내역 | 사용자 체결, 수수료 asset, 체결 가격/수량 표시 |
| 오더북 | REST snapshot으로 초기 동기화, WebSocket으로 실시간 갱신 |
| 실시간 체결 | WebSocket trade 메시지 기반 체결 내역 갱신 |
| WebSocket 재연결 | exponential backoff 기반 reconnect helper |
| E2E 검증 | Playwright로 거래 핵심 시나리오 검증 |

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

## 백엔드 연동 구조

```mermaid
flowchart LR
    UI["Trading UI"]
    API["src/lib/api.ts"]
    Backend["Go Exchange Backend"]
    WS["WebSocket"]
    State["React State"]

    UI --> API
    API --> Backend
    Backend --> API
    UI --> WS
    WS --> State
    State --> UI
```

HTTP API:

- `POST /auth/register`
- `POST /auth/login`
- `GET /markets/rules?coin_symbol=BTC`
- `GET /orderbook?coin_symbol=BTC`
- `POST /orders`
- `DELETE /orders/:id`
- `GET /orders`
- `GET /wallets`
- `GET /trades`
- `POST /transfers/deposits`
- `POST /transfers/withdrawals`
- `GET /transfers`
- `POST /dev/wallets/fund`

WebSocket:

- `GET /ws`
- `orderbook` 메시지로 선택 코인의 호가를 갱신합니다.
- `trade` 메시지로 실시간 체결 흐름을 갱신합니다.

프론트엔드는 금액과 수량을 `number`로 변환해 전송하지 않고 decimal string으로 백엔드에 전달합니다.
백엔드에서 받은 decimal string도 화면 표시 단계에서만 포맷팅합니다.

## 멱등성 계약

주문 생성은 `Idempotency-Key` 헤더가, 입출금 요청은 본문의 `client_request_key`가 **필수**입니다.
응답을 받지 못한 재시도가 중복 주문·중복 이체를 만들지 않게 하려는 것이므로,
**키를 언제 버리고 언제 유지하는지가 계약의 핵심**입니다.

- **한 번의 시도마다 키 하나**를 만듭니다(`src/lib/idempotencyKey.ts`).
- 응답을 받지 못했거나 서버의 처리 여부를 알 수 없으면 **같은 키로** 재시도합니다.
- 서버가 요청 자체를 판정해 거절했으면(확정적 4xx) 그 시도는 끝난 것이므로 키를 버리고 다음 제출에 새 키를 씁니다.

| 응답 | 키 | 이유 |
| --- | --- | --- |
| network error(응답 없음) | 유지 | 서버 커밋 여부 불명 |
| `5xx`(주문 실패 detail 없음) | 유지 | 서버 커밋 여부 불명 |
| `503` + `UNKNOWN`·`PENDING` | 유지 | 상태 확인이 필요한 미확정 |
| `503` + `REJECTED` | 폐기 | 보상이 끝나 새 주문에 새 키가 필요 |
| `408` | 유지 | 처리 여부가 모호 |
| **`429`** | **유지** | **rate limit은 요청을 판정한 것이 아니라 처리하지 않고 거절한 것** |
| 그 외 `4xx`(`400`·`401`·`403`·`409`·`422`) | 폐기 | 서버가 요청 자체를 판정 |

위 표는 주문 폼의 규칙이고, `shouldRetainIdempotencyKeyAfterError`(`src/components/trading/OrderForm.tsx`)가 그대로 구현합니다.
이체 폼은 주문 전용 실패 detail이 없으므로 축약형(`4xx`는 폐기, 단 `429`는 유지)을 씁니다 —
따라서 **`408`은 이체 폼에서 아직 폐기 대상**입니다. 백엔드 rate limit이 만든 계약은 `429`뿐이라 이번 범위에서 맞추지 않았고, 프록시가 `408`을 낼 수 있는 배포에서는 함께 유지하도록 바꾸는 편이 안전합니다.
두 폼 모두 회귀 테스트로 `429` 재시도가 **같은 키**를 쓰는지 검증합니다.

## 오더북 동기화

오더북은 REST snapshot과 WebSocket stream을 함께 사용합니다.

```mermaid
sequenceDiagram
    participant User as User
    participant Front as Frontend
    participant API as Backend REST
    participant WS as Backend WS

    User->>Front: 코인 선택 또는 새로고침
    Front->>API: GET /orderbook?coin_symbol=...
    API-->>Front: 현재 snapshot
    Front->>Front: 오더북 초기 렌더링
    WS-->>Front: 이후 orderbook 업데이트
    Front->>Front: 실시간 갱신
```

이 구조로 사용자가 늦게 접속하거나 새로고침해도 이미 올라와 있는 주문을 화면에서 바로 확인할 수 있습니다.

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

두 token이 다르면 `POST /dev/wallets/fund`가 실패합니다.

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

- 회원가입, 로그인, JWT 인증 흐름
- KRW/코인 개발용 충전
- 자산 페이지에서 입금 요청 후 가짜 완료 통보로 잔고 증가 확인
- 응답을 잃은 출금 재시도가 이중 잠금을 만들지 않음
- 응답을 잃은 주문 재시도가 중복 주문을 만들지 않음(`Idempotency-Key` 전송·같은 키 중복 제출)
- 지정가 매수 주문 생성과 취소
- 지정가 매도와 매수 체결
- 시장가 매수와 시장가 매도 체결
- 자기 체결 방지
- 부분 체결 후 주문 취소와 locked balance release
- 가격 개선 환급
- 수수료 표시
- 평균매수가 계산과 전량 매도 후 reset
- market rules API 기반 주문 정책 반영
- 인증 오류와 dev token 보호
- 중복 취소 시 locked balance 이중 release 방지
- 오더북 REST snapshot 초기 동기화
- WebSocket 기반 실시간 갱신

## 로컬 시연 흐름

1. 백엔드를 `go run ./cmd`로 실행합니다(`GOEXCHANGE_JWT_SECRET`이 설정돼 있어야 부팅합니다).
2. 프론트엔드를 `npm run dev`로 실행합니다.
3. 계정 A와 계정 B를 만듭니다.
4. 계정 A에는 코인을, 계정 B에는 KRW를 충전합니다.
5. 계정 A가 지정가 매도 주문을 올립니다.
6. 계정 B에서 같은 코인을 선택해 오더북 snapshot이 보이는지 확인합니다.
7. 계정 B가 지정가 또는 시장가 매수로 체결합니다.
8. 양쪽 계정의 지갑, 주문 목록, 체결 내역, 오더북 변화를 확인합니다.
9. 자산 페이지에서 입금·출금을 요청하고 요청 내역의 상태 변화를 확인합니다(가짜 은행·체인이라 결과는 백엔드의 콜백 또는 폴링으로 확정됩니다).
