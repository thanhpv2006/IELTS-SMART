"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  GraduationCap,
  BookOpen,
  Users,
  Layers,
  ClipboardList,
  Wallet,
  Settings,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useLogout } from "@/features/auth/hooks";
import { AppShell, type NavItem, type NotifItem } from "@/components/app-shell";
import { accountApi, activityApi, smartCreditApi } from "@/features/partner/api";
import { CreditTopupDialog } from "@/features/partner/credit-topup-dialog";
import { formatPoolSummary } from "@/features/partner/credit-pools";
import { useFeatureFlag } from "@/features/partner/use-feature-flag";
import { useBrand } from "@/brand/context";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutGrid },
  { href: "/assignments", label: "Bài tập", icon: ClipboardList },
  { href: "/teachers", label: "Quản lý giáo viên", icon: GraduationCap },
  { href: "/classes", label: "Quản lý lớp học", icon: BookOpen },
  { href: "/students", label: "Quản lý học viên", icon: Users },
  { href: "/banks", label: "Ngân hàng đề", icon: Layers },
  { href: "/credit-packages", label: "Quản lý gói", icon: Wallet },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

const TEACHER_NAV: NavItem[] = [
  { href: "/my-dashboard", label: "Tổng quan", icon: LayoutGrid },
  { href: "/assignments", label: "Bài tập", icon: ClipboardList },
  { href: "/classes", label: "Quản lý lớp học", icon: BookOpen },
  { href: "/my-students", label: "Quản lý học viên", icon: Users },
  { href: "/banks", label: "Ngân hàng đề", icon: Layers },
];

// Routes under (partner) that only the partner_owner may open. Teachers share
// the (partner) layout but use /my-dashboard and /my-students instead.
const OWNER_ONLY_PREFIXES = [
  "/dashboard",
  "/teachers",
  "/students",
  "/credit-packages",
  "/settings",
  "/ai-import",
];

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const brand = useBrand();
  const { accessToken, role, hydrating } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const [topupOpen, setTopupOpen] = useState(false);
  const { enabled: aiImportEnabled, loading: aiImportFlagLoading } = useFeatureFlag("ai_import", {
    enabled: !!accessToken && role === "partner_owner",
  });

  useEffect(() => {
    if (hydrating) return;
    if (!accessToken) { router.replace("/login"); return; }
    if (role !== "partner_owner" && role !== "teacher") {
      router.replace("/login");
      return;
    }
    // Per-page guard: teachers may not open owner-only routes (RT-04).
    if (
      role === "teacher" &&
      OWNER_ONLY_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      )
    ) {
      router.replace("/my-dashboard");
      return;
    }
    // Waiting on the flag map, not acting on a default — redirecting before it lands would
    // bounce an opted-in owner straight back out of the feature.
    if (aiImportFlagLoading) return;
    if (!aiImportEnabled && (pathname === "/ai-import" || pathname.startsWith("/ai-import/"))) {
      router.replace("/banks");
    }
  }, [accessToken, role, hydrating, pathname, router, aiImportEnabled, aiImportFlagLoading]);

  const authed = role === "partner_owner" || role === "teacher";
  const { data: feed = [] } = useQuery({
    queryKey: ["smart-activity"],
    queryFn: () => activityApi.recentSubmissions(10),
    enabled: authed,
    refetchInterval: 60_000,
  });
  const { data: credit } = useQuery({
    queryKey: ["smart-credit-balance"],
    queryFn: smartCreditApi.balance,
    enabled: role === "partner_owner",
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: accountApi.me,
    enabled: authed,
  });
  // An owner sees the centre's name; a teacher sees their own name.
  const { data: partner } = useQuery({
    queryKey: ["smart-partner"],
    queryFn: accountApi.partner,
    enabled: role === "partner_owner",
  });

  if (hydrating || !accessToken) return null;

  const isOwner = role === "partner_owner";
  const notifications: NotifItem[] = feed.map((s) => ({
    name: s.student_name,
    task: [s.skill, s.test_name].filter(Boolean).join(" · ") || "Đã nộp bài",
    time: relativeTime(s.submitted_at),
  }));

  return (
    <>
      <AppShell
        navItems={isOwner ? OWNER_NAV : TEACHER_NAV}
        roleLabel={isOwner ? "Trung tâm" : "Giáo viên"}
        accountName={isOwner ? (partner?.name || brand.name) : (me?.name || me?.email || "Giáo viên")}
        showCredit={isOwner}
        creditValue={formatPoolSummary(credit?.balances)}
        creditCta="Nạp thêm"
        onTopup={isOwner ? () => setTopupOpen(true) : undefined}
        notifications={notifications}
        profileHref="/profile"
        onLogout={logout}
      >
        {children}
      </AppShell>
      {topupOpen && <CreditTopupDialog onClose={() => setTopupOpen(false)} />}
    </>
  );
}
