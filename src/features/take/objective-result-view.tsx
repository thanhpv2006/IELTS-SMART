"use client";

// Read-only objective (reading/listening) result view — rendered on the student result page and
// reused read-only by the teacher review page (standalone R/L assignments and mock R/L skills).
// Consumes the objective result JSON persisted by the backend:
//   { kind:"objective", skill, raw, total, band, sections:[{ passage?, audio_url?, items[] }] }.
// The release-gated result carries the answer key (correct_answers) + the student's submitted values.

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  groupChooseResults,
  parseOptionList,
  summarizeChooseBlock,
  type ParsedOption,
} from "@novaforge-team/ielts-exam-engine";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ObjectiveResultItem = {
  number: number;
  correct: boolean;
  /** Group type; `groupChooseResults` treats an item without one as mergeable `mcq_multi`. */
  type?: string;
  /** The question text, so the student can re-read what was asked when reviewing. */
  prompt?: string;
  /** Raw option strings ("A Alfred Binet", "iii Working to…", "TRUE") of the item or its shared list. */
  options?: string[];
  /** The correct answer(s) — present only in the release-gated result, never on the take endpoint. */
  correct_answers?: string[];
  /** Other answers the grader also takes; only an answer-key preview carries them. */
  accepted_variants?: string[];
  /** The student's own submitted value(s); absent for unanswered questions. */
  submitted?: string[];
  /** Per-question explanation — present only in the release-gated result. */
  explanation?: string;
  /** 1-based index of the item's question group within its section; absent on results not backfilled. */
  group?: number;
  /** The group's instructions (sanitized HTML), repeated on every item of the group. */
  group_instructions?: string;
};

/** One source question's review context: reading passage (HTML) and/or listening audio + its items. */
export type ObjectiveResultSection = {
  passage?: string;
  audio_url?: string;
  /** Listening transcript (HTML), marked with `data-answer-q` spans at the answer location. */
  transcript?: string;
  items: ObjectiveResultItem[];
};

export type ObjectiveResult = {
  kind: "objective";
  skill: string;
  raw: number;
  total: number;
  band: number;
  sections: ObjectiveResultSection[];
};

const SKILL_LABEL: Record<string, string> = {
  reading: "Reading",
  listening: "Listening",
};

/** "Reading" / "Listening" for the result title — falls back to the raw skill for unknown values. */
export function objectiveSkillLabel(result: ObjectiveResult): string {
  return SKILL_LABEL[result.skill] ?? result.skill;
}

/** Structural discriminator — the backend tags objective results with `kind:"objective"`. */
export function isObjectiveResult(raw: unknown): raw is ObjectiveResult {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { kind?: unknown }).kind === "objective" &&
    // band is rendered unconditionally (result.band.toFixed) — validate it here so a malformed
    // payload falls through to another branch instead of crashing the view.
    typeof (raw as { band?: unknown }).band === "number" &&
    Array.isArray((raw as { sections?: unknown }).sections)
  );
}

function bandColor(b: number | null | undefined): string {
  if (typeof b !== "number") return "text-ink-400";
  if (b >= 7) return "text-green-600";
  if (b >= 5.5) return "text-brand-500";
  if (b >= 4) return "text-yellow-600";
  return "text-red-500";
}

/**
 * ObjectiveResultView renders one objective result.
 *
 * `answerKey` switches it from "what did this student score" to "what is the published key": there
 * is no attempt behind the payload, so the band header, the submitted value and the correct/wrong
 * badge would all state facts about a student who never sat it — and the key itself, which the
 * graded view only prints on wrong answers, has to print on every item instead.
 *
 * `showBand` is for a full test skill only: the raw→band table assumes the whole 40-question
 * paper, so a band converted from a single-Part practice score means nothing.
 */
