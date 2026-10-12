"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore, type SessionData } from "@/stores/auth-store";
import { authApi } from "./api";
import { routeForRole } from "./routing";
import type { LoginRequest } from "./types";

function broadcastLogout() {
  if (typeof BroadcastChannel !== "undefined") {
    new BroadcastChannel("auth").postMessage({ type: "logout" });
  }
}

function useSessionSetter() {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  const router = useRouter();

  return (data: SessionData) => {
    setSession(data);
    qc.clear();
    // Role lạ → routeForRole trả "/login" (AUTH-04).
    router.push(routeForRole(data.role));
  };
}

export function useLogin() {
  const onAuthed = useSessionSetter();
  return useMutation<SessionData, ApiError, LoginRequest>({
    mutationFn: (body) => authApi.login(body),
    onSuccess: onAuthed,
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const qc = useQueryClient();
  const router = useRouter();

  return async () => {
    await authApi.logout();
    clearAuth();
    qc.clear();
    broadcastLogout();
    router.push("/login");
  };
}
