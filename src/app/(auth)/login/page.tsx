"use client";

import { useState } from "react";
import { useLogin } from "@/features/auth/hooks";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useBrand } from "@/brand/context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const brand = useBrand();
  const login = useLogin();
  const busy = login.isPending;
  const errMsg = login.error ? errorMessage(login.error) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    login.mutate({ email, password });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[400px] rounded-2xl border border-ink-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt={brand.name} className="size-14 rounded-xl object-cover shadow-sm" />
        </div>

        <h1 className="mb-1 text-2xl font-extrabold -tracking-tight">Đăng nhập</h1>
        <p className="mb-6 text-sm text-ink-500">
          {brand.loginTagline}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              data-testid="email-input"
              className="w-full rounded-lg border border-input bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="password-input"
                className="w-full rounded-lg border border-input bg-white px-3.5 py-2.5 pr-10 text-sm outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600"
                tabIndex={-1}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {errMsg && (
          <p data-testid="login-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errMsg}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          data-testid="login-submit"
          className={cn(
            "mt-6 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40",
            busy && "opacity-60 cursor-not-allowed",
          )}
        >
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
