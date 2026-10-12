"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuthStore, type SessionData } from "@/stores/auth-store";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

type BffRefreshResponse = {
  access_token: string;
  access_expires_at: string;
  user_id: string;
  role: string;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const bootstrapped = useRef(false);
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrating = useAuthStore((s) => s.setHydrating);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Attempt silent refresh using the httpOnly cookie.
    // If successful → populate in-memory access token.
    // Either way → mark hydration done so layout guards can act.
    fetch("/api/auth/refresh", { method: "POST" })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as BffRefreshResponse;
          setSession({
            accessToken: data.access_token,
            userId: data.user_id,
            role: data.role,
          } satisfies SessionData);
        }
      })
      .catch(() => {
        // No cookie / network error — stay unauthenticated
      })
      .finally(() => {
        setHydrating(false);
      });

    // Listen for logout events from other tabs
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("auth");
      const onMessage = (e: MessageEvent<{ type: string }>) => {
        if (e.data?.type === "logout") {
          useAuthStore.getState().clearAuth();
          // Layout guards will handle redirect when accessToken becomes null
        }
      };
      bc.addEventListener("message", onMessage);
      return () => {
        bc.removeEventListener("message", onMessage);
        bc.close();
      };
    }
  }, [setSession, setHydrating]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
