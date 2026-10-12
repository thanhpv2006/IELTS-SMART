"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { studentAssignmentApi, studentPracticeApi, studentResultApi } from "@/features/student/api";
import { buildPracticeHistory } from "@/features/practice/history";
import { PracticeCard } from "@/features/practice/practice-card";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api/errors";

type SkillFilter = "all" | "reading" | "listening";

const SKILL_FILTERS: { key: SkillFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "reading", label: "Reading" },
  { key: "listening", label: "Listening" },
];

export default function StudentPracticePage() {
  const router = useRouter();
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");

  const {
    data: sets = [],
    isLoading: loadingSets,
    error: setsError,
  } = useQuery({
    queryKey: ["practice-sets", skillFilter],
    queryFn: () => studentPracticeApi.list(skillFilter === "all" ? undefined : skillFilter),
  });

  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["student-assignments", "self_practice"],
    queryFn: () => studentAssignmentApi.list({ origin: "self_practice", limit: 200 }),
  });

  const { data: results = [], error: resultsError } = useQuery({
    queryKey: ["student-results"],
    queryFn: studentResultApi.list,
  });

  const history = useMemo(() => buildPracticeHistory(assignments, results), [assignments, results]);

  // Speaking/Writing self-practice grades async and debits credit — not opened at this stage yet.
  const visibleSets = sets.filter((s) => s.skill === "reading" || s.skill === "listening");

  const start = useMutation({
    mutationFn: (vars: { setId: string; timedSeconds?: number }) => studentPracticeApi.start(vars.setId),
    onSuccess: (res, vars) => {
      router.push(`/student/take/${res.assignment_id}` + (vars.timedSeconds ? `?timed=${vars.timedSeconds}` : ""));
    },
  });

  const error = setsError ?? assignmentsError ?? resultsError ?? start.error;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Luyện tập</h1>
        <p className="mt-1 text-sm text-ink-500">Chọn đề để tự luyện thêm.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SKILL_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setSkillFilter(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              skillFilter === f.key
                ? "border-brand-200 bg-brand-50 text-brand-600"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(error)}</p>
      )}

      {loadingSets ? (
        <p className="text-sm text-ink-400">Đang tải…</p>
      ) : visibleSets.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-400">Trung tâm chưa mở đề luyện tập nào.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSets.map((set) => (
            <PracticeCard
              key={set.id}
              set={set}
              history={history[set.id]}
              starting={start.isPending && start.variables?.setId === set.id}
              onStart={(timedSeconds) => start.mutate({ setId: set.id, timedSeconds })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
