"use client";

// SpeakingGradingPanel / WritingGradingPanel — the 3-column grading BODY shared
// between the standalone review page (`results/[id]/page.tsx`) and the mock
// review flow (`MockResultReview`). Panel keeps its own draft state and calls
// `onChange(buildResult())` on every edit — it never saves/renders a footer;
// the host wraps it with its own save/footer + mutation.

import { useContext, useEffect, useMemo, useState } from "react";
import { Stimulus } from "@/components/ui/stimulus";
import { cn } from "@/lib/utils";
import { useEditableErrors, EditableErrorList, buildErrorBlocks, flattenErrors, blankErr, type EditErr } from "@/features/partner/result-errors-edit";
import type { AnswerItem, ResultGate } from "@/features/partner/api";
import type { SpeakingResult, CriterionCode } from "@/features/partner/result-types";
import type { WritingCriterionCode, WritingResult } from "@/features/writing/writing-result-types";
import { roundHalf } from "@/features/mock/mock-band";
import { criterionMeanBand } from "@/features/review/criterion-band";
import {
  SPEAKING_CRITERIA,
  WRITING_CRITERIA,
  SPEAKING_LABEL,
  WRITING_LABEL,
  StudentContext,
  EditableBandSummary,
  EditableBandRow,
  CriteriaCard,
  FilterChip,
  CriterionEditCard,
  SelectionAddButton,
  useSelectionAdd,
  groupAnswersByPart,
  resolveTranscripts,
  buildBlockMap,
  SpeakingAnswerCard,
  critMarkClass,
  highlightText,
  firstText,
  type Transcript,
  type Mark,
  type SelInfo,
} from "./grading-shared";

// ─── Speaking ────────────────────────────────────────────────────────────────

