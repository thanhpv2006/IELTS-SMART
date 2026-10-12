import { ApiError } from "@/lib/api/errors";
import type { SessionData } from "@/stores/auth-store";
import type { LoginRequest, LoginResponse } from "./types";

function toSessionData(r: LoginResponse): SessionData {
  return {
    accessToken: r.access_token,
    userId: r.user_id,
    role: r.role,
  };
}

export const authApi = {
  /**
   * Calls the BFF route handler POST /api/auth/login.
   * Returns session data (no refresh token — lives in httpOnly cookie).
   */
  login: async (body: LoginRequest): Promise<SessionData> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as LoginResponse & { code?: string; message?: string };

    if (!res.ok) {
      throw new ApiError(res.status, {
        code: json.code ?? "unknown",
        message: json.message ?? "Đăng nhập thất bại. Vui lòng thử lại.",
      });
    }

    return toSessionData(json);
  },

  /**
   * Calls the BFF route handler POST /api/auth/logout.
   * Clears httpOnly cookie server-side; best-effort backend logout.
   */
  logout: async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // swallow network errors on logout
    }
  },
};
