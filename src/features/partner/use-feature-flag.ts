"use client";

import { useQuery } from "@tanstack/react-query";
import { accountApi } from "./api";

export const featureFlagsQueryKey = ["me-flags"] as const;

export type FeatureFlagState = {
  enabled: boolean;
  /** True until the flag map has arrived. Gate redirects on this, never on `enabled` alone. */
  loading: boolean;
};

/**
 * useFeatureFlag reads one key out of GET /me/flags.
 *
 * Unknown keys and in-flight requests both resolve to `false`, so a gated entry point stays
 * hidden rather than flashing into view and disappearing — and a flag whose row was never
 * seeded behaves as off instead of on.
 */
export function useFeatureFlag(key: string, options?: { enabled?: boolean }): FeatureFlagState {
  const { data, isPending } = useQuery({
    queryKey: featureFlagsQueryKey,
    queryFn: accountApi.myFlags,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
  });

  const active = options?.enabled ?? true;
  return {
    enabled: data?.flags?.[key] === true,
    loading: active && isPending,
  };
}
