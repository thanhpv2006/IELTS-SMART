"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { SkillRunner, defaultCopyEn, type SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import { catalogSetApi, objectiveGradeApi, type ObjectiveGradeResult } from "@/features/take/api";
import { catalogItemsToQuestions, rlSubmitToGrade } from "@/features/take/mapping";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";

// Stateless demo take page for Reading/Listening: reads its content from a catalog question-set (seeded,
// đã redact answer_key), chấm objective đồng bộ qua /catalog/question-sets/{setId}/grade,
// and does NOT persist an attempt (see workflow/changes/smart-take-exam-engine/design.md §Approach, goal 2).
export default function TakeDemoPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params);
  const router = useRouter();

  const { data: set, isLoading, error } = useQuery({
    queryKey: ["catalog-set", setId],
    queryFn: () => catalogSetApi.get(setId),
  });

  const [result, setResult] = useState<ObjectiveGradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-ink-500">Đang tải đề...</p>;
  if (error) return <p className="text-sm text-error-700">Không tải được đề: {errorMessage(error)}</p>;
  if (!set || set.items.length === 0) {
    return <p className="text-sm text-error-700">Đề này chưa có câu hỏi. Vui lòng liên hệ quản trị viên.</p>;
  }

  const skill = set.items[0].skill;
  if (skill !== "reading" && skill !== "listening") {
    return <p className="text-sm text-error-700">Đề này không phải Reading/Listening.</p>;
  }

  const handleSubmit = async (payload: SubmitPayload) => {
    setGradeError(null);
    try {
      const r = await objectiveGradeApi.grade(setId, rlSubmitToGrade(payload));
      setResult(r);
    } catch (e) {
      // Swallow the error here so it is NOT thrown back into SkillRunner (the engine calls `void onSubmit(...)`,
      // so a throw would become an unhandled rejection). The banner below tells the user to reload and retry.
      setGradeError(errorMessage(e));
    }
  };

  if (result !== null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-500">Kết quả của bạn</p>
          <p className="mt-2 text-5xl font-bold text-brand-600">
            {result.raw}/{result.total}
          </p>
          <p className="mt-1 text-sm text-ink-500">câu đúng</p>
          <p className="mt-4 text-sm font-medium text-ink-700">
            Band ước lượng: <span className="font-bold text-ink-900">{result.band.toFixed(1)}</span>
          </p>
          {result.total < 40 && (
            <p className="mt-1 text-xs text-ink-400">
              Đề rút gọn — band chỉ chính xác với đề đủ 40 câu.
            </p>
          )}
          <Button className="mt-6" onClick={() => router.push("/student/dashboard")}>
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Scroll safety-net — see take/[id]/page.tsx: Reading/Listening scroll questions internally
          (max-h panes); this region keeps the card scrollable on short viewports instead of being
          clipped by SkillRunner's `overflow-hidden` in this fixed-height column. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SkillRunner
          skill={skill}
          mode="exam"
          questions={catalogItemsToQuestions(set.items)}
          copy={defaultCopyEn}
          // The exam stretches to the full viewport height for every skill (engine ≥1.3.0).
          fillHeight
          onUploadAudio={async () => ""}
          onSubmit={handleSubmit}
          onExit={() => router.push("/student/dashboard")}
        />
      </div>
      {gradeError && (
        <div className="m-4 shrink-0 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
          <p>Chấm điểm thất bại: {gradeError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 font-medium underline underline-offset-2 hover:text-error-700"
          >
            Tải lại trang để thử lại
          </button>
        </div>
      )}
    </div>
  );
}
