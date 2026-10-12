/**
 * Smoke test: login form renders and exposes expected testids.
 *
 * LoginPage calls useLogin() at render time, which internally calls
 * useRouter() from next/navigation. We mock both next/navigation and
 * next/headers (imported transitively by some server utilities) so that
 * the component tree can mount in jsdom without the Next.js app-router
 * runtime present.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandProvider } from "@/brand/context";
import { BRANDS } from "@/brand";

// vi.mock is hoisted to the top of the file by vitest's transformer, so these
// mocks are in effect before any module in this file (including LoginPage) is
// evaluated.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// Lazy import AFTER mocks are declared.
const { default: LoginPage } = await import("@/app/(auth)/login/page");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <BrandProvider brand={BRANDS.ieltssmart}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </BrandProvider>
  );
}

describe("LoginPage smoke", () => {
  it("renders email-input", () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
  });

  it("renders password-input", () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
  });

  it("renders login-submit button", () => {
    render(<LoginPage />, { wrapper });
    expect(screen.getByTestId("login-submit")).toBeInTheDocument();
  });
});
