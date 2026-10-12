"use client";

// Read-only multi-skill mock result view — teacher review + student result page
// share this same shell (see `audience`). Editing (5.4) lives in a separate
// component; this file never mutates `result`.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResultView } from "@/features/partner/result-view";
import { WritingResultView } from "@/features/writing/writing-result-view";
import { ObjectiveResultView, isObjectiveResult } from "@/features/take/objective-result-view";
import { speakingPayload, writingPayload, type MockResultPayload, type MockSkillResult } from "./mock-result-types";

type SkillKey = "reading" | "listening" | "speaking" | "writing";

const SKILLS: SkillKey[] = ["reading", "listening", "speaking", "writing"];

const SKILL_LABEL: Record<SkillKey, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
};

function bandColor(b: number | null | undefined): string {
  if (typeof b !== "number") return "text-ink-400";
  if (b >= 7) return "text-green-600";
  if (b >= 5.5) return "text-brand-500";
  if (b >= 4) return "text-yellow-600";
  return "text-red-500";
}

function formatBand(b: number | null | undefined): string {
  return typeof b === "number" ? b.toFixed(1) : "Chờ duyệt";
}

export function MockResultView({
  result,
  audience,
}: {
  result: MockResultPayload;
  audience: "student" | "partner";
}) {
  const [tab, setTab] = useState<SkillKey>("reading");

  return (
    <div className="space-y-5">
      <OverallHeader result={result} audience={audience} />

      <div className="flex flex-wrap gap-1 self-start rounded-xl bg-ink-100 p-1">
        {SKILLS.map((skill) => {
          const band = result.skills[skill].band;
          return (
            <button
              key={skill}
              type="button"
              onClick={() => setTab(skill)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                tab === skill ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
              )}
            >
              {SKILL_LABEL[skill]} <span className={bandColor(band)}>· {formatBand(band)}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-5">
        {tab === "reading" && <ObjectiveSkillTab skill="reading" data={result.skills.reading} />}
        {tab === "listening" && <ObjectiveSkillTab skill="listening" data={result.skills.listening} />}
        {tab === "speaking" && <SpeakingTab result={result} audience={audience} />}
        {tab === "writing" && <WritingTab result={result} />}
      </div>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

function OverallHeader({ result, audience }: { result: MockResultPayload; audience: "student" | "partner" }) {
  const band = result.overall_band;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-white p-5">
      <div
        className={cn(
          "flex size-20 shrink-0 items-center justify-center rounded-full border-4 text-2xl font-bold num",
          bandColor(band),
          typeof band === "number" ? "border-brand-100" : "border-ink-100",
        )}
      >
        {typeof band === "number" ? band.toFixed(1) : "—"}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-800">Band tổng Mock Test</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {audience === "student"
            ? "Điểm trung bình 4 kỹ năng: Reading, Listening, Speaking, Writing."
            : "Điểm trung bình 4 kỹ năng của học viên. Speaking/Writing do AI chấm, có thể cần review."}
        </p>
      </div>
    </div>
  );
}

// ─── Reading / Listening tab (objective, degrade gracefully) ────────────────

function ObjectiveSkillTab({ skill, data }: { skill: "reading" | "listening"; data: MockSkillResult }) {
  // Preferred path: the graded R/L result carries the full objective payload
  // (kind:"objective" + sections + answer key). Reuse the same rich renderer the
  // teacher review uses (band circle, number correct, right/wrong per question, re-reading the
  // passage / replaying the audio) so the student view matches. Fall back to the legacy
  // band+chips probe only for older mock results that predate this shape.
  if (isObjectiveResult(data.result)) {
    return <ObjectiveResultView result={data.result} showBand />;
  }
  const detail = extractObjectiveDetail(data.result);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className={cn("text-3xl font-bold num", bandColor(data.band))}>{formatBand(data.band)}</span>
        <div>
          <p className="font-semibold text-ink-800">Band {SKILL_LABEL[skill]}</p>
          <p className="text-xs text-ink-400">IELTS {SKILL_LABEL[skill]}</p>
        </div>
      </div>
      {detail ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {detail.correct != null && detail.total != null && (
            <StatChip label="Số câu đúng" value={`${detail.correct}/${detail.total}`} />
          )}
          {detail.rawScore != null && <StatChip label="Điểm thô" value={String(detail.rawScore)} />}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Chưa có chi tiết theo câu hỏi cho kỹ năng này.</p>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className="text-lg font-bold text-ink-900 num">{value}</p>
    </div>
  );
}

interface ObjectiveDetail {
  correct?: number;
  total?: number;
  rawScore?: number;
}

// R/L result shape is not standardized on the FE (`MockSkillResult.result` is
// `unknown`) — probe a few likely field names and degrade to "band only" if
// none are present, rather than assuming a schema and crashing.
function extractObjectiveDetail(raw: unknown): ObjectiveDetail | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const correct = pickNumber(r, ["correct_count", "correct", "num_correct"]);
  const total = pickNumber(r, ["total_questions", "total", "question_count"]);
  const rawScore = pickNumber(r, ["raw_score", "score"]);
  if (correct == null && total == null && rawScore == null) return null;
  return { correct: correct ?? undefined, total: total ?? undefined, rawScore: rawScore ?? undefined };
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// ─── Speaking / Writing tabs (reuse existing read-only renderers) ───────────

function SpeakingTab({ result, audience }: { result: MockResultPayload; audience: "student" | "partner" }) {
  if (result.skills.speaking.result == null) {
    return <p className="text-sm text-ink-500">Chưa có dữ liệu Speaking.</p>;
  }
  // Confidence bar surfaces AI-gate warnings meant for the reviewing teacher;
  // hide it from the student-facing copy of this view.
  return <ResultView result={speakingPayload(result)} showConfidence={audience === "partner"} />;
}

function WritingTab({ result }: { result: MockResultPayload }) {
  if (result.skills.writing.result == null) {
    return <p className="text-sm text-ink-500">Chưa có dữ liệu Writing.</p>;
  }
  return <WritingResultView result={writingPayload(result)} />;
}
