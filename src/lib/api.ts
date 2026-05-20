export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
export const DEV_TOOLS_ENABLED =
  import.meta.env.VITE_ENABLE_DEV_TOOLS === "true";

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

export async function fundWallet(
  token: string,
  input: { coin_symbol: string; amount: string },
): Promise<{ message: string; wallet: Wallet }> {
  return apiRequest<{ message: string; wallet: Wallet }>("/dev/wallets/fund", {
    method: "POST",
    token,
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
    const message =
      typeof data.error === "string" ? data.error : "API request failed";
    throw new Error(message);
  }

  return data as T;
}
