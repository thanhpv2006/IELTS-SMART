"use client";

import { useState } from "react";
import { AlertTriangle, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  WritingResult,
  WritingCriterionCode,
  WritingCriterionView,
  WritingErrorBlock,
  WritingErrorItem,
  WordCount,
} from "./writing-result-types";

const CRITERIA: WritingCriterionCode[] = ["TA_TR", "CC", "LR", "GRA"];

const CRITERION_LABEL: Record<WritingCriterionCode, string> = {
  TA_TR: "Task Achievement / Response",
  CC: "Coherence & Cohesion",
  LR: "Lexical Resource",
  GRA: "Grammatical Range & Accuracy",
};

const TIER_COLOR: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-emerald-100 text-emerald-700",
  C: "bg-yellow-100 text-yellow-700",
  D: "bg-orange-100 text-orange-700",
  E: "bg-red-100 text-red-700",
};

type Tab = WritingCriterionCode | "overview" | "errors" | "clean";

function bandColor(b: number | undefined): string {
  if (typeof b !== "number") return "text-ink-400";
  if (b >= 7) return "text-green-600";
  if (b >= 5.5) return "text-brand-500";
  if (b >= 4) return "text-yellow-600";
  return "text-red-500";
}

// ─── Dispatcher: single task vs multi-task (Task 1 + Task 2) ───────────────────

export function WritingResultView({ result }: { result: WritingResult }) {
  const [activeTask, setActiveTask] = useState(0);
  if (result.multi_task && Array.isArray(result.tasks) && result.tasks.length > 0) {
    const tasks = result.tasks;
    const current = tasks[activeTask] ?? tasks[0];
    return (
      <div className="space-y-5">
        {/* Overall band header */}
        <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-5">
          <div>
            <div className="text-[13px] font-medium text-ink-500">Band Writing (Task 1 + Task 2)</div>
            <div className="mt-0.5 text-[13px] text-ink-400">Task 2 trọng số gấp đôi · làm tròn 0.5</div>
          </div>
          <div className={cn("text-4xl font-bold", bandColor(result.overall_band))}>
            {typeof result.overall_band === "number" ? result.overall_band.toFixed(1) : "—"}
          </div>
        </div>
        {/* Task switcher */}
        <div className="flex gap-1 self-start rounded-xl bg-ink-100 p-1">
          {tasks.map((t, i) => (
            <button key={i} onClick={() => setActiveTask(i)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                activeTask === i ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
              )}>
              {t.task_type === "Task1" ? "Task 1" : t.task_type === "Task2" ? "Task 2" : `Task ${i + 1}`}
              {typeof t.overall_band === "number" ? ` · ${t.overall_band.toFixed(1)}` : ""}
            </button>
          ))}
        </div>
        <SingleTaskResultView result={current} />
      </div>
    );
  }
  return <SingleTaskResultView result={result} />;
}

function SingleTaskResultView({ result }: { result: WritingResult }) {
  const [tab, setTab] = useState<Tab>("overview");
  const errorCount = result.errors?.reduce((n, b) => n + b.errors.length, 0) ?? 0;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Tổng quan" },
    ...CRITERIA.map((c) => ({
      key: c as Tab,
      label: `${c} ${typeof result.criteria?.[c]?.band === "number" ? result.criteria[c]!.band!.toFixed(1) : "—"}`,
    })),
    { key: "errors", label: "Lỗi", badge: errorCount },
    { key: "clean", label: "Bài sửa" },
  ];

  return (
    <div className="space-y-5">
      <ScoreHeader result={result} />

      {result.outlier?.is_outlier && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Phát hiện bài viết bất thường — band có thể không đại diện.
            {result.outlier.reason ? ` ${result.outlier.reason}` : ""}
          </span>
        </div>
      )}

      <div className="rounded-xl border border-ink-200 bg-white">
        <div className="flex flex-wrap gap-0 border-b border-ink-100 px-1 pt-1">
          {tabs.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                tab === key
                  ? "border-b-2 border-brand-500 text-brand-600"
                  : "text-ink-500 hover:text-ink-800",
              )}
            >
              {label}
              {badge != null && badge > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "overview" && <OverviewTab result={result} />}
          {tab === "TA_TR" && <CriterionTab code="TA_TR" entry={result.criteria?.TA_TR} />}
          {tab === "CC" && <CriterionTab code="CC" entry={result.criteria?.CC} />}
          {tab === "LR" && <CriterionTab code="LR" entry={result.criteria?.LR} />}
          {tab === "GRA" && <CriterionTab code="GRA" entry={result.criteria?.GRA} />}
          {tab === "errors" && <ErrorsTab blocks={result.errors} />}
          {tab === "clean" && <CleanTab essay={result.clean_essay} />}
        </div>
      </div>
    </div>
  );
}