export function ObjectiveResultView({
  result,
  answerKey = false,
  showBand = false,
}: {
  result: ObjectiveResult;
  answerKey?: boolean;
  showBand?: boolean;
}) {
  const skillLabel = objectiveSkillLabel(result);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-white p-5">
        {answerKey ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink-800">Đáp án {skillLabel}</p>
            <div className="flex flex-wrap gap-3">
              <StatChip label="Số câu" value={String(result.total)} />
            </div>
          </div>
        ) : !showBand ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink-800">Kết quả {skillLabel}</p>
            <div className="flex flex-wrap gap-3">
              <StatChip label="Số câu đúng" value={`${result.raw}/${result.total}`} />
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-brand-100 text-2xl font-bold num",
                bandColor(result.band),
              )}
            >
              {result.band.toFixed(1)}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink-800">Band {skillLabel} ước tính</p>
              <div className="flex flex-wrap gap-3">
                <StatChip label="Số câu đúng" value={`${result.raw}/${result.total}`} />
                <StatChip label="Điểm thô" value={String(result.raw)} />
              </div>
            </div>
          </>
        )}
      </div>

      <SectionedReview
        sections={result.sections}
        tabLabel={result.skill === "listening" ? "Part" : "Passage"}
        answerKey={answerKey}
      />
    </div>
  );
}

