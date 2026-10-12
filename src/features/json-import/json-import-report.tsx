import { missingMediaMessage } from "./prepare";
import type { JSONImportMediaRef, JSONImportPlannedSet, JSONImportProblem, JSONImportValidateResponse, MediaMatch } from "./types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const SKILL_LABELS: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

const KIND_LABELS: Record<JSONImportPlannedSet["kind"], string> = {
  full_test: "Full test",
  practice: "Luyện tập",
};

interface JSONImportReportProps {
  report: JSONImportValidateResponse;
  matches: MediaMatch[];
  missing: JSONImportMediaRef[];
}

export function JSONImportReport({ report, matches, missing }: JSONImportReportProps) {
  return (
    <div className="flex flex-col gap-4">
      {report.problems.length === 0 ? (
        <PlanTable plan={report.plan} />
      ) : (
        <ProblemGroups problems={report.problems} />
      )}
      {report.media_refs.length > 0 && (
        <MediaTable refs={report.media_refs} matches={matches} missing={missing} />
      )}
    </div>
  );
}

function PlanTable({ plan }: { plan: JSONImportPlannedSet[] }) {
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-success-200 bg-success-50 px-4 py-2.5 text-sm font-semibold text-success-700">
        Hợp lệ — sẽ tạo {plan.length} bộ đề (trạng thái nháp)
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-xs font-semibold text-ink-500">
            <th className="px-4 py-2">Tên bộ đề</th>
            <th className="px-4 py-2">Loại</th>
            <th className="px-4 py-2">Kỹ năng</th>
            <th className="px-4 py-2">Part</th>
            <th className="px-4 py-2">Số câu hỏi</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((set, i) => (
            <tr key={i} className="border-b border-ink-50 last:border-0">
              <td className="px-4 py-2 font-medium text-ink-800">{set.title}</td>
              <td className="px-4 py-2 text-ink-600">{KIND_LABELS[set.kind]}</td>
              <td className="px-4 py-2 text-ink-600">{SKILL_LABELS[set.skill] ?? "—"}</td>
              <td className="px-4 py-2 text-ink-600">{set.part ?? "—"}</td>
              <td className="px-4 py-2 text-ink-600">{set.question_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ProblemGroups({ problems }: { problems: JSONImportProblem[] }) {
  const groups = new Map<string, JSONImportProblem[]>();
  for (const problem of problems) {
    const key = problem.file || "Chung";
    groups.set(key, [...(groups.get(key) ?? []), problem]);
  }

  return (
    <Card className="border-error-200 bg-error-50/60 p-4">
      <p className="text-sm font-semibold text-error-700">Còn {problems.length} lỗi cần sửa</p>
      <div className="mt-3 flex flex-col gap-3">
        {[...groups.entries()].map(([file, items]) => (
          <div key={file}>
            <p className="text-xs font-semibold text-ink-600">{file}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {items.map((problem, i) => (
                <li key={i} className="text-sm text-error-700">
                  {problem.path ? `${problem.path} — ${problem.message}` : problem.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MediaTable({
  refs,
  matches,
  missing,
}: {
  refs: JSONImportMediaRef[];
  matches: MediaMatch[];
  missing: JSONImportMediaRef[];
}) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink-800">File media</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {refs.map((mediaRef, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-700">
              {mediaRef.file} {mediaRef.pointer}
            </span>
            <MediaStatus mediaRef={mediaRef} matches={matches} missing={missing} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MediaStatus({
  mediaRef,
  matches,
  missing,
}: {
  mediaRef: JSONImportMediaRef;
  matches: MediaMatch[];
  missing: JSONImportMediaRef[];
}) {
  if (!mediaRef.local) return <Badge tone="gray">URL có sẵn</Badge>;

  const match = matches.find((m) => m.ref === mediaRef);
  if (match) return <Badge tone="info">Sẽ upload: {match.file.name}</Badge>;

  if (missing.includes(mediaRef)) {
    return <span className="text-error-600">{missingMediaMessage(mediaRef)}</span>;
  }
  return null;
}
