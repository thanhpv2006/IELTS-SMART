import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ myFlags: vi.fn() }));

vi.mock("./api", () => ({ accountApi: { myFlags: mocks.myFlags } }));

const { useFeatureFlag } = await import("./use-feature-flag");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFeatureFlag", () => {
  it("reports enabled once the flag map says so", async () => {
    mocks.myFlags.mockResolvedValue({ flags: { ai_import: true } });

    const { result } = renderHook(() => useFeatureFlag("ai_import"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });

  it("stays off for a key the server does not return", async () => {
    mocks.myFlags.mockResolvedValue({ flags: { something_else: true } });

    const { result } = renderHook(() => useFeatureFlag("ai_import"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
  });

  it("stays off while the flag map is still loading", () => {
    mocks.myFlags.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFeatureFlag("ai_import"), { wrapper });

    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it("does not call the endpoint, and does not report loading, when disabled", () => {
    const { result } = renderHook(() => useFeatureFlag("ai_import", { enabled: false }), {
      wrapper,
    });

    expect(mocks.myFlags).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("stays off when the request fails rather than failing open", async () => {
    mocks.myFlags.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useFeatureFlag("ai_import"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
  });
});
