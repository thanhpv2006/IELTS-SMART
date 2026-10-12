"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SpeakingResult,
  CriterionCode,
  CriterionView,
  ErrorBlock,
  ErrorItem,
  CleanItem,
} from "./result-types";

const CRITERIA: CriterionCode[] = ["FC", "LR", "GRA", "PRON"];

const CRITERION_LABEL: Record<CriterionCode, string> = {
  FC: "Fluency & Coherence",
  LR: "Lexical Resource",
  GRA: "Grammatical Range & Accuracy",
  PRON: "Pronunciation",
};

type Tab = CriterionCode | "overview" | "errors" | "clean";

interface Props {
  result: SpeakingResult;
  showConfidence?: boolean;
}

export function ResultView({ result, showConfidence = true }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const errorCount = result.errors?.reduce((n, b) => n + (b.errors?.length ?? 0), 0) ?? 0;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Tổng quan" },
    ...CRITERIA.map((c) => ({
      key: c as Tab,
      label: `${c} ${typeof result.criteria?.[c]?.band === "number" ? result.criteria[c]!.band!.toFixed(1) : "—"}`,
    })),
    { key: "errors", label: "Lỗi", badge: errorCount },
    { key: "clean", label: "Bản viết lại" },
  ];

  return (
    <div className="space-y-5">
      <ScoreHeader result={result} />
      {showConfidence && <ConfidenceBar confidence={result.confidence} />}

      {result.outlier?.is_outlier && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Outlier phát hiện — band có thể không đại diện.{result.outlier.reason ? ` ${result.outlier.reason}` : ""}</span>
        </div>
      )}

      <div className="rounded-xl border border-ink-200 bg-white">
        {/* Tab bar */}
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

        {/* Tab content */}
        <div className="p-5">
          {tab === "overview" && <OverviewTab result={result} />}
          {(tab === "FC" || tab === "LR" || tab === "GRA" || tab === "PRON") && (
            <CriterionTab code={tab} entry={result.criteria?.[tab]} />
          )}
          {tab === "errors" && <ErrorsTab blocks={result.errors} />}
          {tab === "clean" && <CleanTab items={result.clean_versions} />}
        </div>
      </div>
    </div>
  );
}

function ScoreHeader({ result }: { result: SpeakingResult }) {
  const band = result.overall_band ?? result.overall_feedback?.final_band;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-5xl font-bold num", bandColor(band))}>
            {typeof band === "number" ? band.toFixed(1) : "—"}
          </span>
          <div>
            <p className="text-sm font-medium text-ink-600">Band Speaking</p>
            <p className="text-xs text-ink-400">IELTS Speaking</p>
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
    </div>
  );
}

function bandColor(b: number | undefined): string {
  if (typeof b !== "number") return "text-ink-400";
  if (b >= 7) return "text-green-600";
  if (b >= 5.5) return "text-brand-500";
  if (b >= 4) return "text-yellow-600";
  return "text-red-500";
}

function ConfidenceBar({ confidence }: { confidence?: SpeakingResult["confidence"] }) {
  if (!confidence) return null;
  const isPass = confidence.recommendation?.gate_status === "Pass";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        isPass
          ? "border-green-200 bg-green-50"
          : "border-yellow-200 bg-yellow-50",
      )}
    >
      {isPass ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
      )}
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-semibold text-ink-800">
            Độ tin cậy:{" "}
            <span className={isPass ? "text-green-700" : "text-yellow-700"}>
              {confidence.label ?? "—"}
            </span>
          </span>
          {typeof confidence.raw_score === "number" && (
            <span className="text-xs text-ink-500">({confidence.raw_score.toFixed(1)}/10)</span>
          )}
          {confidence.recommendation?.gate_status && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                isPass ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700",
              )}
            >
              {confidence.recommendation.gate_status}
            </span>
          )}
        </div>
        {confidence.recommendation?.message && (
          <p className="mt-0.5 text-xs text-ink-600">{confidence.recommendation.message}</p>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ result }: { result: SpeakingResult }) {
  const fb = result.overall_feedback;
  if (!fb) return <p className="text-sm text-ink-500">Không có nhận xét tổng quan.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <BulletSection title="Điểm mạnh" items={fb.strengths} accent="success" />
      <BulletSection title="Cần cải thiện" items={fb.weaknesses} accent="warning" />
      <BulletSection title="Hướng luyện tiếp" items={fb.next_steps} accent="brand" />
    </div>
  );
}

function CriterionTab({ code, entry }: { code: CriterionCode; entry: CriterionView | undefined }) {
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
          <p className="text-xs text-ink-400 font-mono">{code}</p>
        </div>
      </div>
      {entry.comment && (
        <p className="rounded-lg bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-700 border border-ink-100">
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

function ErrorsTab({ blocks }: { blocks?: ErrorBlock[] }) {
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
        <ErrorBlockCard key={i} block={block} />
      ))}
    </div>
  );
}

function ErrorBlockCard({ block }: { block: ErrorBlock }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 space-y-3">
      {(validPartLabel(block.part_label) || block.question) && (
        <div className="flex flex-wrap items-center gap-2">
          {validPartLabel(block.part_label) && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
              {validPartLabel(block.part_label)}
            </span>
          )}
          {block.question && <p className="text-sm italic text-ink-600">{block.question}</p>}
        </div>
      )}
      {(block.original_answer || block.improved_answer) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.original_answer && (
            <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">
                Câu trả lời gốc
              </p>
              <p className="text-sm leading-relaxed text-ink-700">{block.original_answer}</p>
            </div>
          )}
          {block.improved_answer && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600">
                Gợi ý cải thiện
              </p>
              <p className="text-sm leading-relaxed text-green-800">{block.improved_answer}</p>
            </div>
          )}
        </div>
      )}
      {block.errors && block.errors.length > 0 && (
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {block.errors.map((err, j) => (
            <ErrorItemRow key={j} err={err} />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorItemRow({ err }: { err: ErrorItem }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {err.error_part && (
            <code className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-mono text-red-600">
              {err.error_part}
            </code>
          )}
          {err.correction && (
            <>
              <span className="text-ink-400 text-xs">→</span>
              <code className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-mono text-green-700">
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
            <span className="rounded-full border border-ink-200 px-2 py-0.5 text-xs font-mono text-ink-500">
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

// part_label "Part 0" is emitted by the LLM when the question's part field
// is 0 (unset). Treat it as null so we don't show a meaningless chip.
export function validPartLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const t = label.trim();
  if (t === "Part 0" || t === "0") return null;
  return t;
}

function CleanTab({ items }: { items?: CleanItem[] }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-ink-500">Không có bản viết lại cho bài này.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((c, i) => {
        const part = validPartLabel(c.part_label);
        return (
          <div key={i} className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <div className="mb-2 flex flex-wrap items-start gap-2">
              <span className="mt-0.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-600 shrink-0">
                {part ?? `Câu ${i + 1}`}
              </span>
              {c.question && (
                <p className="text-sm italic text-ink-600 flex-1">{c.question}</p>
              )}
            </div>
            {c.clean_answer && (
              <p className="text-sm leading-relaxed text-ink-800">{c.clean_answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared bullet list ───────────────────────────────────────────────────────

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