function ScoreHeader({ result }: { result: WritingResult }) {
  const band = result.overall_band;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-5xl font-bold num", bandColor(band))}>
            {typeof band === "number" ? band.toFixed(1) : "—"}
          </span>
          <div>
            <p className="text-sm font-medium text-ink-600">Band Writing</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="text-xs text-ink-400">IELTS Writing</p>
              {result.task_type && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                  {result.task_type}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          {CRITERIA.map((code) => {
            const b = result.criteria?.[code]?.band;
            return (
              <div key={code} className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
                <p className="text-xs font-semibold text-ink-500">{code}</p>
                <p className={cn("text-xl font-bold num", bandColor(b))}>
                  {typeof b === "number" ? b.toFixed(1) : "—"}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-ink-400">
                  {CRITERION_LABEL[code]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {result.word_count && <WordCountBar wc={result.word_count} />}
    </div>
  );
}

function WordCountBar({ wc }: { wc: WordCount }) {
  const pct = Math.min(100, Math.round((wc.detected / wc.required) * 100));
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-600">
          Số từ:{" "}
          <span className="font-bold text-ink-900">{wc.detected}</span>
          <span className="text-ink-400"> / {wc.required} từ yêu cầu</span>
        </p>
        {wc.length_tier && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              TIER_COLOR[wc.length_tier] ?? "bg-ink-100 text-ink-600",
            )}
          >
            Tier {wc.length_tier}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-ink-200">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {wc.missing > 0 && (
        <p className="mt-1.5 text-xs text-orange-600">Thiếu {wc.missing} từ so với yêu cầu</p>
      )}
      {wc.length_impact && (
        <p className="mt-1 text-xs leading-relaxed text-orange-700">{wc.length_impact}</p>
      )}
    </div>
  );
}

function OverviewTab({ result }: { result: WritingResult }) {
  return (
    <div className="space-y-4">
      {result.positive_bias?.applied && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <div>
            <p className="font-semibold">Điểm thưởng được áp dụng (+{result.positive_bias.bonus})</p>
            {result.positive_bias.reason && (
              <p className="mt-0.5 text-xs text-green-700">{result.positive_bias.reason}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {CRITERIA.map((code) => {
          const entry = result.criteria?.[code];
          if (!entry) return null;
          return (
            <div key={code} className="rounded-lg border border-ink-100 bg-ink-50 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-700">{code}</p>
                  <p className="text-[10px] text-ink-400">{CRITERION_LABEL[code]}</p>
                </div>
                <span className={cn("text-lg font-bold num", bandColor(entry.band))}>
                  {typeof entry.band === "number" ? entry.band.toFixed(1) : "—"}
                </span>
              </div>
              {entry.comment && (
                <p className="line-clamp-3 text-xs leading-relaxed text-ink-600">{entry.comment}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CriterionTab({
  code,
  entry,
}: {
  code: WritingCriterionCode;
  entry: WritingCriterionView | undefined;
}) {
  if (!entry) {
    return <p className="text-sm text-ink-500">Chưa có đánh giá cho tiêu chí này.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className={cn("text-3xl font-bold num", bandColor(entry.band))}>
          {typeof entry.band === "number" ? entry.band.toFixed(1) : "—"}
        </span>
        <div>
          <p className="font-semibold text-ink-800">{CRITERION_LABEL[code]}</p>
          <p className="font-mono text-xs text-ink-400">{code}</p>
        </div>
      </div>
      {entry.comment && (
        <p className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-700">
          {entry.comment}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <BulletSection title="Điểm mạnh" items={entry.strengths} accent="success" />
        <BulletSection title="Điểm yếu" items={entry.weaknesses} accent="warning" />
        <BulletSection title="Vấn đề cụ thể" items={entry.issues} accent="neutral" />
        <BulletSection title="Hướng luyện tập" items={entry.next_steps} accent="brand" />
      </div>
    </div>
  );
}

// ─── Errors tab (per-sentence) ─────────────────────────────────────────────────

function ErrorsTab({ blocks }: { blocks?: WritingErrorBlock[] }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        <Sparkles className="h-4 w-4" />
        Không phát hiện lỗi nào.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <SentenceErrorBlock key={i} block={block} />
      ))}
    </div>
  );
}

function SentenceErrorBlock({ block }: { block: WritingErrorBlock }) {
  return (
    <div className="space-y-3 rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        Câu {block.sentence_index}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-400">Câu gốc</p>
          <p className="text-sm leading-relaxed text-red-800">{block.original_sentence}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600">
            Câu đã sửa
          </p>
          <p className="text-sm leading-relaxed text-green-800">{block.corrected_sentence}</p>
        </div>
      </div>

      {block.errors.length > 0 && (
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {block.errors.map((err, j) => (
            <ErrorItemRow key={j} err={err} />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorItemRow({ err }: { err: WritingErrorItem }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {err.error_part && (
            <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-600">
              {err.error_part}
            </code>
          )}
          {err.correction && (
            <>
              <span className="text-xs text-ink-400">→</span>
              <code className="rounded bg-green-50 px-1.5 py-0.5 font-mono text-xs text-green-700">
                {err.correction}
              </code>
            </>
          )}
          {err.error_type && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {err.error_type}
            </span>
          )}
          {err.criterion_code && (
            <span className="rounded-full border border-ink-200 px-2 py-0.5 font-mono text-xs text-ink-500">
              {err.criterion_code}
            </span>
          )}
        </div>
        {err.explanation && (
          <p className="text-sm leading-relaxed text-ink-600">{err.explanation}</p>
        )}
      </div>
    </div>
  );
}

function CleanTab({ essay }: { essay?: string }) {
  if (!essay) {
    return <p className="text-sm text-ink-500">Không có bản sửa cho bài này.</p>;
  }
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-green-600">
        Bài viết sau khi sửa
      </p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{essay}</div>
    </div>
  );
}

// ─── Shared bullet list ────────────────────────────────────────────────────────

function BulletSection({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[] | undefined;
  accent: "success" | "warning" | "brand" | "neutral";
}) {
  if (!items || items.length === 0) return null;
  const dot =
    accent === "success"
      ? "bg-green-500"
      : accent === "warning"
        ? "bg-yellow-500"
        : accent === "brand"
          ? "bg-brand-500"
          : "bg-ink-300";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
            <span className={cn("mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
