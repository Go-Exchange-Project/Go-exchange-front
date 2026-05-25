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
  filled_amount: string;
  remaining: string;
  created_at: string;
}

export interface CancelOrderResponse {
  message: string;
  order_id: number;
  status: "CANCELLED";
  released_asset: string;
  released_amount: string;
  engine_removed: boolean;
}

interface ApiErrorPayload {
  error?: string | {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
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

export async function createOrder(
  token: string,
  input: {
    coin_symbol: string;
    side: "BUY" | "SELL";
    order_type: "LIMIT";
    price: string;
    amount: string;
  },
): Promise<{ message: string; order_id: number }> {
  return apiRequest<{ message: string; order_id: number }>("/orders", {
    method: "POST",
    token,
    body: JSON.stringify(input),
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

export async function fetchMarketRules(coinSymbol: string): Promise<MarketRules> {
  const params = new URLSearchParams({ coin_symbol: coinSymbol });
  return apiRequest<MarketRules>(`/markets/rules?${params.toString()}`);
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
    throw new ApiError(response.status, code, message);
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
