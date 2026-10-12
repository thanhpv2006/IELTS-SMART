import { getAuthTokens, useAuthStore, type SessionData } from "@/stores/auth-store";
import { ApiError, type ApiErrorBody, NetworkError } from "./errors";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1";

type FetchInit = Omit<RequestInit, "body" | "method" | "headers"> & {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipAutoRefresh?: boolean;
};

function buildUrl(path: string, query?: FetchInit["query"]) {
  const base = API_BASE.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try { body = (await res.json()) as ApiErrorBody; }
  catch { body = { code: "unknown", message: `HTTP ${res.status}` }; }
  return new ApiError(res.status, body);
}

export async function rawFetch<T>(path: string, init: FetchInit, accessToken: string | null): Promise<T> {
  const url = buildUrl(path, init.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "vi",
    ...(init.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (init.body instanceof FormData) {
      body = init.body;
      // Let browser set Content-Type with multipart boundary automatically
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
  }
  if (!init.skipAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { method: init.method ?? "GET", headers, body, cache: "no-store" });
  } catch (e) {
    throw new NetworkError("Không kết nối được máy chủ. Vui lòng thử lại.", e);
  }

  if (!res.ok) throw await parseError(res);

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

// Single-flight refresh: at most one /api/auth/refresh call in-flight at a time.
let refreshPromise: Promise<boolean> | null = null;

type BffRefreshResponse = {
  access_token: string;
  access_expires_at: string;
  user_id: string;
  role: string;
};

async function ensureRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          // credentials "same-origin" is the default — cookie will be sent automatically
        });
        if (!res.ok) return false;
        const data = (await res.json()) as BffRefreshResponse;
        useAuthStore.getState().setSession({
          accessToken: data.access_token,
          userId: data.user_id,
          role: data.role,
        } satisfies SessionData);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function broadcastLogout() {
  if (typeof BroadcastChannel !== "undefined") {
    new BroadcastChannel("auth").postMessage({ type: "logout" });
  }
}

export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const tokens = getAuthTokens();
  try {
    return await rawFetch<T>(path, init, tokens?.accessToken ?? null);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !init.skipAutoRefresh && tokens?.accessToken) {
      const ok = await ensureRefresh();
      if (ok) {
        const fresh = getAuthTokens();
        return rawFetch<T>(path, { ...init, skipAutoRefresh: true }, fresh?.accessToken ?? null);
      }
      useAuthStore.getState().clearAuth();
      broadcastLogout();
    }
    throw e;
  }
}
