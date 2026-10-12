"use client";

import { create } from "zustand";

// Session data available client-side (access token only — refresh token lives in httpOnly cookie)
export type SessionData = {
  accessToken: string;
  userId: string;
  role: string;
};

type AuthState = {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  hydrating: boolean;
  setSession: (data: SessionData) => void;
  clearAuth: () => void;
  setHydrating: (b: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  userId: null,
  role: null,
  hydrating: true,

  setSession: (data) =>
    set({
      accessToken: data.accessToken,
      userId: data.userId,
      role: data.role,
    }),

  clearAuth: () =>
    set({ accessToken: null, userId: null, role: null }),

  setHydrating: (b) => set({ hydrating: b }),
}));

/** Returns access pair for use in apiFetch; null when not authenticated. */
export function getAuthTokens(): { accessToken: string; userId: string | null; role: string | null } | null {
  const { accessToken, userId, role } = useAuthStore.getState();
  if (!accessToken) return null;
  return { accessToken, userId, role };
}