// Reading & Listening review — multiple source questions (passages / parts) →
// tabs; the active one shows in 2 columns: left = source material (audio + passage
// or transcript), right = per-question detail (answers + explanations). Each
// column scrolls independently so long material and the question list don't
// push the page height out.
function SectionedReview({
  sections,
  tabLabel,
  answerKey,
}: {
  sections: ObjectiveResultSection[];
  tabLabel: string;
  answerKey: boolean;
}) {
  const [active, setActive] = useState(0);
  const passageRef = useRef<HTMLDivElement>(null);
  const [paragraphScan, setParagraphScan] = useState<{ passage?: string; letters: ReadonlySet<string> }>(
    () => ({ letters: new Set() }),
  );
  // Tabs are labelled by index ("Part 1..N"), so the sections must run in question order —
  // results graded before the backend pinned the question order carry them shuffled, which
  // showed Part 1's transcript under the "Part 3" tab.
  const ordered = [...sections].sort((a, b) => firstQuestionNumber(a) - firstQuestionNumber(b));
  const idx = Math.max(0, Math.min(active, ordered.length - 1));
  const section: ObjectiveResultSection | undefined = ordered[idx];
  const passage = section?.passage;

  useEffect(() => {
    setParagraphScan({ passage, letters: new Set(letteredParagraphs(passageRef.current).keys()) });
  }, [passage]);
  const paragraphLetters: ReadonlySet<string> =
    paragraphScan.passage === passage ? paragraphScan.letters : NO_LETTERS;

  if (!section) return null;
  const items = [...section.items].sort((a, b) => a.number - b.number);
  const questionGroups = splitQuestionGroups(items);
  // A question is only locatable when the passage/transcript carries its answer mark.
  const marked = markedQuestionNumbers(section);
  const hasMaterial =
    Boolean(section.audio_url) || Boolean(section.passage) || Boolean(section.transcript);

  return (
    <div className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
      {ordered.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {ordered.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                idx === i
                  ? "border-brand-200 bg-brand-50 text-brand-600"
                  : "border-ink-200 bg-white text-ink-500 hover:text-ink-800",
              )}
            >
              {tabLabel} {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      {/* Both columns share one fixed height on desktop so the transcript/passage pane and the
          question list are the SAME height (balanced) — each scrolls internally instead of one column
          overhanging the other. */}
      <div className={cn("lg:grid lg:grid-cols-2 lg:gap-5", hasMaterial && "lg:h-[72vh]")}>
        {hasMaterial ? (
          <div className="space-y-3 lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-ink-100 lg:pr-5">
            <p className="text-sm font-semibold text-ink-800 lg:shrink-0">Ngữ liệu</p>
            {section.audio_url ? (
              <div className="space-y-1.5 lg:shrink-0">
                <p className="text-sm font-semibold text-ink-800">Nghe lại audio</p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={section.audio_url} className="w-full" />
              </div>
            ) : null}
            {/*
              Passage/transcript HTML is sanitized at ingest on the backend (bluemonday),
              including the `data-answer-q` marks used for highlighting — no FE sanitizer
              runs on these strings, so no allow-list update is needed here.

              Both blocks share ONE flex-1 scroll area (not one flex-1 each): a short passage +
              long transcript would otherwise each take half the column, leaving a big blank gap
              between them. Together they flow naturally and scroll as a single pane.
            */}
            {section.passage || section.transcript ? (
              <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {section.passage ? (
                  <div>
                    <p className="mb-1.5 text-sm font-semibold text-ink-800">Đề bài</p>
                    <div
                      ref={passageRef}
                      className="rl-highlight prose prose-sm max-w-none text-ink-700"
                      dangerouslySetInnerHTML={{ __html: section.passage }}
                    />
                  </div>
                ) : null}
                {section.transcript ? (
                  <div>
                    <p className="mb-1.5 text-sm font-semibold text-ink-800">Transcript</p>
                    <div
                      className="rl-highlight prose prose-sm max-w-none text-ink-700"
                      dangerouslySetInnerHTML={{ __html: section.transcript }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "lg:flex lg:min-h-0 lg:flex-col",
            !hasMaterial && "lg:col-span-2",
            hasMaterial && "mt-4 lg:mt-0",
          )}
        >
          <p className="mb-3 text-sm font-semibold text-ink-800 lg:shrink-0">Chi tiết từng câu</p>
          {questionGroups ? (
            <div className="space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              {questionGroups.map((group) => (
                <QuestionGroupBlock
                  key={group.items[0].number}
                  group={group}
                  marked={marked}
                  answerKey={answerKey}
                  paragraphLetters={paragraphLetters}
                  passageRef={passageRef}
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              {groupChooseResults(items).map((block) => (
                <ObjectiveItemRow
                  key={block[0].number}
                  block={block}
                  locatable={block.some((i) => marked.has(i.number))}
                  answerKey={answerKey}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lowest question number in a section — its position in the Part/Passage sequence. */
function firstQuestionNumber(section: ObjectiveResultSection): number {
  return section.items.reduce((min, it) => Math.min(min, it.number), Number.MAX_SAFE_INTEGER);
}

/** Question numbers the section's material marks with `data-answer-q`, i.e. the ones "Xem vị trí" can jump to. */
function markedQuestionNumbers(section: ObjectiveResultSection): Set<number> {
  const out = new Set<number>();
  for (const html of [section.passage, section.transcript]) {
    if (!html) continue;
    for (const m of html.matchAll(/data-answer-q\s*=\s*["']?(\d+)/g)) out.add(Number(m[1]));
  }
  return out;
}

const NO_LETTERS: ReadonlySet<string> = new Set();

type QuestionGroup = {
  items: ObjectiveResultItem[];
  blocks: ObjectiveResultItem[][];
};

function groupInstructions(item: ObjectiveResultItem): string {
  return item.group_instructions?.trim() ?? "";
}

/**
 * Runs of consecutive items sharing a `group` and header, or null when any item lacks a group — a
 * result the backfill hasn't reached yet keeps the flat list instead of a half-grouped one.
 * The header check matters because `group` restarts per source question, and an old mock result
 * can collapse several source questions into one section.
 */
function splitQuestionGroups(items: ObjectiveResultItem[]): QuestionGroup[] | null {
  if (items.length === 0) return null;
  if (!items.every((i) => typeof i.group === "number" && i.group >= 1)) return null;
  const runs: QuestionGroup[] = [];
  const runOf = new Map<number, QuestionGroup>();
  for (const item of items) {
    const last = runs[runs.length - 1];
    const leader = last?.items[0];
    if (last && leader && leader.group === item.group && groupInstructions(leader) === groupInstructions(item)) {
      last.items.push(item);
      runOf.set(item.number, last);
    } else {
      const run: QuestionGroup = { items: [item], blocks: [] };
      runs.push(run);
      runOf.set(item.number, run);
    }
  }
  // Choose-N pairs are merged across the whole section first so a pair split over two groups
  // still renders as one row, under its leader's group.
  for (const block of groupChooseResults(items)) runOf.get(block[0].number)?.blocks.push(block);
  return runs.filter((run) => run.blocks.length > 0);
}

function sameAnswer(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function includesAnswer(values: string[] | undefined, value: string): boolean {
  return (values ?? []).some((v) => sameAnswer(v, value));
}

function isMcqType(type: string | undefined): boolean {
  return type === "mcq_single" || type === "mcq_multi";
}

/** The group's shared, labelled option list (headings, features…), or null when it has none. */
function sharedOptionBank(items: ObjectiveResultItem[]): ParsedOption[] | null {
  if (isMcqType(items[0].type)) return null;
  const first = items[0].options;
  if (!first?.length) return null;
  const shared = items.every(
    (i) => i.options?.length === first.length && i.options.every((o, k) => o === first[k]),
  );
  if (!shared) return null;
  const parsed = parseOptionList(first);
  return parsed.some((o) => o.label !== "") ? parsed : null;
}

/** Matching information whose answers are bare paragraph letters, shown as "Đoạn E". */
function isParagraphGroup(items: ObjectiveResultItem[]): boolean {
  if (items[0].type !== "matching_info") return false;
  const isLetter = (v: string) => /^[A-Z]$/.test(v.trim());
  return items.every((i) =>
    i.options?.length
      ? parseOptionList(i.options).every((o) => isLetter(o.value) && o.label === "")
      : (i.correct_answers ?? []).every(isLetter),
  );
}

/** The bold paragraph letter a `<p>` opens with (`<p><strong>E</strong> …`, possibly wrapped), if any. */
function paragraphLeadLetter(p: HTMLElement): string | null {
  const walker = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text && !(text.textContent ?? "").trim()) text = walker.nextNode();
  for (let el = text?.parentElement ?? null; el && el !== p; el = el.parentElement) {
    if (el.tagName !== "STRONG" && el.tagName !== "B") continue;
    const letter = (el.textContent ?? "").trim();
    return /^[A-Z]$/.test(letter) ? letter : null;
  }
  return null;
}

/** Passage paragraphs that open with a bold paragraph letter, keyed by letter. */
function letteredParagraphs(root: HTMLElement | null): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>();
  if (!root) return out;
  for (const p of Array.from(root.querySelectorAll<HTMLElement>("p"))) {
    const letter = paragraphLeadLetter(p);
    if (letter && !out.has(letter)) out.set(letter, p);
  }
  return out;
}

function flashElements(elements: HTMLElement[]) {
  const target = elements[0];
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  for (const el of elements) {
    el.classList.remove("answer-flash");
    void el.offsetWidth; // force reflow so the animation restarts if it's still mid-flight
    el.classList.add("answer-flash");
    el.addEventListener("animationend", () => el.classList.remove("answer-flash"), { once: true });
  }
}

function locateAnswerMarks(numbers: number[]) {
  flashElements(
    numbers.flatMap((n) => Array.from(document.querySelectorAll<HTMLElement>(`[data-answer-q="${n}"]`))),
  );
}

type ParagraphJump = {
  letters: ReadonlySet<string>;
  onJump: (letter: string) => void;
};

function QuestionGroupBlock({
  group,
  marked,
  answerKey,
  paragraphLetters,
  passageRef,
}: {
  group: QuestionGroup;
  marked: Set<number>;
  answerKey: boolean;
  paragraphLetters: ReadonlySet<string>;
  passageRef: RefObject<HTMLDivElement | null>;
}) {
  const { items, blocks } = group;
  const instructions = groupInstructions(items[0]);
  const bank = sharedOptionBank(items);
  const paragraphs: ParagraphJump | undefined = isParagraphGroup(items)
    ? {
        letters: paragraphLetters,
        onJump: (letter) => {
          const p = letteredParagraphs(passageRef.current).get(letter);
          if (p) flashElements([p]);
        },
      }
    : undefined;

  return (
    <section className="space-y-2.5">
      {instructions || bank ? (
        <div className="space-y-2.5 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2.5">
          {instructions ? (
            <div
              className="prose prose-sm max-w-none text-ink-600 [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: instructions }}
            />
          ) : null}
          {bank ? <OptionBank options={bank} items={items} answerKey={answerKey} /> : null}
        </div>
      ) : null}
      <ul className="space-y-2.5">
        {blocks.map((block) => {
          const locatable = block.some((i) => marked.has(i.number));
          return bank ? (
            <CompactItemRow
              key={block[0].number}
              block={block}
              locatable={locatable}
              answerKey={answerKey}
            />
          ) : (
            <ObjectiveItemRow
              key={block[0].number}
              block={block}
              locatable={locatable}
              answerKey={answerKey}
              paragraphs={paragraphs}
            />
          );
        })}
      </ul>
    </section>
  );
}

function OptionBank({
  options,
  items,
  answerKey,
}: {
  options: ParsedOption[];
  items: ObjectiveResultItem[];
  answerKey: boolean;
}) {
  return (
    <details className="group/bank rounded-lg border border-ink-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-3.5 shrink-0 text-ink-400 transition-transform group-open/bank:rotate-90"
        />
        <span>{`Danh sách lựa chọn (${options.length})`}</span>
      </summary>
      <ul aria-label="Danh sách lựa chọn" className="space-y-1 border-t border-ink-100 px-3 py-2 text-[13px]">
        {options.map((o, i) => {
          const correctFor = items.filter((it) => includesAnswer(it.correct_answers, o.value));
          const wrongFor = answerKey
            ? []
            : items.filter(
                (it) => includesAnswer(it.submitted, o.value) && !includesAnswer(it.correct_answers, o.value),
              );
          return (
            <li key={`${o.value}-${i}`} className="flex gap-2">
              <span className="min-w-[2.25rem] shrink-0 font-semibold text-ink-800">{o.value}</span>
              <span className="min-w-0 flex-1 text-ink-600">{o.label}</span>
              {correctFor.length || wrongFor.length ? (
                <span className="flex max-w-[45%] flex-wrap justify-end gap-x-2 font-semibold">
                  {correctFor.map((it) => (
                    <span key={`c-${it.number}`} className="text-green-700">{`✓ câu ${it.number}`}</span>
                  ))}
                  {wrongFor.map((it) => (
                    <span key={`w-${it.number}`} className="text-red-600">{`✗ câu ${it.number}`}</span>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ResultBadge({ correct }: { correct: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold",
        correct ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-600",
      )}
      aria-label={correct ? "Đúng" : "Sai"}
    >
      {correct ? "✓" : "✗"}
    </span>
  );
}

function QuestionLabel({ label, prompt }: { label: string; prompt?: string }) {
  return (
    <p className="text-sm text-ink-800">
      <span className="font-semibold">Câu {label}.</span>
      {/* prompt is authored HTML (may carry entities like &#39; or inline <strong>), sanitized
          by the backend at ingest — render as HTML to match the engine's take-view, not as
          literal text (which showed `writer&#39;s`). */}
      {prompt ? <span className="ml-1" dangerouslySetInnerHTML={{ __html: prompt }} /> : null}
    </p>
  );
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-xs font-semibold text-brand-500 hover:text-brand-600 hover:underline"
    >
      {label}
    </button>
  );
}

function ExplanationBox({ explanations }: { explanations: string[] }) {
  if (explanations.length === 0) return null;
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
      <p className="mb-0.5 font-semibold text-ink-800">Giải thích</p>
      {explanations.map((explanation) => (
        <p key={explanation}>{explanation}</p>
      ))}
    </div>
  );
}

/** Row of a group with an option bank: the bank carries the option text, so answers are bare keys. */
function CompactItemRow({
  block,
  locatable,
  answerKey,
}: {
  block: ObjectiveResultItem[];
  locatable: boolean;
  answerKey: boolean;
}) {
  const s = summarizeChooseBlock(block);
  const allCorrect = s.correctCount === s.total;
  const correctText = s.correctAnswers.join(", ");
  const showPartialChip = s.total > 1 && s.correctCount > 0 && !allCorrect && !answerKey;

  return (
    <li className="flex gap-3 rounded-lg border border-ink-100 p-3">
      {answerKey ? null : <ResultBadge correct={allCorrect} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <QuestionLabel label={s.label} prompt={block[0].prompt} />
          </div>
          <div className="flex shrink-0 items-baseline gap-3">
            <span className="text-[13px] font-semibold">
              {answerKey || allCorrect ? (
                <span className="text-green-700">{correctText}</span>
              ) : (
                <>
                  {s.submitted.length ? (
                    <span className="text-red-600">{s.submitted.join(", ")}</span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                  <span className="text-ink-400"> → </span>
                  <span className="text-green-700">{correctText}</span>
                </>
              )}
            </span>
            {locatable ? (
              <LinkButton label="Xem vị trí" onClick={() => locateAnswerMarks(block.map((i) => i.number))} />
            ) : null}
          </div>
        </div>
        {showPartialChip ? (
          <p className="text-[13px] font-semibold text-amber-700">{`Đúng ${s.correctCount}/${s.total}`}</p>
        ) : null}
        <ExplanationBox explanations={s.explanations} />
      </div>
    </li>
  );
}

function ObjectiveItemRow({
  block,
  locatable,
  answerKey,
  paragraphs,
}: {
  block: ObjectiveResultItem[];
  locatable: boolean;
  answerKey: boolean;
  paragraphs?: ParagraphJump;
}) {
  const leader = block[0];
  const s = summarizeChooseBlock(block);
  const allCorrect = s.correctCount === s.total;
  const parsed = parseOptionList(leader.options ?? []);
  const showOptionList = isMcqType(leader.type) && parsed.some((o) => o.label !== "");
  const describe = (value: string) => {
    if (paragraphs) return `Đoạn ${value}`;
    if (showOptionList) return value;
    const hit = parsed.find((o) => sameAnswer(o.value, value));
    return hit && hit.label ? `${value} — ${hit.label}` : value;
  };
  const submitted = s.submitted.length ? s.submitted.map(describe).join(", ") : null;
  const correctAnswers = s.correctAnswers.length ? s.correctAnswers.map(describe).join(", ") : null;
  const optionState = (value: string): "correct" | "wrong" | "neutral" => {
    if (includesAnswer(s.correctAnswers, value)) return "correct";
    if (!answerKey && includesAnswer(s.submitted, value)) return "wrong";
    return "neutral";
  };
  const acceptedVariants =
    block.length === 1 && leader.accepted_variants?.length ? leader.accepted_variants.join(", ") : null;
  const showPartialChip = s.total > 1 && s.correctCount > 0 && !allCorrect && !answerKey;
  const jumpLetters = paragraphs
    ? s.correctAnswers.map((a) => a.trim().toUpperCase()).filter((l) => paragraphs.letters.has(l))
    : [];

  return (
    <li className="flex gap-3 rounded-lg border border-ink-100 p-3">
      {answerKey ? null : <ResultBadge correct={allCorrect} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <QuestionLabel label={s.label} prompt={leader.prompt} />
          {locatable ? (
            <LinkButton label="Xem vị trí" onClick={() => locateAnswerMarks(block.map((i) => i.number))} />
          ) : null}
        </div>
        {showOptionList ? (
          <ul aria-label="Các lựa chọn" className="space-y-0.5 text-[13px]">
            {parsed.map((o, i) => {
              const state = optionState(o.value);
              return (
                <li
                  key={`${o.value}-${i}`}
                  data-state={state}
                  className={cn(
                    "flex gap-1.5",
                    state === "correct" && "font-semibold text-green-700",
                    state === "wrong" && "font-semibold text-red-600",
                    state === "neutral" && "text-ink-600",
                  )}
                >
                  <span className="font-semibold">{o.value}.</span>
                  <span>{o.label}</span>
                  {state === "correct" ? <span aria-hidden>✓</span> : null}
                  {state === "wrong" ? <span aria-hidden>✗</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
          {answerKey ? null : (
            <span className="text-ink-600">
              Bạn trả lời:{" "}
              {submitted ? (
                <span className={cn("font-semibold", allCorrect ? "text-green-700" : "text-red-600")}>
                  {submitted}
                </span>
              ) : (
                <span className="italic text-ink-400">Chưa trả lời</span>
              )}
            </span>
          )}
          {(answerKey || !allCorrect) && correctAnswers ? (
            <span className="text-ink-600">
              Đáp án đúng: <span className="font-semibold text-green-700">{correctAnswers}</span>
            </span>
          ) : null}
          {(answerKey || !allCorrect) && correctAnswers && acceptedVariants ? (
            <span className="text-ink-600">
              Cũng chấp nhận: <span className="font-semibold text-green-700">{acceptedVariants}</span>
            </span>
          ) : null}
          {showPartialChip ? (
            <span className="font-semibold text-amber-700">{`Đúng ${s.correctCount}/${s.total}`}</span>
          ) : null}
          {jumpLetters.map((letter, i) => (
            <LinkButton key={`${letter}-${i}`} label={`Xem đoạn ${letter}`} onClick={() => paragraphs?.onJump(letter)} />
          ))}
        </div>
        <ExplanationBox explanations={s.explanations} />
      </div>
    </li>
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
