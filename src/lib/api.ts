import type { MarketRules } from "./orderPolicy";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const DEV_TOOLS_TOKEN = import.meta.env.VITE_DEV_TOOLS_TOKEN?.trim() ?? "";
export const DEV_TOOLS_ENABLED =
  import.meta.env.VITE_ENABLE_DEV_TOOLS === "true" && DEV_TOOLS_TOKEN !== "";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface Wallet {
  id: number;
  coin_symbol: string;
  available_balance: string;
  locked_balance: string;
  total_balance: string;
  avg_buy_price: string;
}

export interface Order {
  id: number;
  coin_symbol: string;
  side: "BUY" | "SELL";
  order_type: "LIMIT" | "MARKET";
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED";
  price: string;
  amount: string;
  quote_amount: string;
  filled_amount: string;
  filled_quote_amount: string;
  remaining: string;
  created_at: string;
}

export interface Trade {
  id: number;
  idempotency_key: string;
  engine_sequence: number;
  engine_event_id: string;
  coin_symbol: string;
  side: "BUY" | "SELL";
  price: string;
  quantity: string;
  fee_rate: string;
  buyer_fee: string;
  buyer_fee_asset: string;
  seller_fee: string;
  seller_fee_asset: string;
  traded_at: string;
  buy_order_id: number;
  sell_order_id: number;
}

export interface OrderBookLevel {
  price: string | number;
  quantity: string | number;
}

export interface OrderBookSnapshot {
  coin_symbol: string;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
}

// 서버는 취소를 "완료"가 아니라 "접수"로 응답한다(202). 이 시점에는 주문이 아직
// 오더북에 있을 수 있고 해제 금액도 확정되지 않았으므로, 예전의 released_*·
// engine_removed 필드는 존재하지 않는다. 최종 상태는 주문 조회로 확인한다.
export interface CancelOrderResponse {
  message: string;
  order_id: number;
  command_id: number;
  status: "ACCEPTED";
}

interface ApiErrorPayload {
  error?: string | {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

interface ApiDataPayload<T> {
  data?: T;
}

export class ApiError extends Error {
  status: number;
  code: string;
  // 주문 생성 503은 order_id와 durable outcome을 함께 싣는다. 오류에서 이를 버리면
  // 사용자가 그 주문을 찾아갈 수 없다.
  data?: unknown;

  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export interface OrderFailureDetail {
  order_id: number;
  status: "REJECTED" | "UNKNOWN" | "PENDING";
}

// orderFailureDetail은 실패 응답에서 주문 식별자와 durable outcome을 꺼낸다.
// 응답이 도착하지 않은 network error에는 아무것도 없다 — null이 곧 "서버가 답하지 않았다"다.
export function orderFailureDetail(error: unknown): OrderFailureDetail | null {
  if (!(error instanceof ApiError) || !isRecord(error.data)) return null;

  const { order_id: orderID, status } = error.data;
  if (typeof orderID !== "number") return null;
  if (status !== "REJECTED" && status !== "UNKNOWN" && status !== "PENDING") return null;

  return { order_id: orderID, status };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CreateOrderInput {
  coin_symbol: string;
  side: "BUY" | "SELL";
  order_type: "LIMIT" | "MARKET";
  price?: string;
  amount?: string;
  quote_amount?: string;
}

// 200은 message를, 202(PENDING)는 status를 싣는다. 둘 다 order_id는 있다.
export interface CreateOrderResponse {
  message?: string;
  order_id: number;
  status?: "PENDING";
  idempotent_replay?: boolean;
}

export async function createOrder(
  token: string,
  input: CreateOrderInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CreateOrderResponse> {
  return apiRequest<CreateOrderResponse>("/orders", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    signal,
  });
}

export async function cancelOrder(
  token: string,
  orderID: number,
): Promise<CancelOrderResponse> {
  return apiRequest<CancelOrderResponse>(`/orders/${orderID}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchOrder(
  token: string,
  orderID: number,
  signal?: AbortSignal,
): Promise<{ order: Order }> {
  return apiRequest<{ order: Order }>(`/orders/${orderID}`, { token, signal });
}

export async function fetchWallets(
  token: string,
): Promise<{ wallets: Wallet[] }> {
  return apiRequest<{ wallets: Wallet[] }>("/wallets", { token });
}

export async function fetchOrders(
  token: string,
  limit = 10,
): Promise<{ orders: Order[] }> {
  return apiRequest<{ orders: Order[] }>(`/orders?limit=${limit}`, { token });
}

export async function fetchTrades(
  token: string,
  limit = 10,
): Promise<{ trades: Trade[] }> {
  return apiRequest<{ trades: Trade[] }>(`/trades?limit=${limit}`, { token });
}

export async function fetchMarketRules(coinSymbol: string): Promise<MarketRules> {
  const params = new URLSearchParams({ coin_symbol: coinSymbol });
  return apiRequest<MarketRules>(`/markets/rules?${params.toString()}`);
}

export async function fetchOrderBookSnapshot(
  coinSymbol: string,
): Promise<OrderBookSnapshot> {
  const params = new URLSearchParams({ coin_symbol: coinSymbol });
  return apiRequest<OrderBookSnapshot>(`/orderbook?${params.toString()}`);
}

export async function fundWallet(
  token: string,
  input: { coin_symbol: string; amount: string },
): Promise<{ message: string; wallet: Wallet }> {
  if (!DEV_TOOLS_TOKEN) {
    throw new ApiError(404, "DEV_TOOLS_DISABLED", "Development funding is disabled");
  }

  return apiRequest<{ message: string; wallet: Wallet }>("/dev/wallets/fund", {
    method: "POST",
    token,
    headers: {
      "X-GoExchange-Dev-Token": DEV_TOOLS_TOKEN,
    },
    body: JSON.stringify(input),
  });
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const { code, message } = parseAPIError(data as ApiErrorPayload);
    throw new ApiError(
      response.status,
      code,
      message,
      isRecord(data) ? (data as ApiDataPayload<unknown>).data : undefined,
    );
  }

  return unwrapAPIData<T>(data);
}

function unwrapAPIData<T>(data: unknown): T {
  if (isRecord(data) && "data" in data) {
    return (data as ApiDataPayload<T>).data as T;
  }
  return data as T;
}

function parseAPIError(data: ApiErrorPayload) {
  if (typeof data.error === "object" && data.error !== null) {
    return {
      code: data.error.code ?? "API_ERROR",
      message: data.error.message ?? "API request failed",
    };
  }

  if (typeof data.error === "string") {
    return {
      code: data.code ?? "API_ERROR",
      message: data.error,
    };
  }

  return {
    code: data.code ?? "API_ERROR",
    message: data.message ?? "API request failed",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
