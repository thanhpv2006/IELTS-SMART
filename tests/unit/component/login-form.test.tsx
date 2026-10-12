/**
 * Component tests for the login form (LoginPage).
 * Covers AUTH-05, AUTH-08, AUTH-09.
 *
 * Cases:
 *   AUTH-05 — HTML5 `required` on email + password blocks submit (browser-native
 *             validation; jsdom fires "invalid" events so we can assert the
 *             inputs are still present and the mutation was not called).
 *   AUTH-08 — Toggle show/hide password changes <input type>.
 *   AUTH-09 — While isPending the submit button is disabled and shows
 *             "Đang đăng nhập...".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandProvider } from "@/brand/context";
import { BRANDS } from "@/brand";

// Mock next/navigation before importing the page component.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// Lazy import so mocks above are already in place.
const { default: LoginPage } = await import("@/app/(auth)/login/page");

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrandProvider brand={BRANDS.ieltssmart}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </BrandProvider>
    );
  };
}

// ─── AUTH-05: HTML5 required ────────────────────────────────────────────────

describe("AUTH-05 — HTML5 required blocks submit when fields empty", () => {
  it("email-input has required attribute", () => {
    render(<LoginPage />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("email-input")).toBeRequired();
  });

  it("password-input has required attribute", () => {
    render(<LoginPage />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("password-input")).toBeRequired();
  });

  it("form does not trigger mutation when submitted with empty fields", async () => {
    // Mock apiFetch so we can detect whether a network call was made.
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    render(<LoginPage />, { wrapper: makeWrapper() });
    // Submit with both fields empty — HTML5 constraint validation prevents the
    // form's submit event from firing (jsdom respects `required`).
    fireEvent.submit(screen.getByTestId("login-submit").closest("form")!);

    // Ensure fetch was NOT called (no mutation triggered).
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── AUTH-08: Toggle password visibility ───────────────────────────────────

describe("AUTH-08 — Toggle show/hide password", () => {
  it("password input is of type password by default", () => {
    render(<LoginPage />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("password-input")).toHaveAttribute("type", "password");
  });

  it("clicking toggle button changes input type to text", async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper: makeWrapper() });

    const toggleBtn = screen.getByRole("button", { name: /hiện mật khẩu/i });
    await user.click(toggleBtn);

    expect(screen.getByTestId("password-input")).toHaveAttribute("type", "text");
  });

  it("clicking toggle button a second time hides the password again", async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper: makeWrapper() });

    const toggleBtn = screen.getByRole("button", { name: /hiện mật khẩu/i });
    await user.click(toggleBtn);
    // aria-label now reflects the new state
    const hideBtn = screen.getByRole("button", { name: /ẩn mật khẩu/i });
    await user.click(hideBtn);

    expect(screen.getByTestId("password-input")).toHaveAttribute("type", "password");
  });

  it("toggle button aria-label reflects current state", async () => {
    const user = userEvent.setup();
    render(<LoginPage />, { wrapper: makeWrapper() });

    // Default state: password hidden → label should offer to reveal
    expect(
      screen.getByRole("button", { name: /hiện mật khẩu/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hiện mật khẩu/i }));

    // After reveal: label should offer to hide
    expect(
      screen.getByRole("button", { name: /ẩn mật khẩu/i })
    ).toBeInTheDocument();
  });
});

// ─── AUTH-09: Pending state ────────────────────────────────────────────────

describe("AUTH-09 — Submit button disabled and shows pending label while mutating", () => {
  it("submit button is enabled before form submission", () => {
    render(<LoginPage />, { wrapper: makeWrapper() });
    const btn = screen.getByTestId("login-submit");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent("Đăng nhập");
  });

  it("submit button becomes disabled and shows 'Đang đăng nhập...' while pending", async () => {
    // Intercept login API call — never resolve so mutation stays pending.
    const user = userEvent.setup();
    let resolveFetch!: () => void;
    const hangingFetch = new Promise<Response>((resolve) => {
      resolveFetch = () => resolve(new Response(JSON.stringify({ sessionId: "x", accessToken: "t", accessExpiresAt: "", refreshToken: "r", refreshExpiresAt: "", userId: "u", role: "partner_owner" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(hangingFetch);

    render(<LoginPage />, { wrapper: makeWrapper() });
    await user.type(screen.getByTestId("email-input"), "test@test.com");
    await user.type(screen.getByTestId("password-input"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      const btn = screen.getByTestId("login-submit");
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent("Đang đăng nhập...");
    });

    resolveFetch();
    vi.restoreAllMocks();
  });
});
