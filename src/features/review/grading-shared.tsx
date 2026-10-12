"use client";

import { createContext, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Edit3, Pause, Play, Plus } from "lucide-react";
import { BandSelect } from "@/features/partner/band-select";
import { Stimulus } from "@/components/ui/stimulus";
import { cn } from "@/lib/utils";
import type { AnswerItem } from "@/features/partner/api";
import type { SpeakingResult, CriterionCode, ErrorBlock, WordScore } from "@/features/partner/result-types";
import { alignWordRanges, wordTierClass, wordTooltip, PLAYBACK_PAD_SEC, type WordRange } from "./word-scores";
import type { WritingCriterionCode } from "@/features/writing/writing-result-types";

// ─── Criteria constants + labels (Speaking + Writing) ───────────────────────────

export const SPEAKING_CRITERIA: CriterionCode[] = ["FC", "LR", "GRA", "PRON"];
export const WRITING_CRITERIA: WritingCriterionCode[] = ["TA_TR", "CC", "LR", "GRA"];

export const SPEAKING_LABEL: Record<CriterionCode, string> = {
  FC: "Fluency & Coherence",
  LR: "Lexical Resource",
  GRA: "Grammatical Range & Accuracy",
  PRON: "Pronunciation",
};

export const WRITING_LABEL: Record<WritingCriterionCode, string> = {
  TA_TR: "Task Achievement / Response",
  CC: "Coherence & Cohesion",
  LR: "Lexical Resource",
  GRA: "Grammatical Range & Accuracy",
};

// Student mode: the same review UI but view only (read-only), with no AI/teacher tabs,
// no AI confidence warning, and copy written for a student rather than a teacher.
export const StudentContext = createContext(false);

// ─── Speaking left panel ────────────────────────────────────────────────────────

export type Transcript = { question?: string; script?: string; words?: WordScore[] };

// A mark for highlightText — one Speaking error overlaid on the transcript.
export type Mark = { term?: string; className: string; title?: string; id?: string };

export type SelInfo = { text: string; x: number; y: number; seq?: number };

// Selecting text in the submitted work (only while enabled = edit mode) shows a floating "Thêm lỗi" button.
export function useSelectionAdd(enabled: boolean) {
  const [sel, setSel] = useState<SelInfo | null>(null);
  const onMouseUp = () => {
    if (!enabled) return;
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!text || !s || s.rangeCount === 0) {
      setSel(null);
      return;
    }
    const range = s.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    // Work out which question holds the selection, to label the new error with its Part/question.
    const startEl = (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as Element)) ?? null;
    const seqAttr = startEl?.closest("[data-answer-seq]")?.getAttribute("data-answer-seq");
    const seq = seqAttr != null ? Number(seqAttr) : undefined;
    setSel({ text, x: rect.left + rect.width / 2, y: rect.bottom, seq });
  };
  const clear = () => {
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  return { sel, onMouseUp, clear };
}

export function SelectionAddButton({ sel, onAdd }: { sel: SelInfo | null; onAdd: (sel: SelInfo) => void }) {
  if (!sel) return null;
  const label = sel.text.length > 30 ? `${sel.text.slice(0, 30)}…` : sel.text;
  return (
    <button
      type="button"
      data-testid="selection-add-error-btn"
      onMouseDown={(e) => e.preventDefault()} // keep the selection while the button is pressed
      onClick={() => onAdd(sel)}
      style={{ position: "fixed", left: sel.x, top: sel.y + 8, transform: "translateX(-50%)", zIndex: 60 }}
      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-brand-700"
    >
      <Plus className="size-3.5" /> Thêm lỗi: “{label}”
    </button>
  );
}

// Group answers by Part (using answer.part enriched from the bank). part 0/undefined → one shared group.
export function groupAnswersByPart(answers: AnswerItem[]): { part: number | null; answers: AnswerItem[] }[] {
  if (answers.length === 0) return [];
  const map = new Map<number, AnswerItem[]>();
  for (const a of answers) {
    const p = typeof a.part === "number" && a.part > 0 ? a.part : 0;
    const bucket = map.get(p) ?? [];
    bucket.push(a);
    map.set(p, bucket);
  }
  return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([part, ans]) => ({ part: part || null, answers: ans }));
}

