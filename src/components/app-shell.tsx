"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Home,
  LogOut,
  Menu,
  Plus,
  User,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/brand/context";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NotifItem = { name: string; task: string; time: string };

type AppShellProps = {
  navItems: NavItem[];
  /** Role label shown in the breadcrumb and account sub-line (e.g. "Trung tâm"). */
  roleLabel: string;
  accountName: string;
  showCredit?: boolean;
  creditValue?: string;
  creditCta?: string;
  /** Clicking "Nạp thêm" opens the top-up dialog. undefined = the button does nothing. */
  onTopup?: () => void;
  /** The "a student submitted work" feed. undefined = hide the bell (e.g. for the student role). */
  notifications?: NotifItem[];
  /** Link to the profile page; when set, the account menu shows "Xem profile". */
  profileHref?: string;
  onLogout: () => void;
  children: React.ReactNode;
};

const COLLAPSE_KEY = "ielts_smart_nav_collapsed";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppShell({
  navItems,
  roleLabel,
  accountName,
  showCredit = false,
  creditValue = "0",
  creditCta = "Nạp thêm",
  onTopup,
  notifications,
  profileHref,
  onLogout,
  children,
}: AppShellProps) {
  const brand = useBrand();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Collapsing only exists on desktop — below lg the sidebar is a full-width drawer.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // close the drawer and account menu on a route change
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const current = navItems.find((i) => isActive(i.href));

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-ink-900/50 lg:hidden"
          aria-hidden
          data-testid="mobile-nav-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Mobile + tablet (<lg): fixed slide-in drawer. Desktop (>=lg): static in-flow column.
          // Scope fixed/translate to max-lg so no position rule has to override another at
          // >=lg — avoids CSS source-order fragility (Turbopack dev can emit `fixed` after
          // `lg:static`, which would leave the sidebar fixed and overlapping the content).
          "z-50 flex w-64 flex-col border-r border-ink-200 bg-white transition-transform duration-200",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0",
          "lg:static lg:transition-[width]",
          collapsed ? "lg:w-[72px]" : "lg:w-64",
          mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        {/* Brand row */}
        <div
          className={cn(
            "flex items-center gap-3 border-b border-ink-100 px-4 py-3.5",
            collapsed && "lg:flex-col lg:gap-2.5 lg:px-0 lg:py-4",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logo}
            alt={brand.name}
            className="size-11 shrink-0 rounded-[10px] object-cover shadow-sm"
          />
          <div className={cn("min-w-0 flex-1 leading-tight", collapsed && "lg:hidden")}>
            <div className="text-xs font-medium text-ink-500">Center Console</div>
          </div>
          {/* mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-100 hover:text-brand-600 max-lg:flex"
          >
            <X className="size-[18px]" />
          </button>
          {/* desktop collapse */}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-100 hover:text-brand-600 lg:flex"
          >
            {collapsed ? <ChevronsRight className="size-[17px]" /> : <ChevronsLeft className="size-[17px]" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3" data-testid="sidebar-nav">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            // Derive testid slug from href: "/my-dashboard" → "nav-my-dashboard"
            const slug = item.href.replace(/^\//, "").replace(/\//g, "-") || "nav-home";
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                data-testid={`nav-${slug}`}
                className={cn(
                  "my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "lg:mx-auto lg:size-11 lg:justify-center lg:px-0 lg:py-0",
                  active ? "bg-brand-50 text-brand-600" : "text-ink-700 hover:bg-ink-50",
                )}
              >
                <Icon
                  className={cn("size-[18px] shrink-0", active ? "text-brand-500" : "text-ink-500")}
                />
                <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Account */}
        <div className="relative border-t border-ink-100 p-3">
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} aria-hidden />
              <div
                className={cn(
                  "absolute bottom-full z-50 mb-1 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-xl",
                  collapsed ? "lg:left-2 lg:w-48" : "left-3 right-3",
                )}
              >
                {profileHref && (
                  <Link
                    href={profileHref}
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                  >
                    <User className="size-4.5 shrink-0 text-ink-500" /> Xem profile
                  </Link>
                )}
                <button
                  data-testid="logout-btn"
                  onClick={() => { setAccountOpen(false); onLogout(); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-error-700 hover:bg-error-50"
                >
                  <LogOut className="size-4.5 shrink-0" /> Đăng xuất
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => setAccountOpen((o) => !o)}
            title={accountName}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-ink-50",
              collapsed && "lg:justify-center",
            )}
          >
            <span className="size-[38px] shrink-0 rounded-full bg-gradient-to-br from-[#84ADFF] to-[#7F56D9]" />
            <span className={cn("min-w-0 flex-1 leading-tight", collapsed && "lg:hidden")}>
              <span data-testid="partner-name" className="block truncate text-[13.5px] font-semibold text-ink-900">{accountName}</span>
              <span className="block truncate text-xs text-ink-500">{roleLabel}</span>
            </span>
            <ChevronsUpDown className={cn("size-4 text-ink-400", collapsed && "lg:hidden")} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-ink-200 bg-white/85 px-5 backdrop-blur-md lg:px-7">
          {/* hamburger — only below lg (mobile + tablet), where the sidebar is a drawer. Display is
              scoped to max-lg (never `flex` + `lg:hidden`) so no rule has to override another at
              >=lg: Turbopack can emit the two in either order. */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu"
            data-testid="mobile-menu-btn"
            className="hidden size-[38px] shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 max-lg:flex"
          >
            <Menu className="size-5" />
          </button>

          {/* Breadcrumbs */}
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
            <Home className="hidden size-[18px] shrink-0 text-ink-400 sm:block" />
            <ChevronRight className="hidden size-4 shrink-0 text-ink-300 sm:block" />
            <span className="hidden font-medium text-ink-500 sm:inline">{roleLabel}</span>
            {current && (
              <>
                <ChevronRight className="hidden size-4 shrink-0 text-ink-300 sm:block" />
                <span className="truncate rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-600">
                  {current.label}
                </span>
              </>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2.5">
            {showCredit && (
              <div
                data-testid="credit-balance"
                title="Lượt chấm AI còn lại theo từng loại"
                className="flex items-center gap-2 rounded-full border border-warning-200 bg-warning-50 py-1 pl-3 pr-1"
              >
                <Zap className="size-4 shrink-0 text-warning-700" />
                <span
                  title={creditValue}
                  className="max-w-[40vw] truncate text-[13.5px] font-bold text-warning-700 sm:max-w-none"
                >
                  {creditValue}
                </span>
                <button data-testid="topup-btn" onClick={onTopup} className="ml-0.5 flex items-center gap-1 rounded-full bg-warning-700 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">
                  <Plus className="size-3" />
                  <span className="hidden sm:inline">{creditCta}</span>
                </button>
              </div>
            )}

            {notifications !== undefined && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label="Thông báo"
                  className="relative flex size-10 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-50"
                >
                  <Bell className="size-[19px]" />
                  {notifications.length > 0 && (
                    <span className="absolute right-2.5 top-2 size-2 rounded-full border-[1.5px] border-white bg-brand-500" />
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-[52px] z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
                      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3.5">
                        <span className="text-[15px] font-bold text-ink-900">Học viên đã làm bài</span>
                        <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                          {notifications.length} mới
                        </span>
                      </div>
                      <div data-testid="activity-feed" className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="px-4 py-8 text-center text-sm text-ink-400">Chưa có hoạt động nào.</p>
                        ) : (
                          notifications.map((n, i) => (
                            <div key={i} data-testid={`activity-item-${i}`} className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0 hover:bg-ink-25">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                                {initialsOf(n.name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13.5px] font-semibold text-ink-900">{n.name}</div>
                                <div className="truncate text-xs text-ink-500">{n.task} · {n.time}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
