"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Mail, Shield, CalendarDays } from "lucide-react";
import { studentAccountApi } from "@/features/student/api";
import { useAuthStore } from "@/stores/auth-store";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function StudentProfilePage() {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: studentAccountApi.me });

  if (isLoading) return <p className="text-sm text-ink-500">Đang tải...</p>;
  if (!me) return <p data-testid="profile-error" className="text-sm text-error-700">Không tải được thông tin tài khoản.</p>;

  const displayName = me.name || me.email;
  const rows: { icon: typeof Mail; label: string; value: string; testId: string }[] = [
    { icon: Mail, label: "Email", value: me.email, testId: "profile-email" },
    { icon: Shield, label: "Vai trò", value: "Học viên", testId: "profile-role" },
    { icon: CalendarDays, label: "Ngày tạo", value: new Date(me.created_at).toLocaleDateString("vi-VN"), testId: "profile-created" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink-900">Tài khoản</h1>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 border-b border-ink-100 bg-ink-25 p-6">
          <AvatarInitials name={displayName} size="lg" className="size-16 text-xl" />
          <div className="min-w-0">
            <p data-testid="profile-name" className="truncate text-lg font-bold text-ink-900">{displayName}</p>
            <span className="mt-1 inline-block rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
              Học viên
            </span>
          </div>
        </div>

        <div className="divide-y divide-ink-100">
          {rows.map((r) => (
            <div key={r.label} data-testid={r.testId} className="flex items-center gap-3 px-6 py-4">
              <r.icon className="size-4.5 shrink-0 text-ink-400" />
              <span className="w-28 shrink-0 text-sm text-ink-500">{r.label}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{r.value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-ink-100 p-4">
          <Button data-testid="profile-logout-btn" variant="outline" onClick={() => { clearAuth(); router.push("/login"); }}>
            <LogOut className="size-4" /> Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