export function resolveTranscripts(result: SpeakingResult, answers: AnswerItem[]): Transcript[] {
  // Prefer `_transcripts` (real prompt + transcript, matched by sequence). Fall
  // back to errors/clean_versions for older results scored before the sink change.
  const ts = result._transcripts ?? [];
  const errs = result.errors ?? [];
  const cleans = result.clean_versions ?? [];
  // Error blocks keyed by the sequence the scorer echoed (v1) — a reliable
  // fallback for the script/question when `_transcripts` is absent, unlike the
  // positional `errs[i]` (block index ≠ answer index).
  const errsBySeq = new Map<number, ErrorBlock>();
  for (const e of errs) if (typeof e.sequence === "number" && !errsBySeq.has(e.sequence)) errsBySeq.set(e.sequence, e);
  return answers.map((a, i) => {
    const t = ts.find((x) => x.sequence === a.sequence);
    const eSeq = errsBySeq.get(a.sequence);
    return {
      // Everything keyed by sequence — never by positional block index (block
      // index ≠ answer index). Bank prompt (authoritative, HTML) first, then the
      // sequence-matched transcript snapshot, then the sequence-keyed error block.
      question: a.question_prompt ?? t?.question_prompt ?? eSeq?.question ?? cleans[i]?.question ?? undefined,
      script: t?.transcript ?? eSeq?.original_answer ?? a.essay_text ?? cleans[i]?.clean_answer ?? undefined,
      // Word scores are offsets into SpeechSuper's own transcript, so they are
      // dropped whenever `script` falls back to any other source.
      words: t?.transcript ? t.words : undefined,
    };
  });
}

// Strip HTML tags and normalize so question text can be matched between errors[] and answers[].
export function normQuestion(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]*>/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