export function SpeakingGradingPanel({
  result,
  answers,
  readOnly = false,
  blankScores = false,
  manual = false,
  onChange,
}: {
  result: SpeakingResult;
  answers: AnswerItem[];
  readOnly?: boolean;
  blankScores?: boolean;
  manual?: boolean;
  onChange: (built: SpeakingResult) => void;
}) {
  const fieldsReadOnly = !!readOnly;
  const isStudent = useContext(StudentContext);
  const transcripts = useMemo(() => {
    const arr = resolveTranscripts(result, answers);
    return new Map<number, Transcript>(answers.map((a, i) => [a.sequence, arr[i]]));
  }, [result, answers]);
  const partGroups = useMemo(() => groupAnswersByPart(answers), [answers]);
  // With real Part data (≥1 group has a part) show the Part tabs; otherwise show the answers directly.
  const showPartTabs = partGroups.some((g) => g.part != null);

  // Editable draft — bands per criterion + overall + per-criterion comment.
  // gated-fail (blankScores): leave the AI score blank so the teacher grades from scratch.
  const [bands, setBands] = useState<Partial<Record<CriterionCode, number>>>(() => {
    const init: Partial<Record<CriterionCode, number>> = {};
    if (!blankScores) for (const code of SPEAKING_CRITERIA) init[code] = result.criteria?.[code]?.band;
    return init;
  });
  // Band Speaking = criterion-average of the 4 criteria — computed and locked (matching the
  // backend recompute, which overwrites whatever this sends).
  const overall = useMemo<number | undefined>(
    () => criterionMeanBand(SPEAKING_CRITERIA.map((c) => bands[c])),
    [bands],
  );
  const [comments, setComments] = useState<Partial<Record<CriterionCode, string>>>(() => {
    const init: Partial<Record<CriterionCode, string>> = {};
    for (const code of SPEAKING_CRITERIA) init[code] = result.criteria?.[code]?.comment ?? "";
    return init;
  });
  const [partTab, setPartTab] = useState(0);
  const [critFilter, setCritFilter] = useState<"all" | CriterionCode>("all");

  const { errs, update: updateErr, remove: removeErr, add: addErr } = useEditableErrors(result.errors);
  const critCount = (code: CriterionCode) => errs.filter((e) => e.criterion_code === code).length;
  const shownErrors = critFilter === "all" ? errs : errs.filter((e) => e.criterion_code === critFilter);

  // Overlay errors on the transcript: pair the error block with its question, build the marks and the highlight source (original_answer).
  const blockMap = useMemo(() => buildBlockMap(result, answers), [result, answers]);
  const origBySeq = useMemo(() => {
    const m = new Map<number, string>();
    const blocks = result.errors ?? [];
    blockMap.byBi.forEach((info, bi) => {
      const oa = blocks[bi]?.original_answer;
      if (oa) m.set(info.sequence, oa);
    });
    return m;
  }, [result, blockMap]);
  const marksBySeq = useMemo(() => {
    const m = new Map<number, Mark[]>();
    for (const e of errs) {
      const info = blockMap.byBi.get(e.bi);
      if (!info || !e.error_part) continue;
      const arr = m.get(info.sequence) ?? [];
      arr.push({
        term: e.error_part,
        className: critMarkClass(e.criterion_code ?? ""),
        title: [e.explanation, e.correction].filter(Boolean).join(" · ") || undefined,
        id: `mark-${e._id}`,
      });
      m.set(info.sequence, arr);
    }
    return m;
  }, [errs, blockMap]);

  // Clicking an error in the panel switches to the right Part tab, scrolls to it and flashes the span in the transcript.
  const [pendingFlash, setPendingFlash] = useState<string | null>(null);
  const jumpTo = (err: EditErr) => {
    const info = blockMap.byBi.get(err.bi);
    if (!info) return;
    if (showPartTabs) {
      const idx = partGroups.findIndex((g) => g.answers.some((a) => a.sequence === info.sequence));
      if (idx >= 0 && idx !== partTab) setPartTab(idx);
    }
    setPendingFlash(`mark-${err._id}`);
  };
  useEffect(() => {
    if (!pendingFlash) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(pendingFlash);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const flash = ["ring-2", "ring-offset-1", "ring-amber-400", "rounded"];
        el.classList.add(...flash);
        setTimeout(() => el.classList.remove(...flash), 1400);
      }
      setPendingFlash(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingFlash, partTab]);

  // The other direction: clicking a highlighted span in the transcript scrolls to and flashes the error in the panel.
  const [panelFlash, setPanelFlash] = useState<string | null>(null);
  const jumpToPanel = (markId: string) => {
    setCritFilter("all"); // clear the filter so the error is guaranteed to appear in the list
    setPanelFlash(markId.replace(/^mark-/, "err-row-"));
  };
  useEffect(() => {
    if (!panelFlash) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(panelFlash);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const flash = ["ring-2", "ring-offset-1", "ring-amber-400", "rounded-xl"];
        el.classList.add(...flash);
        setTimeout(() => el.classList.remove(...flash), 1400);
      }
      setPanelFlash(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [panelFlash, critFilter]);

  // A teacher selects transcript text → adds an error whose error_part is the selection.
  const selAdd = useSelectionAdd(!fieldsReadOnly);
  // Part/question label by sequence (matching the "Question N" shown on the card).
  const infoBySeq = useMemo(() => {
    const m = new Map<number, { part: number | null; qNumber: number }>();
    for (const g of partGroups) g.answers.forEach((a, i) => m.set(a.sequence, { part: g.part, qNumber: i + 1 }));
    return m;
  }, [partGroups]);
  const addErrFromSelection = (s: SelInfo) => {
    // Attach the error to that question's block when it already has one (written to the right group and highlighted at once);
    // otherwise keep bi=-1 but store seq so the Part/question label still shows.
    const bi = s.seq != null ? (blockMap.bySeq.get(s.seq) ?? -1) : -1;
    const e = addErr({ error_part: s.text, bi, seq: s.seq });
    setCritFilter("all");
    selAdd.clear();
    setPanelFlash(`err-row-${e._id}`);
  };
  const errLabel = (e: EditErr): string | null => {
    const info = blockMap.byBi.get(e.bi) ?? (e.seq != null ? infoBySeq.get(e.seq) : undefined);
    if (!info) return null;
    const p = info.part && info.part > 0 ? `Part ${info.part} · ` : "";
    return `${p}Câu ${info.qNumber}`;
  };

  const buildResult = (): SpeakingResult => {
    const criteria: SpeakingResult["criteria"] = { ...(result.criteria ?? {}) };
    for (const code of SPEAKING_CRITERIA) {
      criteria[code] = { ...(result.criteria?.[code] ?? {}), band: bands[code], comment: comments[code] };
    }
    return {
      ...result,
      overall_band: overall,
      overall_feedback: { ...(result.overall_feedback ?? {}), final_band: overall },
      criteria,
      errors: buildErrorBlocks(errs, result.errors) as SpeakingResult["errors"],
    };
  };

  // Seam: whenever the draft changes (bands/comments/errs), hand the newest build up to the host.
  // Never reset state from the `result` prop after mount (seeded with a useState initializer only).
  useEffect(() => {
    onChange(buildResult());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, comments, errs]);

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 lg:grid lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,0.8fr)] lg:overflow-hidden">
        {/* 1 · scores + teacher comments */}
        <aside className="space-y-4 border-b border-ink-100 p-5 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <EditableBandSummary band={fieldsReadOnly ? (result.overall_band ?? result.overall_feedback?.final_band) : overall} label="Band Speaking" />
          <CriteriaCard title="Điểm theo tiêu chí" scale="Thang 0–9">
            {SPEAKING_CRITERIA.map((code) => (
              <EditableBandRow key={code} label={SPEAKING_LABEL[code]} band={bands[code]} onChange={(v) => setBands((b) => ({ ...b, [code]: v }))} readOnly={fieldsReadOnly} />
            ))}
          </CriteriaCard>
        </aside>

        {/* 2 · the student's work (speaking answers) */}
        <section className="p-5 lg:min-h-0 lg:overflow-y-auto" onMouseUp={selAdd.onMouseUp}>
          {partGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">Chưa có câu trả lời.</p>
          ) : (
            <>
              {/* Only show tabs when Part information exists (grouped by part); otherwise show it directly. */}
              {showPartTabs && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {partGroups.map((g, i) => (
                    <button key={i} type="button" onClick={() => setPartTab(i)}
                      className={cn("rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                        partTab === i ? "border-brand-200 bg-brand-50 text-brand-600" : "border-ink-200 bg-white text-ink-500 hover:text-ink-800")}>
                      Part {g.part}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-4">
                {(partGroups[showPartTabs ? partTab : 0] ?? partGroups[0]).answers.map((a, i) => (
                  <SpeakingAnswerCard key={a.sequence} answer={a} transcript={transcripts.get(a.sequence)} index={i} marks={marksBySeq.get(a.sequence)} highlightSource={origBySeq.get(a.sequence)} onMarkClick={jumpToPanel} />
                ))}
              </div>
            </>
          )}
        </section>
        <SelectionAddButton sel={selAdd.sel} onAdd={addErrFromSelection} />

        {/* 3 · AI comments & errors */}
        <aside className="border-t border-ink-100 p-5 lg:border-t-0 lg:border-l lg:min-h-0 lg:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-ink-900">{isStudent || manual ? "Nhận xét & lỗi" : "Nhận xét & lỗi của AI"}</h2>
            <span className="text-sm text-ink-400">{errs.length} lỗi</span>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            <FilterChip active={critFilter === "all"} onClick={() => setCritFilter("all")} label={`Tất cả (${errs.length})`} testId="criterion-chip-all" />
            {SPEAKING_CRITERIA.map((code) => (
              <FilterChip key={code} active={critFilter === code} onClick={() => setCritFilter(code)} label={`${code} (${critCount(code)})`} testId={`criterion-chip-${code}`} />
            ))}
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">Đánh giá theo tiêu chí</p>
          <div className="space-y-3">
            {SPEAKING_CRITERIA.filter((code) => critFilter === "all" || critFilter === code).map((code) => (
              <CriterionEditCard
                key={code}
                code={code}
                label={SPEAKING_LABEL[code]}
                band={bands[code]}
                value={comments[code] ?? ""}
                fallback={firstText(result.criteria?.[code]?.weaknesses) || firstText(result.criteria?.[code]?.next_steps)}
                onChange={(v) => setComments((c) => ({ ...c, [code]: v }))}
                readOnly={fieldsReadOnly}
              />
            ))}
          </div>
          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-ink-400">Chi tiết lỗi ({shownErrors.length})</p>
          <EditableErrorList
            errs={shownErrors}
            codes={SPEAKING_CRITERIA}
            onAdd={() => { setCritFilter("all"); addErr(); }}
            onUpdate={updateErr}
            onRemove={removeErr}
            readOnly={fieldsReadOnly}
            hideSource={isStudent || manual}
            onJump={jumpTo}
            label={errLabel}
          />
        </aside>
      </main>
    </>
  );
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export function WritingGradingPanel({
  result,
  answers,
  readOnly = false,
  activeIdx = 0,
  gate,
  notReviewed = false,
  manual = false,
  onChange,
}: {
  result: WritingResult;
  answers: AnswerItem[];
  readOnly?: boolean;
  activeIdx?: number;
  gate?: ResultGate;
  notReviewed?: boolean;
  manual?: boolean;
  onChange: (built: WritingResult) => void;
}) {
  const fieldsReadOnly = !!readOnly;
  const isStudent = useContext(StudentContext);
  // Multi-task (Mock): each task has its own band/comments/errors and its own submitted work. The task tab
  // is managed by the host (controlled prop `activeIdx`).
  const tasks = result.multi_task && result.tasks?.length ? result.tasks : [result];
  const idx = Math.min(activeIdx, tasks.length - 1);
  const submittedEssays = (answers ?? []).filter((a) => a.essay_text != null);
  // The manual frame lists tasks in answer-sequence order, so pair them the same way.
  const essayAnswers = manual ? [...submittedEssays].sort((a, b) => a.sequence - b.sequence) : submittedEssays;

  // Gate per task: multi-task reads gate.tasks[i]; a single (flat) essay reads gate.status.
  const taskFailed = (i: number): boolean =>
    gate?.tasks?.length ? gate.tasks[i]?.status === "fail" : gate?.status === "fail";
  // Blank out one task's AI score when that task failed the gate and the attempt was never reviewed.
  const blankTask = (i: number): boolean => notReviewed && taskFailed(i);
  // Per-task state (edits survive a tab switch). A failed task is left blank for the teacher to fill.
  const [bandsByTask, setBandsByTask] = useState<Partial<Record<WritingCriterionCode, number>>[]>(() =>
    tasks.map((t, i) => { const o: Partial<Record<WritingCriterionCode, number>> = {}; if (!blankTask(i)) for (const c of WRITING_CRITERIA) o[c] = t.criteria?.[c]?.band; return o; }),
  );
  const [commentsByTask, setCommentsByTask] = useState<Partial<Record<WritingCriterionCode, string>>[]>(() =>
    tasks.map((t) => { const o: Partial<Record<WritingCriterionCode, string>> = {}; for (const c of WRITING_CRITERIA) o[c] = t.criteria?.[c]?.comment ?? ""; return o; }),
  );
  const [errsByTask, setErrsByTask] = useState<EditErr[][]>(() => tasks.map((t) => flattenErrors(t.errors)));
  const [essayTab, setEssayTab] = useState<"orig" | "fixed">("orig");
  const [critFilter, setCritFilter] = useState<"all" | WritingCriterionCode>("all");

  // Band Writing = criterion-average per task, then roundHalf(Task-2-weighted) — computed and
  // locked. The two rules differ on purpose: the backend rounds each task's criteria with the
  // criterion-average rule and only the cross-task combine with nearest-half.
  const overall = useMemo<number | undefined>(() => {
    const mean4 = (b: Partial<Record<WritingCriterionCode, number>>): number | undefined =>
      criterionMeanBand(WRITING_CRITERIA.map((c) => b[c]));
    if (result.multi_task && result.tasks?.length) {
      let wsum = 0;
      let wtot = 0;
      for (let i = 0; i < bandsByTask.length; i++) {
        const tb = mean4(bandsByTask[i]);
        if (tb === undefined) return undefined;
        // Mirror backend taskWeight: task_type present ⇒ decided ONLY by Contains("2")
        // (never falls through to index); absent ⇒ index-based (Task 2 = 2).
        const tt = result.tasks[i]?.task_type;
        const weight = typeof tt === "string" ? (tt.includes("2") ? 2 : 1) : i >= 1 ? 2 : 1;
        wsum += tb * weight;
        wtot += weight;
      }
      return wtot > 0 ? roundHalf(wsum / wtot) : undefined;
    }
    return mean4(bandsByTask[0] ?? {});
  }, [bandsByTask, result]);

  const active = tasks[idx];
  const bands = bandsByTask[idx];
  const comments = commentsByTask[idx];
  const errs = errsByTask[idx];
  const essay = essayAnswers[idx]?.essay_text ?? essayAnswers[0]?.essay_text ?? "";
  // The real prompt (HTML) resolved from the bank by answer; empty when the set was deleted.
  const questionPrompt = essayAnswers[idx]?.question_prompt ?? essayAnswers[0]?.question_prompt ?? "";

  const setBand = (code: WritingCriterionCode, v: number | undefined) =>
    setBandsByTask((prev) => prev.map((b, i) => (i === idx ? { ...b, [code]: v } : b)));
  const setComment = (code: WritingCriterionCode, v: string) =>
    setCommentsByTask((prev) => prev.map((c, i) => (i === idx ? { ...c, [code]: v } : c)));
  const updateErr = (eid: string, patch: Partial<EditErr>) =>
    setErrsByTask((prev) => prev.map((arr, i) => (i === idx ? arr.map((e) => (e._id === eid ? { ...e, ...patch } : e)) : arr)));
  const removeErr = (eid: string) =>
    setErrsByTask((prev) => prev.map((arr, i) => (i === idx ? arr.filter((e) => e._id !== eid) : arr)));
  const addErr = (init?: Partial<EditErr>) => {
    const e = blankErr(init);
    setErrsByTask((prev) => prev.map((arr, i) => (i === idx ? [...arr, e] : arr)));
    return e;
  };

  const critCount = (code: WritingCriterionCode) => errs.filter((e) => e.criterion_code === code).length;
  const shownErrors = critFilter === "all" ? errs : errs.filter((e) => e.criterion_code === critFilter);
  const origMarks = shownErrors.map((e) => ({ term: e.error_part, className: critMarkClass(e.criterion_code ?? ""), title: e.explanation, id: `mark-${e._id}` }));
  const fixMarks = shownErrors.map((e) => ({ term: e.correction, className: "rounded bg-emerald-50 px-0.5 font-medium text-emerald-700", title: e.explanation }));
  const fixedEssay = active.clean_essay ?? "";
  const showFixedTab = !manual || !!fixedEssay;
  const shownEssayTab = showFixedTab ? essayTab : "orig";

  // Clicking an error in the panel returns to the "Bài gốc" tab, scrolls to it and flashes the span in the essay.
  const [pendingFlash, setPendingFlash] = useState<string | null>(null);
  const jumpToErr = (err: EditErr) => {
    setEssayTab("orig");
    setPendingFlash(`mark-${err._id}`);
  };
  useEffect(() => {
    if (!pendingFlash) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(pendingFlash);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const flash = ["ring-2", "ring-offset-1", "ring-amber-400", "rounded"];
        el.classList.add(...flash);
        setTimeout(() => el.classList.remove(...flash), 1400);
      }
      setPendingFlash(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingFlash, essayTab]);

  // The other direction: clicking a highlighted span in the essay scrolls to and flashes the error in the panel.
  const [panelFlash, setPanelFlash] = useState<string | null>(null);
  const jumpToPanel = (markId: string) => {
    setCritFilter("all");
    setPanelFlash(markId.replace(/^mark-/, "err-row-"));
  };
  useEffect(() => {
    if (!panelFlash) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(panelFlash);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const flash = ["ring-2", "ring-offset-1", "ring-amber-400", "rounded-xl"];
        el.classList.add(...flash);
        setTimeout(() => el.classList.remove(...flash), 1400);
      }
      setPanelFlash(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [panelFlash, critFilter]);

  // A teacher selects essay text → adds an error whose error_part is the selection.
  const selAdd = useSelectionAdd(!fieldsReadOnly);
  const addErrFromSelection = (s: SelInfo) => {
    const e = addErr({ error_part: s.text });
    setCritFilter("all");
    selAdd.clear();
    setPanelFlash(`err-row-${e._id}`);
  };

  const buildResult = (): WritingResult => {
    const buildTask = (task: WritingResult, ti: number): WritingResult => {
      const criteria: WritingResult["criteria"] = { ...(task.criteria ?? {}) };
      for (const code of WRITING_CRITERIA) {
        criteria[code] = { ...(task.criteria?.[code] ?? {}), band: bandsByTask[ti][code], comment: commentsByTask[ti][code] };
      }
      return { ...task, criteria, errors: buildErrorBlocks(errsByTask[ti], task.errors) as WritingResult["errors"] };
    };
    if (result.multi_task && result.tasks?.length) {
      return { ...result, overall_band: overall, tasks: result.tasks.map(buildTask) };
    }
    return { ...buildTask(result, 0), overall_band: overall };
  };

  // Seam: whenever the DRAFT changes (bands/comments/errs per task), hand the newest build up
  // to the host. The deps are ONLY draft state — NOT `result` (the host sets state = built, then passes
  // it back as the `result` prop on every render; putting `result` in the deps would loop forever)
  // and NOT `activeIdx` (buildResult always builds every task, so switching tabs changes no
  // output). Mirrors the Speaking panel. Never reset state from the `result` prop after mount.
  useEffect(() => {
    onChange(buildResult());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandsByTask, commentsByTask, errsByTask]);

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 lg:grid lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,0.8fr)] lg:overflow-hidden">
        <aside className="space-y-4 border-b border-ink-100 p-5 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <EditableBandSummary band={fieldsReadOnly ? (result.overall_band ?? tasks[0]?.overall_band) : overall} label="Band Writing" />
          <CriteriaCard title="Điểm theo tiêu chí" scale="Thang 0–9">
            {WRITING_CRITERIA.map((code) => (
              <EditableBandRow key={code} label={WRITING_LABEL[code]} band={bands[code]} onChange={(v) => setBand(code, v)} readOnly={fieldsReadOnly} />
            ))}
          </CriteriaCard>
        </aside>

        <section className="p-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            {(showFixedTab || active.word_count) && (
              <div className="mb-4 flex items-center justify-between gap-3">
                {showFixedTab && (
                  <div className="inline-flex rounded-lg bg-brand-50 p-1">
                    {([["orig", "Bài gốc"], ["fixed", "Bản sửa gợi ý"]] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setEssayTab(k)}
                        className={cn("rounded-md px-4 py-2 text-sm font-semibold transition-colors", essayTab === k ? "bg-white text-brand-600 shadow-sm" : "text-ink-400 hover:text-ink-600")}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {active.word_count && <span className="ml-auto text-xs font-medium text-ink-400">Word count: {active.word_count.detected}</span>}
              </div>
            )}
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
              <span className="rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">Writing</span>
              <span className="ml-3 text-xs font-bold uppercase tracking-wide text-ink-400">Đề bài</span>
              {questionPrompt ? (
                <div className="prose prose-sm mt-3 max-w-none text-ink-700" dangerouslySetInnerHTML={{ __html: questionPrompt }} />
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-ink-400">Chưa có nội dung đề bài.</p>
              )}
              {essayAnswers[idx]?.stimulus_url && <Stimulus src={essayAnswers[idx]!.stimulus_url!} className="mt-3" />}
            </div>
            {shownEssayTab === "fixed" && (
              <span className="mt-4 inline-block rounded-full border border-success-200 bg-success-50 px-3 py-0.5 text-xs font-semibold text-success-700">{isStudent || manual ? "Bản sửa gợi ý" : "Bản sửa gợi ý của AI"}</span>
            )}
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-400">Writing task - Bài làm của học viên</p>
            <article data-testid="essay-highlight" onMouseUp={selAdd.onMouseUp} className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-ink-900">
              {shownEssayTab === "orig"
                ? essay ? highlightText(essay, origMarks, jumpToPanel) : "Chưa có nội dung bài viết."
                : fixedEssay ? highlightText(fixedEssay, fixMarks) : "Chưa có bản sửa gợi ý."}
            </article>
          </div>
        </section>
        <SelectionAddButton sel={selAdd.sel} onAdd={addErrFromSelection} />

        <aside className="border-t border-ink-100 p-5 lg:border-t-0 lg:border-l lg:min-h-0 lg:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-ink-900">{isStudent || manual ? "Nhận xét & lỗi" : "Nhận xét & lỗi của AI"}</h2>
            <span className="text-sm text-ink-400">{errs.length} lỗi</span>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <FilterChip active={critFilter === "all"} onClick={() => setCritFilter("all")} label={`Tất cả (${errs.length})`} testId="criterion-chip-all" />
            {WRITING_CRITERIA.map((code) => (
              <FilterChip key={code} active={critFilter === code} onClick={() => setCritFilter(code)} label={`${code} (${critCount(code)})`} testId={`criterion-chip-${code}`} />
            ))}
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">Đánh giá theo tiêu chí</p>
          <div className="space-y-3">
            {WRITING_CRITERIA.filter((code) => critFilter === "all" || critFilter === code).map((code) => (
              <CriterionEditCard
                key={code}
                code={code}
                label={WRITING_LABEL[code]}
                band={bands[code]}
                value={comments[code] ?? ""}
                fallback={firstText(active.criteria?.[code]?.weaknesses) || firstText(active.criteria?.[code]?.next_steps)}
                onChange={(v) => setComment(code, v)}
                readOnly={fieldsReadOnly}
              />
            ))}
          </div>

          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-ink-400">Chi tiết lỗi ({shownErrors.length})</p>
          <EditableErrorList
            errs={shownErrors}
            codes={WRITING_CRITERIA}
            onAdd={() => { setCritFilter("all"); addErr(); }}
            onUpdate={updateErr}
            onRemove={removeErr}
            readOnly={fieldsReadOnly}
            hideSource={isStudent || manual}
            onJump={jumpToErr}
          />
        </aside>
      </main>
    </>
  );
}
