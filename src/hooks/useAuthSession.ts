import { useCallback, useState } from "react";
import { AuthResponse, AuthUser } from "@/lib/api";

const TOKEN_STORAGE_KEY = "goexchange.auth.token";
const USER_STORAGE_KEY = "goexchange.auth.user";

// useAuthSession은 로그인 토큰·사용자를 localStorage에 얹어 페이지 간에 공유한다.
// 거래 화면(Index)과 자산 화면(Assets)이 같은 로그인 상태를 봐야 하므로 이것만
// 꺼냈다 — 거래 화면의 지갑·주문·웹소켓 상태는 그대로 Index.tsx에 남는다.
export function useAuthSession() {
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY),
  );
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });

  const applyAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, auth.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(auth.user));
    setAuthToken(auth.token);
    setAuthUser(auth.user);
  }, []);

  const clearAuthSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setAuthToken(null);
    setAuthUser(null);
  }, []);

  return { authToken, authUser, applyAuth, clearAuthSession };
}
