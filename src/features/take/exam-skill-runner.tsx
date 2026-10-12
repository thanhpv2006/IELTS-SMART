"use client";

import { type ComponentProps, type Ref } from "react";
import {
  SkillRunner,
  defaultCopyEn,
  type CatalogQuestion,
  type ExamCopy,
  type Skill,
  type SkillRunnerHandle,
  type SubmitPayload,
} from "@novaforge-team/ielts-exam-engine";
import { useExamFullscreen } from "./use-exam-fullscreen";
import { FullscreenGate } from "./fullscreen-gate";
import { useObscureMedia } from "./exam-media-guard";

type SkillRunnerProps = ComponentProps<typeof SkillRunner>;

export type ExamSkillRunnerProps = {
  skill: Skill;
  questions: CatalogQuestion[];
  /**
   * true → real-exam mode (split-pane/palette/timer/highlighter) for Reading and the mock
   * full-test. false → practice mode (seekable, no timer) for Listening/Speaking/Writing on
   * the single-skill take flow. See design GC5.
   */
  examMode: boolean;
  /** Countdown limit. Typically only set in exam mode, but forwarded in practice mode too
   *  (e.g. a center-configured practice time box). */
  timeLimitSeconds?: number;
  /** Per-center policy (GC1). App-side lockdown only — see design D1/GC5; the engine is unaware. */
  fullscreen?: boolean;
  /** `${id}:${skill}` — engine 2.2 persists answers + time + audio position to localStorage. */
  draftKey: string;
  /** Defaults to defaultCopyEn (English chrome, matching real CBT exams). */
  copy?: ExamCopy;
  /** Imperative handle forwarded to the engine's SkillRunner (force-submit from the host page — GC3/D3). */
  runnerRef?: Ref<SkillRunnerHandle>;
  onUploadAudio: (blob: Blob, questionId: string) => Promise<string>;
  onSubmit: (payload: SubmitPayload) => void | Promise<void>;
  onExit?: () => void;
  /** Speaking/Writing practice passthrough (e.g. autoRecord). Ignored in exam mode. */
  policyOverrides?: SkillRunnerProps["policyOverrides"];
  speakingTiming?: SkillRunnerProps["speakingTiming"];
  /** Examiner lead-in clips per Speaking part; gated by engine policy `speakingPartIntro`. */
  speakingIntros?: SkillRunnerProps["speakingIntros"];
  /** Examiner headshot for the Speaking examiner block. */
  examinerImageUrl?: SkillRunnerProps["examinerImageUrl"];
  /**
   * Widened from `SkillRunnerProps["onViolation"]` so the wrapper can also emit its own
   * app-side `"exit-fullscreen"` event (the engine has no concept of fullscreen — GC5). A
   * `(e: { type: string }) => void` handler is still assignable wherever the engine's own
   * `ViolationEvent` handler type is expected, by parameter contravariance.
   */
  onViolation?: (e: { type: string }) => void;
  showViolationToast?: boolean;
  enableHighlighter?: boolean;
};

/**
 * Presentation-only wrapper around the engine SkillRunner that encodes the "thi thật" exam-mode
 * configuration (mode, highlighter, timer, draft) shared by the take/[id] and mock surfaces.
 * It owns no orchestration — each call-site keeps its own data/submit flow and passes onSubmit.
 */
export function ExamSkillRunner({
  skill,
  questions,
  examMode,
  timeLimitSeconds,
  fullscreen,
  draftKey,
  copy,
  onUploadAudio,
  onSubmit,
  onExit,
  policyOverrides,
  speakingTiming,
  speakingIntros,
  examinerImageUrl,
  onViolation,
  showViolationToast,
  enableHighlighter,
  runnerRef,
}: ExamSkillRunnerProps) {
  const resolvedCopy = copy ?? defaultCopyEn;
  const { phase, requestFullscreen } = useExamFullscreen(!!fullscreen, () =>
    onViolation?.({ type: "exit-fullscreen" }),
  );
  // Pause audio/video while the student is out of fullscreen (resume-gate up); resume from the
  // same position once they re-enter fullscreen (phase back to "ready"). Refcounted with the
  // page's tab gate so the two obscure sources don't fight over playback (design D2/GC3).
  useObscureMedia(phase === "resume-gate", "fullscreen");
  // Anti-leak gate: only hand the engine its own guard (leave-tab/blur/copy) when the
  // anti-cheat policy is actually on, so a fullscreen-only center does not also activate the
  // engine's violation reporting. The wrapper reports exit-fullscreen itself, independently.
  const engineOnViolation = policyOverrides?.antiCheat ? onViolation : undefined;

  const runner = examMode ? (
    <SkillRunner
      ref={runnerRef}
      skill={skill}
      mode="exam"
      questions={questions}
      copy={resolvedCopy}
      fillHeight
      enableHighlighter={enableHighlighter ?? true}
      timeLimitSeconds={timeLimitSeconds}
      draftKey={draftKey}
      policyOverrides={policyOverrides}
      speakingTiming={speakingTiming}
      speakingIntros={speakingIntros}
      examinerImageUrl={examinerImageUrl}
      onUploadAudio={onUploadAudio}
      onSubmit={onSubmit}
      onViolation={engineOnViolation}
      showViolationToast={showViolationToast}
      onExit={onExit}
    />
  ) : (
    // Practice: engine defaults enableHighlighter=true, so disable it explicitly here — the
    // highlighter/notepad chrome must not leak into Speaking/Writing (and Listening) practice.
    <SkillRunner
      ref={runnerRef}
      skill={skill}
      mode="practice"
      questions={questions}
      copy={resolvedCopy}
      fillHeight
      enableHighlighter={enableHighlighter ?? false}
      timeLimitSeconds={timeLimitSeconds}
      draftKey={draftKey}
      policyOverrides={policyOverrides}
      speakingTiming={speakingTiming}
      speakingIntros={speakingIntros}
      examinerImageUrl={examinerImageUrl}
      onUploadAudio={onUploadAudio}
      onSubmit={onSubmit}
      onViolation={engineOnViolation}
      showViolationToast={showViolationToast}
      onExit={onExit}
    />
  );

  // D2: start-gate must not mount the runner at all — otherwise the exam-mode timer would
  // start before the student has actually entered fullscreen.
  if (phase === "start-gate") {
    return <FullscreenGate mode="start" onEnter={requestFullscreen} />;
  }

  // Item 1: while the resume-gate overlay is up (student exited fullscreen mid-exam), hide the
  // underlying content instead of leaving it visible under the scrim. The runner MUST keep a
  // stable tree position across ready⇄resume-gate so React never unmounts it — otherwise the
  // engine's interval-based countdown is torn down (timer freezes, then rewinds to the last
  // persisted draft on re-entry) and in-progress state (e.g. a live MediaRecorder) is lost.
  // So it always lives in the same wrapper div: layout-neutral (`contents`) when visible, and
  // the hiding classes when gated. FullscreenGate renders as a sibling only while gated. The
  // engine timer keeps running throughout — same penalty as a real exam (design item 1).
  const gated = phase === "resume-gate";
  return (
    <>
      <div className={gated ? "pointer-events-none select-none opacity-0 blur-md" : "contents"}>
        {runner}
      </div>
      {gated && <FullscreenGate mode="resume" onEnter={requestFullscreen} />}
    </>
  );
}
