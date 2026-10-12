"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Maximize, ShieldAlert } from "lucide-react";
import { partnerExamRulesApi } from "@/features/partner/api";
import type { ExamRules } from "@/features/exam-rules/types";
import { errorMessage } from "@/lib/api/errors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ["exam-rules"], queryFn: partnerExamRulesApi.get });

  const [antiCheat, setAntiCheat] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!rules) return;
    setAntiCheat(rules.anti_cheat);
    setFullscreen(rules.fullscreen);
  }, [rules]);

  const saveRules = useMutation({
    mutationFn: (body: ExamRules) => partnerExamRulesApi.update(body),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["exam-rules"] });
    },
  });

  const handleSave = () => {
    setSaved(false);
    // Time limits are set per assignment now; send the stored value back so saving the other
    // rules never wipes it.
    saveRules.mutate({
      time_limit_minutes: rules?.time_limit_minutes ?? null,
      anti_cheat: antiCheat,
      fullscreen,
    });
  };

  if (isLoading) return <p className="text-sm text-ink-500">Đang tải...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink-900">Cài đặt quy tắc làm bài</h1>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-25 p-6">
          <p className="text-sm text-ink-500">
            Áp dụng cho các bài Reading/Listening ở chế độ thi thử của trung tâm bạn.
          </p>
        </div>

        <div className="space-y-6 p-6">
          <label className="flex items-center gap-3 text-sm text-ink-700">
            <input
              data-testid="settings-anti-cheat-checkbox"
              type="checkbox"
              checked={antiCheat}
              onChange={(e) => { setAntiCheat(e.target.checked); setSaved(false); }}
              className="size-4 rounded border-input"
            />
            <span className="flex items-center gap-2 font-semibold text-ink-700">
              <ShieldAlert className="size-4.5 text-ink-400" />
              Bật chống gian lận (anti-cheat)
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm text-ink-700">
            <input
              data-testid="settings-fullscreen-checkbox"
              type="checkbox"
              checked={fullscreen}
              onChange={(e) => { setFullscreen(e.target.checked); setSaved(false); }}
              className="size-4 rounded border-input"
            />
            <span className="flex items-center gap-2 font-semibold text-ink-700">
              <Maximize className="size-4.5 text-ink-400" />
              Bắt buộc toàn màn hình khi làm bài
            </span>
          </label>

          <p className="rounded-lg bg-ink-25 p-3 text-xs leading-relaxed text-ink-500">
            Các quy tắc này mang tính răn đe và ghi log hành vi (rời tab, mất tập trung, chặn dán, sao
            chép) trong lúc học viên làm bài — không chặn tuyệt đối. Thời gian làm bài được đặt riêng
            cho từng lượt giao, ở bước 3 của hộp thoại Giao bài tập.
          </p>

          {saveRules.isError && (
            <p data-testid="settings-error" className="text-sm text-error-700">
              {errorMessage(saveRules.error)}
            </p>
          )}
          {saved && !saveRules.isPending && (
            <p data-testid="settings-success" className="flex items-center gap-1.5 text-sm font-medium text-success-700">
              <Check className="size-4" /> Đã lưu cài đặt.
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-ink-100 p-4">
          <Button data-testid="settings-save-btn" onClick={handleSave} disabled={saveRules.isPending}>
            {saveRules.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
