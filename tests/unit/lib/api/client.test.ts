/**
 * Unit tests for src/lib/api/client.ts
 *
 * MSW intercepts fetch calls made by rawFetch (API base: http://localhost:8080/api/v1)
 * and by ensureRefresh (BFF: /api/auth/refresh — relative URL, resolved to http://localhost/api/auth/refresh
 * in jsdom).
 *
 * Auth store is seeded directly via useAuthStore.getState().setSession() before each test
 * and cleared with clearAuth() in afterEach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../setup";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError, NetworkError } from "@/lib/api/errors";

// ── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8080/api/v1";
const BFF_REFRESH = "http://localhost/api/auth/refresh";

function seedAuth(accessToken = "old-token") {
  useAuthStore.getState().setSession({
    accessToken,
    userId: "u1",
    role: "partner_owner",
    plan: "FREE",
  });
}

function clearAuth() {
  useAuthStore.getState().clearAuth();
}

// Import apiFetch lazily inside tests so the Zustand store is already configured
// when the module initialises (module-level singleton `refreshPromise` must be null).
// We use a dynamic import pattern via a factory so each describe block can re-import
// after vi.resetModules() if needed — but for this suite a single top-level import
// is fine because we control the store state directly.

// Top-level import — client.ts accesses the store at call time, not at import time.
import { apiFetch, rawFetch } from "@/lib/api/client";

// ── Suite 1: buildUrl / query filtering (API-07) ─────────────────────────────

describe("buildUrl via rawFetch — API-07", () => {
  beforeEach(() => seedAuth());
  afterEach(() => clearAuth());

  it("API-07: excludes null query params from URL", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${API_BASE}/items`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await rawFetch("/items", { query: { a: "1", b: null, c: undefined, d: "" } }, "tok");
    const url = new URL(capturedUrl);
    expect(url.searchParams.has("b")).toBe(false);
    expect(url.searchParams.has("c")).toBe(false);
    // empty string is also filtered
    expect(url.searchParams.has("d")).toBe(false);
    expect(url.searchParams.get("a")).toBe("1");
  });

  it("API-07: no query string when all params are null/undefined", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${API_BASE}/items`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await rawFetch("/items", { query: { x: null, y: undefined } }, "tok");
    expect(capturedUrl).toBe(`${API_BASE}/items`);
  });

  it("API-07: no query object → clean URL", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${API_BASE}/ping`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );

    await rawFetch("/ping", {}, "tok");
    expect(capturedUrl).toBe(`${API_BASE}/ping`);
  });
});

// ── Suite 2: headers (API-04) ─────────────────────────────────────────────────

describe("request headers — API-04", () => {
  beforeEach(() => seedAuth());
  afterEach(() => clearAuth());

  it("API-04: sends Authorization Bearer and Accept-Language: vi", async () => {
    let authHeader = "";
    let langHeader = "";
    server.use(
      http.get(`${API_BASE}/me`, ({ request }) => {
        authHeader = request.headers.get("authorization") ?? "";
        langHeader = request.headers.get("accept-language") ?? "";
        return HttpResponse.json({ id: "u1" });
      }),
    );

    await rawFetch("/me", {}, "my-access-token");
    expect(authHeader).toBe("Bearer my-access-token");
    expect(langHeader).toBe("vi");
  });

  it("API-04: skipAuth → no Authorization header", async () => {
    let authHeader: string | null = null;
    server.use(
      http.post(`${API_BASE}/auth/login`, ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({ access_token: "tok" });
      }),
    );

    await rawFetch("/auth/login", { method: "POST", skipAuth: true, body: { email: "a@b.com", password: "pw" } }, null);
    expect(authHeader).toBeNull();
  });

  it("API-04: null accessToken → no Authorization header (unauthenticated)", async () => {
    let authHeader: string | null = "SENTINEL";
    server.use(
      http.get(`${API_BASE}/public`, ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({});
      }),
    );

    await rawFetch("/public", {}, null);
    expect(authHeader).toBeNull();
  });
});

// ── Suite 3: 204 / empty body (API-06) ───────────────────────────────────────

describe("204 and empty-body responses — API-06", () => {
  beforeEach(() => seedAuth());
  afterEach(() => clearAuth());

  it("API-06: 204 No Content → returns undefined without crashing", async () => {
    server.use(
      http.delete(`${API_BASE}/items/1`, () => new HttpResponse(null, { status: 204 })),
    );

    const result = await rawFetch("/items/1", { method: "DELETE" }, "tok");
    expect(result).toBeUndefined();
  });

  it("API-06: content-length 0 → returns undefined without crashing", async () => {
    server.use(
      http.put(`${API_BASE}/items/2`, () =>
        new HttpResponse(null, {
          status: 200,
          headers: { "content-length": "0" },
        }),
      ),
    );

    const result = await rawFetch("/items/2", { method: "PUT" }, "tok");
    expect(result).toBeUndefined();
  });
});

// ── Suite 4: non-JSON error body fallback (API-09) ────────────────────────────

describe("non-JSON error body — API-09", () => {
  beforeEach(() => seedAuth());
  afterEach(() => clearAuth());

  it("API-09: HTML error body → fallback {code:'unknown', message:'HTTP <status>'}", async () => {
    server.use(
      http.get(`${API_BASE}/oops`, () =>
        new HttpResponse("<html>Internal Server Error</html>", {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(rawFetch("/oops", {}, "tok")).rejects.toSatisfy((e: unknown) => {
      const err = e as ApiError;
      return err instanceof ApiError && err.status === 500 && err.code === "unknown" && err.message === "HTTP 500";
    });
  });

  it("API-09: plain text error body → fallback message", async () => {
    server.use(
      http.get(`${API_BASE}/text-err`, () =>
        new HttpResponse("Bad Gateway", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(rawFetch("/text-err", {}, "tok")).rejects.toSatisfy((e: unknown) => {
      const err = e as ApiError;
      return err instanceof ApiError && err.status === 502 && err.body.message === "HTTP 502";
    });
  });
});

// ── Suite 5: NetworkError (API-08) ────────────────────────────────────────────

describe("network failure — API-08", () => {
  beforeEach(() => seedAuth());
  afterEach(() => clearAuth());

  it("API-08: fetch rejects (network error) → throws NetworkError with Vietnamese message", async () => {
    server.use(
      http.get(`${API_BASE}/flaky`, () => HttpResponse.error()),
    );

    await expect(rawFetch("/flaky", {}, "tok")).rejects.toSatisfy((e: unknown) => {
      return (
        e instanceof NetworkError &&
        e.message === "Không kết nối được máy chủ. Vui lòng thử lại."
      );
    });
  });
});

// ── Suite 6: 401 → refresh → retry (API-01) ──────────────────────────────────

describe("401 auto-refresh flow — API-01", () => {
  beforeEach(() => seedAuth("expired-token"));
  afterEach(() => clearAuth());

  it("API-01: 401 on first attempt → calls /api/auth/refresh → retries with new token → returns data", async () => {
    let refreshCalled = false;
    let secondRequestToken = "";

    server.use(
      // First call returns 401; second call (after refresh) returns data.
      http.get(`${API_BASE}/protected`, ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (auth.includes("expired-token")) {
          return new HttpResponse(JSON.stringify({ code: "unauthorized", message: "Hết hạn" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        secondRequestToken = auth;
        return HttpResponse.json({ secret: "data" });
      }),
      // BFF refresh endpoint — returns new access token.
      http.post(BFF_REFRESH, () => {
        refreshCalled = true;
        return HttpResponse.json({
          access_token: "new-token",
          access_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          user_id: "u1",
          role: "partner_owner",
          plan: "FREE",
        });
      }),
    );

    const result = await apiFetch<{ secret: string }>("/protected");

    expect(refreshCalled).toBe(true);
    expect(result.secret).toBe("data");
    // Verify the retry used the new token.
    expect(secondRequestToken).toBe("Bearer new-token");
    // Auth store should now hold the new token.
    expect(useAuthStore.getState().accessToken).toBe("new-token");
  });
});

// ── Suite 7: refresh fail → clearAuth + throw (API-02) ───────────────────────

describe("refresh failure — API-02", () => {
  beforeEach(() => seedAuth("stale-token"));
  afterEach(() => clearAuth());

  it("API-02: refresh returns 401 → clearAuth() is called + error is thrown", async () => {
    server.use(
      http.get(`${API_BASE}/sensitive`, () =>
        new HttpResponse(JSON.stringify({ code: "unauthorized", message: "Token hết hạn" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post(BFF_REFRESH, () =>
        new HttpResponse(JSON.stringify({ code: "refresh_expired", message: "Refresh hết hạn" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/sensitive")).rejects.toBeInstanceOf(ApiError);
    // Auth store must be cleared after failed refresh.
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().userId).toBeNull();
  });

  it("API-02: refresh network error → clearAuth() + throws original 401 ApiError", async () => {
    server.use(
      http.get(`${API_BASE}/sensitive2`, () =>
        new HttpResponse(JSON.stringify({ code: "unauthorized", message: "Expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post(BFF_REFRESH, () => HttpResponse.error()),
    );

    await expect(apiFetch("/sensitive2")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

// ── Suite 8: skipAutoRefresh — no infinite loop (API-03) ─────────────────────

describe("skipAutoRefresh — API-03", () => {
  beforeEach(() => seedAuth("token-always-401"));
  afterEach(() => clearAuth());

  it("API-03: 401 retry still fails → throws, does NOT loop infinitely", async () => {
    let callCount = 0;

    server.use(
      http.get(`${API_BASE}/always-401`, () => {
        callCount += 1;
        return new HttpResponse(JSON.stringify({ code: "unauthorized", message: "Forbidden" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }),
      http.post(BFF_REFRESH, () =>
        HttpResponse.json({
          access_token: "new-token-still-401",
          access_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          user_id: "u1",
          role: "partner_owner",
          plan: "FREE",
        }),
      ),
    );

    // apiFetch calls rawFetch (attempt 1 — 401) → refresh → rawFetch with skipAutoRefresh
    // (attempt 2 — 401) → throws; no third attempt.
    await expect(apiFetch("/always-401")).rejects.toBeInstanceOf(ApiError);

    // Exactly 2 calls to the protected endpoint: original + one retry.
    expect(callCount).toBe(2);
  });

  it("API-03: apiFetch with skipAutoRefresh:true on 401 → throws immediately without refreshing", async () => {
    let refreshCalled = false;

    server.use(
      http.get(`${API_BASE}/skip`, () =>
        new HttpResponse(JSON.stringify({ code: "unauthorized", message: "No" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post(BFF_REFRESH, () => {
        refreshCalled = true;
        return HttpResponse.json({ access_token: "x", access_expires_at: "", user_id: "u", role: "r", plan: "p" });
      }),
    );

    await expect(apiFetch("/skip", { skipAutoRefresh: true })).rejects.toBeInstanceOf(ApiError);
    expect(refreshCalled).toBe(false);
  });
});

// ── Suite 9: unauthenticated request skips refresh (API-01 edge) ──────────────

describe("unauthenticated request — no refresh attempt", () => {
  it("no accessToken in store → 401 is thrown immediately without calling refresh", async () => {
    // store is empty (no seedAuth)
    let refreshCalled = false;
    server.use(
      http.get(`${API_BASE}/anon`, () =>
        new HttpResponse(JSON.stringify({ code: "unauthorized", message: "login required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post(BFF_REFRESH, () => {
        refreshCalled = true;
        return HttpResponse.json({});
      }),
    );

    await expect(apiFetch("/anon")).rejects.toBeInstanceOf(ApiError);
    // condition `tokens?.accessToken` is falsy → refresh must NOT be called
    expect(refreshCalled).toBe(false);
  });
});
