"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, ClipboardList, Dumbbell } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useLogout } from "@/features/auth/hooks";
import { AppShell, type NavItem } from "@/components/app-shell";
import { studentAccountApi } from "@/features/student/api";

// Student navigation: Dashboard, assignments, and self-directed practice sections. Results are reached through the assignment card or practice card.
const STUDENT_NAV: NavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/student/assignments", label: "Bài tập", icon: ClipboardList },
  { href: "/student/practice", label: "Luyện tập", icon: Dumbbell },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, role, hydrating } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  useEffect(() => {
    if (hydrating) return;
    if (!accessToken) { router.replace("/login"); return; }
    if (role !== "student") { router.replace("/login"); }
  }, [accessToken, role, hydrating, router]);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: studentAccountApi.me,
    enabled: role === "student",
  });

  if (hydrating || !accessToken) return null;

  // Exam taking: go full screen, hiding sidebar and menu to keep focus (D8). /student/mock/ = the B2B
  // 4-skill mock flow (fulltest attempt), full-screen for the same reason as /student/take/.
  if (pathname?.startsWith("/student/take/") || pathname?.startsWith("/student/mock/")) {
    return <>{children}</>;
  }

  return (
    <AppShell
      navItems={STUDENT_NAV}
      roleLabel="Học viên"
      accountName={me?.name || me?.email || "Học viên"}
      profileHref="/student/profile"
      onLogout={logout}
    >
      {children}
    </AppShell>
  );
}