// Parse a block's `part_label` ("Part 1", "Part 3", …) to a part number. Returns
// null for missing / "Part 0" / unparseable — i.e. "no part constraint".
export function partOfLabel(label: string | null | undefined): number | null {
  const m = /(\d+)/.exec(label ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Map between an error block (result.errors[bi]) and an answer (answer.sequence). Matched on
// question text (authoritative), falling back to the index. qNumber is the "Question N" shown
// on the card (numbered within each Part, matching groupAnswersByPart).
export function buildBlockMap(
  result: SpeakingResult,
  answers: AnswerItem[],
): { bySeq: Map<number, number>; byBi: Map<number, { sequence: number; part: number | null; qNumber: number }> } {
  const blocks = result.errors ?? [];
  const ts = result._transcripts ?? [];
  const groups = groupAnswersByPart(answers);
  const qNumBySeq = new Map<number, number>();
  for (const g of groups) g.answers.forEach((a, i) => qNumBySeq.set(a.sequence, i + 1));
  const bySeqAnswer = new Map<number, AnswerItem>(answers.map((a) => [a.sequence, a]));
  const questionOf = (a: AnswerItem): string =>
    normQuestion(a.question_prompt ?? ts.find((t) => t.sequence === a.sequence)?.question_prompt);
  // Authoritative pairing: an error block's `original_answer` IS the spoken
  // transcript, and `_transcripts` carries the real `sequence`. Match on that
  // text first — the LLM emits a block only per answer that HAS errors (so
  // block index ≠ answer index) and often leaves `question` null, which made
  // the old index fallback attach errors to the wrong question card.
  const transKeyed = ts.filter((t) => t.transcript).map((t) => ({ seq: t.sequence, key: normQuestion(t.transcript) }));
  const usedSeq = new Set<number>();
  const bySeq = new Map<number, number>();
  const byBi = new Map<number, { sequence: number; part: number | null; qNumber: number }>();
  const assign = (bi: number, seq: number): boolean => {
    const ans = bySeqAnswer.get(seq);
    if (!ans) return false;
    usedSeq.add(ans.sequence);
    const part = typeof ans.part === "number" && ans.part > 0 ? ans.part : null;
    byBi.set(bi, { sequence: ans.sequence, part, qNumber: qNumBySeq.get(ans.sequence) ?? bi + 1 });
    bySeq.set(ans.sequence, bi);
    return true;
  };
  blocks.forEach((b, bi) => {
    // 0) Authoritative: `sequence` echoed by the scorer (v1). Map directly —
    //    no text guessing. Absent on results scored before the change.
    if (typeof b.sequence === "number" && !usedSeq.has(b.sequence) && assign(bi, b.sequence)) return;
    // 1) By transcript text — exact first, then a guarded substring: the LLM's
    //    `original_answer` is often a single utterance excerpted from the fuller
    //    transcript, so exact equality misses. Only the excerpt direction is
    //    allowed (transcript CONTAINS original_answer — never the reverse, which
    //    would let a long answer swallow a short transcript like "Speaking."),
    //    the excerpt must be ≥12 chars, and the match must be UNAMBIGUOUS (exactly
    //    one unused transcript contains it) — otherwise fall through, don't guess.
    const oa = normQuestion(b.original_answer);
    if (oa) {
      const exact = transKeyed.find((t) => !usedSeq.has(t.seq) && t.key === oa);
      let sub: { seq: number; key: string } | undefined;
      if (!exact && oa.length >= 12) {
        const subs = transKeyed.filter((t) => !usedSeq.has(t.seq) && t.key.includes(oa));
        if (subs.length === 1) sub = subs[0];
      }
      const hit = exact ?? sub;
      if (hit && assign(bi, hit.seq)) return;
    }
    // Block's part (from "Part N" label) — constrains the weaker fallbacks so a
    // block never crosses into another part. null = unknown ⇒ no constraint.
    const bp = partOfLabel(b.part_label);
    const partOk = (a: AnswerItem) => bp == null || (typeof a.part === "number" && a.part > 0 ? a.part : null) === bp;
    // 2) By echoed question text, when the LLM provided it (same part only).
    const q = normQuestion(b.question);
    if (q) {
      const ans = answers.find((a) => !usedSeq.has(a.sequence) && partOk(a) && questionOf(a) === q);
      if (ans && assign(bi, ans.sequence)) return;
    }
    // 3) Last resort: first still-unused answer, preferring the block's part.
    const ans =
      answers.find((a) => !usedSeq.has(a.sequence) && partOk(a)) ??
      answers.find((a) => !usedSeq.has(a.sequence)) ??
      answers[bi];
    if (ans) assign(bi, ans.sequence);
  });
  return { bySeq, byBi };
}

export function SpeakingAnswerCard({ answer, transcript, index, marks, highlightSource, onMarkClick }: { answer: AnswerItem; transcript?: Transcript; index: number; marks?: Mark[]; highlightSource?: string; onMarkClick?: (id: string) => void }) {
  const audioRef = useRef<AudioPlayerHandle>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const scriptText = transcript?.script ?? highlightSource;
  const words = scriptText === transcript?.script ? transcript?.words : undefined;
  const wordRanges = useMemo(() => (scriptText ? alignWordRanges(scriptText, words) : null), [scriptText, words]);
  const wordLayer: WordLayer | undefined = wordRanges
    ? {
        ranges: wordRanges,
        onWordClick: (r) => audioRef.current?.playRange(r.startSec - PLAYBACK_PAD_SEC, r.endSec + PLAYBACK_PAD_SEC),
        onWordEnter: (r, rect) => setTip({ text: wordTooltip(r), x: rect.left + rect.width / 2, y: rect.top }),
        onWordLeave: () => setTip(null),
      }
    : undefined;
  return (
    <div data-answer-seq={answer.sequence} className="rounded-xl border border-ink-100 bg-white p-5">
      <p className="text-sm font-bold text-ink-900">Question {index + 1}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-400">Câu hỏi</p>
      {transcript?.question ? (
        <div className="prose prose-sm mt-1 max-w-none text-ink-700" dangerouslySetInnerHTML={{ __html: transcript.question }} />
      ) : (
        <p className="mt-1 text-sm leading-6 text-ink-400">Không có nội dung câu hỏi.</p>
      )}
      {answer.stimulus_url && <Stimulus src={answer.stimulus_url} className="mt-3" />}
      {answer.audio_url ? (
        <AudioPlayer ref={audioRef} src={answer.audio_url} />
      ) : (
        <div className="mt-4 flex h-[58px] items-center gap-3 rounded-lg border border-ink-100 px-3 text-sm text-ink-400">Không có ghi âm</div>
      )}
      {(() => {
        // SCRIPT = the answer's own transcript (authoritative, matched by sequence)
        // — errors are highlighted IN PLACE by locating error_part inside it. Only
        // when there is no transcript (legacy results before the _transcripts sink)
        // do we fall back to the mapped block's original_answer. This keeps a
        // mis-mapped error block from ever replacing a question's real transcript.
        const hasMarks = !!marks && marks.length > 0;
        if (!scriptText) return null;
        return (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-400">Script</p>
            <p data-testid="speaking-script" className="mt-2 border-l-2 border-brand-300 bg-ink-50/60 py-3 pl-4 pr-3 text-sm leading-7 text-ink-700">
              {hasMarks ? highlightText(scriptText, marks!, onMarkClick) : scriptText}
            </p>
            {wordLayer && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-400">Phát âm từng từ</p>
                <p data-testid="speaking-pronunciation" className="mt-2 border-l-2 border-emerald-300 bg-ink-50/60 py-3 pl-4 pr-3 text-sm leading-7 text-ink-700">
                  {renderWordScores(scriptText, wordLayer)}
                </p>
                <PronunciationLegend />
              </>
            )}
          </>
        );
      })()}
      {tip && (
        <div
          style={{ position: "fixed", left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)", zIndex: 60 }}
          className="pointer-events-none rounded-md bg-ink-900 px-2 py-1 text-xs font-semibold text-white shadow-lg"
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}

function PronunciationLegend() {
  const tiers: [string, string][] = [
    ["bg-emerald-100", "≥ 90% tốt"],
    ["bg-amber-100", "60–89% khá"],
    ["bg-rose-200", "< 60% cần sửa"],
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ink-500">
      {tiers.map(([swatch, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-[3px] border border-ink-200", swatch)} />
          {label}
        </span>
      ))}
      <span className="text-ink-400">Bấm một từ để nghe lại</span>
    </div>
  );
}

export type AudioPlayerHandle = { playRange: (startSec: number, endSec: number) => void };

export const AudioPlayer = forwardRef<AudioPlayerHandle, { src: string }>(function AudioPlayer({ src }, handleRef) {
  const ref = useRef<HTMLAudioElement>(null);
  // Word playback runs on its own element: sharing the transport with the
  // progress player made every word click yank the playhead, and starting a
  // play() while the shared element was still seeking sounded a beat late.
  const wordRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const rafRef = useRef<number | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);

  const clearRange = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (seekTimerRef.current != null) clearTimeout(seekTimerRef.current);
    rafRef.current = null;
    seekTimerRef.current = null;
    stopAtRef.current = null;
  }, []);

  useEffect(() => clearRange, [clearRange]);

  useImperativeHandle(handleRef, () => ({
    playRange(startSec: number, endSec: number) {
      const el = wordRef.current;
      if (!el) return;
      clearRange();
      ref.current?.pause();
      el.pause();
      const from = Math.max(0, startSec);
      let started = false;
      // Seeking is asynchronous: calling play() straight after assigning
      // currentTime starts the old position first and lands on the word late.
      const start = () => {
        if (started) return;
        started = true;
        el.removeEventListener("seeked", start);
        if (seekTimerRef.current != null) clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
        el.play().catch(() => {});
        if (!Number.isFinite(endSec) || endSec <= from) return;
        stopAtRef.current = endSec;
        // A word lasts ~100ms, far below the ~4/s cadence of the `timeupdate`
        // event, so the stop point is polled per frame instead.
        const tick = () => {
          if (stopAtRef.current == null) {
            rafRef.current = null;
            return;
          }
          // The tail padding can reach past the recording, in which case the
          // stop point is never met and the loop would spin forever.
          if (el.ended || el.currentTime >= stopAtRef.current) {
            el.pause();
            clearRange();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      };
      el.addEventListener("seeked", start);
      el.currentTime = from;
      // An unbuffered source may never report the seek; don't let the click die.
      seekTimerRef.current = window.setTimeout(start, 250);
    },
  }), [clearRange]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    clearRange();
    wordRef.current?.pause();
    if (playing) el.pause();
    // Swallow play() rejections (e.g. autoplay-policy / interrupted load) — the
    // UI just stays paused; nothing actionable to surface to the user.
    else el.play().catch(() => {});
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="mt-4 flex h-[58px] items-center gap-3 rounded-lg border border-ink-100 px-3">
      <button type="button" onClick={toggle} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600">
        {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-sm tabular-nums text-ink-500">{fmtTime(dur > 0 ? cur : 0)}</span>
      <audio
        ref={ref}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          clearRange();
        }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        className="hidden"
      />
      <audio ref={wordRef} src={src} preload="auto" className="hidden" />
    </div>
  );
});

export function fmtTime(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Shared helpers (used by Writing) ──────────────────────────────────────────

export function CriteriaCard({ title, scale, children }: { title: string; scale: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-ink-900">{title}</h2>
        <span className="text-xs text-ink-400">{scale}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Criterion accent colours (default Tailwind palette — the semantic tokens only have 50/200/700).
// Covers both the Speaking criteria (FC/LR/GRA/PRON) and the Writing ones (TA_TR/CC/LR/GRA).
export const CRIT_ACCENT: Record<string, { bar: string; dot: string; band: string }> = {
  FC: { bar: "border-l-blue-400", dot: "bg-blue-500", band: "text-blue-700" },
  TA_TR: { bar: "border-l-purple-400", dot: "bg-purple-500", band: "text-purple-700" },
  CC: { bar: "border-l-blue-400", dot: "bg-blue-500", band: "text-blue-700" },
  LR: { bar: "border-l-amber-400", dot: "bg-amber-600", band: "text-amber-700" },
  GRA: { bar: "border-l-red-400", dot: "bg-red-500", band: "text-red-700" },
  PRON: { bar: "border-l-purple-400", dot: "bg-purple-500", band: "text-purple-700" },
};
export const ACCENT_FALLBACK = { bar: "border-l-ink-300", dot: "bg-ink-400", band: "text-ink-700" };

// Inline highlight style for errors in the original work, by criterion.
export function critMarkClass(code: string): string {
  switch (code) {
    case "GRA": return "bg-red-50 underline decoration-2 decoration-wavy decoration-red-400 underline-offset-2";
    case "LR": return "bg-amber-50 underline decoration-2 decoration-amber-400 underline-offset-2";
    case "FC": // Speaking Fluency & Coherence
    case "CC": return "bg-blue-50 underline decoration-2 decoration-blue-400 underline-offset-2";
    case "PRON": // Speaking Pronunciation
    case "TA_TR": return "bg-purple-50 underline decoration-2 decoration-purple-400 underline-offset-2";
    default: return "bg-ink-100 underline";
  }
}

// Normalize text: collapse whitespace + lowercase, keeping a map back to the original offsets.
export function buildNorm(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      norm += " ";
      map.push(i);
      prevSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  return { norm, map };
}

// Find the range of `term` within `text`: try a direct match first, then fall back to whitespace-normalized matching.
export function findRange(text: string, term: string): { start: number; end: number } | null {
  const direct = text.indexOf(term);
  if (direct >= 0) return { start: direct, end: direct + term.length };
  const t = buildNorm(text);
  const termNorm = buildNorm(term).norm.trim();
  if (!termNorm) return null;
  const ni = t.norm.indexOf(termNorm);
  if (ni < 0) return null;
  return { start: t.map[ni], end: t.map[ni + termNorm.length - 1] + 1 };
}

// The pronunciation layer overlaid on a Speaking transcript.
export type WordLayer = {
  ranges: WordRange[];
  onWordClick?: (r: WordRange) => void;
  onWordEnter?: (r: WordRange, rect: DOMRect) => void;
  onWordLeave?: () => void;
};

// The pronunciation view renders the same transcript as the SCRIPT block but
// carries no error marks, so the two never contend for the same pixels.
export function renderWordScores(text: string, layer: WordLayer): React.ReactNode {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const w of layer.ranges) {
    if (w.start > cursor) out.push(text.slice(cursor, w.start));
    out.push(
      <span
        key={key++}
        data-testid="speaking-word"
        data-playable={w.playable || undefined}
        className={cn(wordTierClass(w.score), "box-decoration-clone rounded-[3px]", w.playable && "cursor-pointer")}
        onClick={w.playable ? () => layer.onWordClick?.(w) : undefined}
        onMouseEnter={(e) => layer.onWordEnter?.(w, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => layer.onWordLeave?.()}
      >
        {text.slice(w.start, w.end)}
      </span>,
    );
    cursor = w.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

// highlightText bọc các đoạn khớp `term` bằng <span> tô màu (lần xuất hiện đầu, không chồng lấn).
// A mark with an `id` gives the span that id plus a data-testid (used for click-to-jump in Speaking; Writing passes no id).
// With onMarkClick and a mark id, the span becomes clickable and jumps back to the error in the panel.
export function highlightText(
  text: string,
  marks: Mark[],
  onMarkClick?: (id: string) => void,
): React.ReactNode {
  const ranges: { start: number; end: number; className: string; title?: string; id?: string }[] = [];
  for (const m of marks) {
    if (!m.term) continue;
    const r = findRange(text, m.term);
    if (r) ranges.push({ ...r, className: m.className, title: m.title, id: m.id });
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue; // skip overlaps
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    const clickable = !!(onMarkClick && r.id);
    out.push(
      <span
        key={key++}
        id={r.id}
        data-testid={r.id ? "speaking-mark" : undefined}
        title={r.title}
        className={cn(r.className, clickable && "cursor-pointer")}
        onClick={clickable ? () => onMarkClick!(r.id!) : undefined}
      >
        {text.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function FilterChip({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", active ? "border-brand-200 bg-brand-50 text-brand-600" : "border-ink-200 bg-white text-ink-500 hover:text-ink-700")}>
      {label}
    </button>
  );
}

export function CriterionEditCard({ code, label, band, value, fallback, onChange, readOnly = false }: { code: string; label: string; band?: number; value: string; fallback?: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const a = CRIT_ACCENT[code] ?? ACCENT_FALLBACK;
  const text = value || fallback || "";
  return (
    <div className={cn("rounded-xl border border-l-4 border-ink-100 bg-white p-4", a.bar)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", a.dot)} />
          <p className="truncate text-sm font-bold text-ink-900">{code} · {label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("text-sm font-bold", a.band)}>{typeof band === "number" ? band.toFixed(1) : "—"}</span>
          {!readOnly && (
            <button type="button" onClick={() => setEditing((v) => !v)} aria-label="Sửa nhận xét"
              className={cn("rounded-md p-1 hover:bg-ink-50", editing ? "text-brand-600" : "text-ink-300 hover:text-ink-500")}>
              <Edit3 className="size-4" />
            </button>
          )}
        </div>
      </div>
      {editing && !readOnly ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallback || "Nhập nhận xét..."}
          className="w-full resize-y rounded-lg border border-ink-200 px-3 py-2 text-sm leading-7 text-ink-700 outline-none focus:border-brand-400" />
      ) : (
        <p className="text-sm leading-7 text-ink-600">{text || "Chưa có nhận xét."}</p>
      )}
    </div>
  );
}

export function firstText(items?: string[]) {
  return items?.find(Boolean);
}

// ─── Editable band controls ─────────────────────────────────────────────────────

// Overall band of one skill — computed from the 4 criterion scores (read-only, locked).
// `label` = "Band Speaking" / "Band Writing" (this is the skill band, not the overall 4-skill band).
export function EditableBandSummary({ band, label }: { band?: number; label: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-brand-700">{label}</p>
          <p className="text-sm text-ink-500">Tổng điểm bài làm</p>
        </div>
        <BandSelect value={band} onChange={() => {}} emphasis readOnly testId="band-select-overall" />
      </div>
    </div>
  );
}

export function EditableBandRow({ label, band, onChange, readOnly = false }: { label: string; band?: number; onChange: (v: number | undefined) => void; readOnly?: boolean }) {
  const pct = typeof band === "number" ? Math.min(100, (band / 9) * 100) : 0;
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink-600">{label}</span>
        <BandSelect value={band} onChange={onChange} readOnly={readOnly} />
      </div>
      <div className="h-2 rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Enough scores to save/finalize: every criterion in `codes` has a numeric band > 0 (matching the backend rule).
export function criteriaComplete(criteria: Record<string, { band?: unknown }> | undefined, codes: readonly string[]): boolean {
  return codes.every((code) => {
    const band = criteria?.[code]?.band;
    return typeof band === "number" && band > 0;
  });
}
