"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { studentResultApi } from "@/features/student/api";
import { StudentResultView } from "@/app/(partner)/results/[id]/page";
import { Button } from "@/components/ui/button";
import { isMockResult } from "@/features/mock/mock-result-types";
import { MockResultView } from "@/features/mock/mock-result-view";
import { ObjectiveResultView, isObjectiveResult, objectiveSkillLabel } from "@/features/take/objective-result-view";

// Students see their result through the very same review UI teachers and centres use, but
// via a dedicated `StudentResultView` component: read-only, no AI/teacher tabs, no
// confidence warning, and no hint that AI did the scoring. Closing returns where the student
// came from: the dashboard lists assigned work only, so a self-practice result — reached with
// ?from=practice — must go back to the practice library instead.
//
// A Mock Test (several skills) does not use `StudentResultView` (which only understands the flat
// single-skill shape) — fetch first to detect `.skills`, then render `MockResultView`
// inside a minimal shell sharing the design language of `MockResultReview`.
export default function StudentResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const onClose = () =>
    router.push(searchParams.get("from") === "practice" ? "/student/practice" : "/student/dashboard");

  const { data } = useQuery({
    queryKey: ["student-result", id],
    queryFn: () => studentResultApi.get(id),
  });

  if (data && isMockResult(data.result)) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/55 p-0 sm:p-3">
        <div className="mx-auto flex min-h-full max-w-[1400px] flex-col rounded-none bg-white shadow-2xl sm:rounded-[22px]">
          <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon" className="size-11 rounded-lg" onClick={onClose} aria-label="Quay lại">
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="truncate text-base font-bold text-ink-900">Kết quả Mock Test</h1>
            </div>
            <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 p-5">
            <MockResultView result={data.result} audience="student" />
          </main>
        </div>
      </div>
    );
  }

  // Objective (reading/listening) result — tagged `kind:"objective"` by the backend; StudentResultView
  // only understands flat S/W results, so render the dedicated view in the same modal shell as mock.
  if (data && isObjectiveResult(data.result)) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/55 p-0 sm:p-3">
        <div className="mx-auto flex min-h-full max-w-[1400px] flex-col rounded-none bg-white shadow-2xl sm:rounded-[22px]">
          <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon" className="size-11 rounded-lg" onClick={onClose} aria-label="Quay lại">
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="truncate text-base font-bold text-ink-900">Kết quả bài luyện ({objectiveSkillLabel(data.result)})</h1>
            </div>
            <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 p-5">
            <ObjectiveResultView result={data.result} />
          </main>
        </div>
      </div>
    );
  }

  return <StudentResultView id={id} onClose={onClose} />;
}
