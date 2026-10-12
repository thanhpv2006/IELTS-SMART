"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type SkillRunnerHandle, type SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import { useMockAttempt } from "@/features/mock/use-mock-attempt";
import type { MockSkill } from "@/features/mock/types";
import { DeviceCheck } from "@/features/mock/device-check";
import { Intro } from "@/features/mock/intro";
import { settleVoiceSample } from "@/features/mock/voice-sample";
import { studentMediaApi } from "@/features/student/api";
import { ExamSkillRunner } from "@/features/take/exam-skill-runner";
import { SPEAKING_INTROS, EXAMINER_IMAGE_URL } from "@/features/take/speaking-intros";
import { useAntiCheatGuard } from "@/features/take/use-anti-cheat-guard";
import { useExitFullscreenAfterExam } from "@/features/take/use-exam-fullscreen";
import { useObscureMedia } from "@/features/take/exam-media-guard";
import { AntiCheatWarningModal } from "@/features/take/anti-cheat-warning-modal";
import { ExamEndedOverlay } from "@/features/take/exam-ended-overlay";
import { SKILL_TIME_LIMITS } from "@/features/take/exam-timing";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";

export default function TakeMockPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const router = useRouter();
  const {
    attempt,
    currentSkill,
    questionsForSkill,
    submitSkill,
    forfeitRemaining,
    allDone,
    isFresh,
    isLoading,
    error,
  } = useMockAttempt(assignmentId);

  // GC6: device check + intro only for a brand-new attempt; a resumed attempt (some skill
  // already started/done) skips straight to the exam — D6 also drops the Speaking-only MicTest,
  // since DeviceCheck now covers the mic for the whole attempt.
  const [phase, setPhase] = useState<"device" | "intro" | "exam">("device");
  useEffect(() => {
    if (!isFresh) setPhase("exam");
  }, [isFresh]);

  // Item 2 (2-strike terminate, GC9): mock is always a full exam-mode attempt, so anti-cheat
  // reporting/strikes are always on (unlike take/[id] which gates on per-center rules).
  const runnerRef = useRef<SkillRunnerHandle>(null);
  const [terminated, setTerminated] = useState(false);
  const guard = useAntiCheatGuard(assignmentId, true, {
    onTerminate: async () => {
      setTerminated(true);
      // D1: force-submit the current skill's answers so far, then forfeit (empty submit) every
      // still-not_started skill; the backend completes an empty scored/objective skill at band 0
      // synchronously (GC4), driving the attempt to `completed`.
      // AWAIT the current-skill submit BEFORE forfeiting: both write the whole attempt aggregate,
      // so running them concurrently races (a forfeit save could revert the current skill to
      // not_started). The engine swallows onSubmit errors internally, so this resolves regardless;
      // by then the current-skill POST + its refetch have settled. Then forfeit ALL remaining
      // not_started skills — if the current-skill submit succeeded it's now `scoring`/`completed`
      // (and the backend's not_started guard makes any redundant empty submit a safe no-op); if it
      // FAILED it's still not_started and gets a band-0 forfeit — so the test is locked either way.
      try {
        await runnerRef.current?.submit();
      } catch {
        // swallow — terminate must still lock the test even if the current-skill save failed
      }
      await forfeitRemaining();
    },
  });
  // Pause audio while the student is on another tab (strike-1 gate up); resume from the same
  // position when they acknowledge. Refcounted with the fullscreen source (design D2/GC3).
  useObscureMedia(guard.tabGateOpen, "tab");
  useExitFullscreenAfterExam(allDone || terminated);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const voiceSampleRef = useRef<Promise<string> | null>(null);

  const handleUploadAudio = async (blob: Blob, _questionId: string): Promise<string> => {
    const { upload_url, key } = await studentMediaApi.presignUpload("audio/webm");
    const res = await fetch(upload_url, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } });
    if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
    return key;
  };

  const handleSubmit = async (skill: MockSkill, payload: SubmitPayload) => {
    setSubmitError(null);
    try {
      if (skill === "speaking") {
        const voiceSample = await settleVoiceSample(voiceSampleRef.current, 5000);
        await submitSkill(skill, payload, { voiceSample });
      } else {
        await submitSkill(skill, payload);
      }
    } catch (e) {
      // Set the banner, then re-throw so the engine's `await onSubmit()` rejects and its own
      // catch resets `submitting=false` (design item 6 FE fix) — otherwise the engine believes
      // the submit is still in-flight and the form stays stuck on "Đang nộp…" forever. The
      // engine invokes this handler via `void onSubmit(...)`, so the rejection is caught inside
      // the engine's own try/catch, not left as an unhandled rejection.
      // Note: reloading the page calls start-mock again (idempotent, keeping the skills already submitted), but
      // UNSUBMITTED answers of the current skill are lost — acceptable for exam mode.
      setSubmitError(errorMessage(e));
      throw e;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-500">Đang tải bài thi…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-error-700">Không tải được bài thi: {errorMessage(error)}</p>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-error-700">Không tìm thấy bài thi.</p>
      </div>
    );
  }

  // Item 2 (2-strike terminate): checked BEFORE allDone — forfeitRemaining's refetch flips
  // allDone true right after termination, and without this guard the normal "Đã nộp bài" done
  // screen would replace the violation overlay on the next render.
  if (terminated) {
    return <ExamEndedOverlay onLeave={() => router.push("/student/assignments")} />;
  }

  if (allDone) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-bold text-ink-900">Đã nộp bài — chờ giáo viên duyệt</p>
          <p className="mt-2 text-sm text-ink-500">
            Bạn đã hoàn thành đủ 4 kỹ năng. Kết quả sẽ hiển thị sau khi giáo viên xem lại và công bố band
            điểm.
          </p>
          <Button className="mt-6" onClick={() => router.push("/student/assignments")}>
            Về danh sách bài tập
          </Button>
        </div>
      </div>
    );
  }

  // allDone === false ⇒ SKILL_ORDER always still holds at least one "not_started" skill ⇒ currentSkill is always
  // defined here; this guard only exists to satisfy TS.
  if (!currentSkill) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-500">Đang tải bài thi…</p>
      </div>
    );
  }

  // M1/GC6: gate the device/intro screens on `isFresh` too, not just the phase state. The
  // resume effect sets phase="exam" for a resumed attempt, but if the catalog set is already in
  // the React Query cache the first non-loading render still has phase="device" for one paint
  // before the effect runs — the `isFresh` guard prevents that device/intro flash on resume.
  if (isFresh && phase === "device") {
    return (
      <DeviceCheck
        onContinue={(blob) => {
          if (blob) {
            const upload = handleUploadAudio(blob, "voice-sample");
            upload.catch(() => {});
            voiceSampleRef.current = upload;
          }
          setPhase("intro");
        }}
      />
    );
  }

  if (isFresh && phase === "intro") {
    return <Intro onEnter={() => setPhase("exam")} />;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Scroll safety net — as in take/[id]/page.tsx: SkillRunner ships `overflow-hidden`, so being a direct flex
          child of a fixed-height column would clip it on a short viewport. */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto${
          guard.tabGateOpen ? " pointer-events-none select-none opacity-0 blur-md" : ""
        }`}
      >
        <ExamSkillRunner
          // Remount a fresh runner per skill. The mock flow swaps skill/questions on ONE mounted
          // instance as currentSkill advances (reading → listening → …); without a key React reuses
          // the instance and the engine's stale `submitting=true` from the previous skill's submit
          // carries over, locking the next skill's form with "Submitting…". A per-skill key isolates
          // each exam run's internal state.
          key={currentSkill}
          skill={currentSkill}
          // Mock is a full exam: every skill runs in exam mode (timer + palette + highlighter).
          // Do NOT branch to practice per skill — that would drop the Writing/Listening timers.
          // (Listening's per-part rendering caveat is a pre-existing data-shape issue, tracked
          // separately; this change does not alter mock listening behaviour.)
          examMode
          // GC9/C1: mock is always exam-mode anti-cheat. The wrapper only forwards engine
          // violations (leave-tab/blur/copy/paste) to `onViolation` when `policyOverrides.antiCheat`
          // is set — without this the engine detects leave-tab but the strike counter never sees it,
          // making the 2-strike terminate inert. exam-mode default policy is already antiCheat:true,
          // so this only flips the wrapper's reporting gate on (no behavior change to the engine).
          policyOverrides={{ antiCheat: true, speakingPartIntro: true }}
          fullscreen={!!attempt?.fullscreen}
          runnerRef={runnerRef}
          onViolation={guard.report}
          questions={questionsForSkill(currentSkill)}
          timeLimitSeconds={SKILL_TIME_LIMITS[currentSkill]}
          // Speaking: allow up to 120s recording per question on every part (engine default
          // caps Part 1 at 45s / Part 3 at 60s); the section timer still bounds the total.
          speakingTiming={{ answerMaxSeconds: { 1: 120, 2: 120, 3: 120 } }}
          speakingIntros={SPEAKING_INTROS}
          examinerImageUrl={EXAMINER_IMAGE_URL}
          // Persist answers/time/audio to localStorage so a reload before submit keeps the
          // in-progress skill (engine 2.2 built-in draft; keyed per attempt + skill).
          draftKey={`${attempt.attempt_id}:${currentSkill}`}
          onUploadAudio={handleUploadAudio}
          onSubmit={(payload) => handleSubmit(currentSkill, payload)}
          onExit={() => {
            if (window.confirm("Thoát bài thi? Phần chưa nộp của kỹ năng hiện tại sẽ không được lưu.")) {
              router.push("/student/assignments");
            }
          }}
        />
      </div>
      {guard.tabGateOpen && <AntiCheatWarningModal onContinue={guard.acknowledgeTab} />}
      {submitError && (
        <div className="m-4 shrink-0 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
          <p>Nộp bài lỗi, vui lòng tải lại trang: {submitError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 font-medium underline underline-offset-2 hover:text-error-700"
          >
            Tải lại trang để thử lại
          </button>
        </div>
      )}
    </div>
  );
}
