"use client";

import { use, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type Skill,
  type SkillRunnerHandle,
  type SubmitPayload,
} from "@novaforge-team/ielts-exam-engine";
import {
  studentAssignmentApi,
  studentMediaApi,
  studentTestApi,
} from "@/features/student/api";
import {
  facadeRLToQuestions,
  rlSubmitToGrade,
  swQuestionsToCatalog,
  swSubmitToDTO,
} from "@/features/take/mapping";
import { MicTest } from "@/features/take/mic-test";
import { ExamSkillRunner } from "@/features/take/exam-skill-runner";
import { resolveAssignedTimeLimitSeconds } from "@/features/take/exam-timing";
import { SPEAKING_INTROS, EXAMINER_IMAGE_URL } from "@/features/take/speaking-intros";
import { resolveTakePolicy, type TakeSkill } from "@/features/take/take-policy";
import { useAntiCheatGuard } from "@/features/take/use-anti-cheat-guard";
import { useExitFullscreenAfterExam } from "@/features/take/use-exam-fullscreen";
import { useObscureMedia } from "@/features/take/exam-media-guard";
import { AntiCheatWarningModal } from "@/features/take/anti-cheat-warning-modal";
import { ExamEndedOverlay } from "@/features/take/exam-ended-overlay";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";

export default function TakeAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const timedSeconds = Number(searchParams.get("timed")) || undefined;

  const { data: assignment, isLoading: loadingAssignment } = useQuery({
    queryKey: ["student-assignment", id],
    queryFn: () => studentAssignmentApi.get(id),
  });
  const { data: test, isLoading: loadingTest } = useQuery({
    queryKey: ["student-test", assignment?.test_id],
    queryFn: () => studentTestApi.get(assignment!.test_id),
    enabled: !!assignment?.test_id,
  });

  const [stage, setStage] = useState<"mic-test" | "exam">("mic-test");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSpeaking = test?.skill === "speaking";
  const isObjective = test?.skill === "reading" || test?.skill === "listening";

  // A Speaking paper covering more than one part is a whole test, not a one-part drill: it opens
  // each part with the examiner's lead-in, which is also what marks the Part 1 -> Part 2 boundary
  // (and keeps Part 2's cue card face-down until the clip reaches its reveal mark).
  const speakingSpansParts = new Set((test?.questions ?? []).map((q) => q.part)).size > 1;

  const isSelfPractice = assignment?.origin === "self_practice";
  // Per-center exam rules (time limit + fullscreen) only apply to assigned attempts — a
  // self-practice attempt sets rules to undefined so it never inherits the center's lockdown.
  const rules = isSelfPractice ? undefined : assignment?.exam_rules;
  const timeLimitSeconds = isSelfPractice
    ? isObjective
      ? timedSeconds
      : undefined
    : resolveAssignedTimeLimitSeconds({
        skill: test?.skill,
        assignmentMinutes: assignment?.time_limit_minutes,
      });
  const backHref = isSelfPractice ? "/student/practice" : "/student/assignments";

  const takePolicy = resolveTakePolicy({
    skill: test?.skill as TakeSkill | undefined,
    antiCheatRule: !!assignment?.exam_rules?.anti_cheat,
    fullscreenRule: !!rules?.fullscreen,
    timeLimitSeconds,
    speakingSpansParts,
  });

  const runnerRef = useRef<SkillRunnerHandle>(null);
  const [terminated, setTerminated] = useState(false);
  const terminatedRef = useRef(false);
  const guard = useAntiCheatGuard(id, takePolicy.reporterEnabled, {
    onTerminate: () => {
      terminatedRef.current = true;
      setTerminated(true);
      // Best-effort: force-submit the current (only) skill so the answers so far are saved.
      runnerRef.current?.submit();
    },
  });
  // Pause audio while the student is on another tab (strike-1 gate up); resume from the same
  // position when they acknowledge. Refcounted with the fullscreen source (design D2/GC3).
  useObscureMedia(guard.tabGateOpen, "tab");
  useExitFullscreenAfterExam(terminated);

  const submit = useMutation({
    mutationFn: (payload: SubmitPayload) => {
      if (!test) throw new Error("No test");
      return studentAssignmentApi.submit(id, swSubmitToDTO(payload, test));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-assignments"] });
      // Terminated (2-strike): keep the ExamEndedOverlay up instead of navigating to the list.
      if (!terminatedRef.current) router.push(backHref);
    },
    onError: (e) => setSubmitError(errorMessage(e)),
  });

  // Reading/Listening: graded synchronously and auto-released by the backend, so we route straight
  // to the result detail page (right/wrong plus the correct answer per question). Fallback to the assignments
  // list on the off chance a result id is missing.
  const objectiveSubmit = useMutation({
    mutationFn: (payload: SubmitPayload) =>
      studentAssignmentApi.submitObjective(id, { answers: rlSubmitToGrade(payload).answers }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["student-assignments"] });
      // Terminated (2-strike): keep the ExamEndedOverlay up instead of navigating away.
      if (!terminatedRef.current) {
        const resultHref = isSelfPractice
          ? `/student/results/${res.result_id}?from=practice`
          : `/student/results/${res.result_id}`;
        router.push(res.result_id ? resultHref : backHref);
      }
    },
    onError: (e) => setSubmitError(errorMessage(e)),
  });

  const handleUploadAudio = async (blob: Blob, _questionId: string): Promise<string> => {
    const { upload_url, key } = await studentMediaApi.presignUpload("audio/webm");
    const res = await fetch(upload_url, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } });
    if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
    return key;
  };

  const handleSubmit = async (payload: SubmitPayload) => {
    setSubmitError(null);
    try {
      await (isObjective ? objectiveSubmit : submit).mutateAsync(payload);
    } catch (e) {
      // The error already surfaced through onError → submitError (the banner). Rethrow so the engine runs its own
      // catch branch (setSubmitting(false)) instead of being stuck on "Đang nộp…" forever. The engine calls it via `void onSubmit`,
      // so the engine catches the rejection itself and it never becomes an unhandled rejection.
      throw e;
    }
  };

  if (loadingAssignment || loadingTest) return <p className="text-sm text-ink-500">Đang tải bài thi...</p>;
  if (!assignment || !test) return <p className="text-sm text-error-700">Không tìm thấy bài thi.</p>;

  // Block a retake: once submitted / being scored / already scored (status != pending), no retake.
  if (assignment.status !== "pending") {
    return (
      <div data-testid="take-blocked" className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-ink-700">Bài này đã nộp — không thể làm lại.</p>
        <Button className="mt-4" onClick={() => router.push(backHref)}>
          Về danh sách bài tập
        </Button>
      </div>
    );
  }
  if (test.questions.length === 0) {
    return <p className="text-sm text-error-700">Bài thi này chưa có câu hỏi. Vui lòng liên hệ giáo viên của bạn.</p>;
  }

  // Item 2 (2-strike terminate): wins over the mic-test gate and the exam render below — once
  // terminated, the student only sees the "kết thúc do vi phạm" screen.
  if (terminated) {
    return <ExamEndedOverlay onLeave={() => router.push(backHref)} />;
  }

  // ── Mic test gate (speaking only) ────────────────────────────────────────
  if (isSpeaking && stage === "mic-test") {
    return <MicTest testName={test.name} count={test.questions.length} onReady={() => setStage("exam")} />;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Scroll safety-net: SkillRunner ships `overflow-hidden`, so as a direct flex child of this
          fixed-height column its flex min-height collapses to 0 and it clips any body taller than the
          viewport. Reading/Listening scroll their questions internally (max-h panes), but this
          `min-h-0 flex-1 overflow-y-auto` region guarantees the card still scrolls on short viewports
          and for speaking/writing (which have no internal scroll) instead of being clipped. */}
      <div
        className={`rl-take min-h-0 flex-1 overflow-y-auto${
          guard.tabGateOpen ? " pointer-events-none select-none opacity-0 blur-md" : ""
        }`}
      >
        <ExamSkillRunner
          skill={test.skill as Skill}
          // Reading/Listening always use the practice renderer; exam behaviour comes from
          // policyOverrides below rather than the engine's built-in exam mode.
          examMode={false}
          fullscreen={!!rules?.fullscreen}
          questions={isObjective ? facadeRLToQuestions(test) : swQuestionsToCatalog(test)}
          timeLimitSeconds={timeLimitSeconds}
          // Persist answers/time/audio to localStorage so a reload BEFORE submit does not lose the
          // in-progress skill (engine 2.2 built-in draft; keyed per assignment + skill).
          draftKey={`${id}:${test.skill}`}
          policyOverrides={takePolicy.policyOverrides}
          runnerRef={runnerRef}
          onViolation={takePolicy.reporterEnabled ? guard.report : undefined}
          enableHighlighter={test.skill === "reading"}
          // answerMaxSeconds: allow up to 120s recording per question on every part (engine
          // default caps Part 1 at 45s / Part 3 at 60s).
          speakingTiming={{ gapSeconds: 1, answerMaxSeconds: { 1: 120, 2: 120, 3: 120 } }}
          speakingIntros={SPEAKING_INTROS}
          examinerImageUrl={EXAMINER_IMAGE_URL}
          onUploadAudio={handleUploadAudio}
          onSubmit={handleSubmit}
          onExit={() => {
            if (window.confirm("Thoát bài kiểm tra? Bài làm chưa nộp sẽ không được lưu.")) {
              router.push(backHref);
            }
          }}
        />
      </div>
      {guard.tabGateOpen && <AntiCheatWarningModal onContinue={guard.acknowledgeTab} />}
      {submitError && (
        <div data-testid="submit-error" className="shrink-0 m-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
          <p>Nộp bài thất bại: {submitError}</p>
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
