"use client";

// Orchestration hook for the B2B mock take flow (multi-skill fulltest attempt). Wires
// start-mock (resume-idempotent) + the catalog set's questions + per-skill submit into a
// single "what skill should the student be doing right now" view for the take page.

import { useQuery } from "@tanstack/react-query";
import type { CatalogQuestion, SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import { catalogSetApi } from "@/features/take/api";
import { catalogItemsToQuestions } from "@/features/take/mapping";
import { isApiError } from "@/lib/api/errors";
import { mockApi } from "./api";
import { engineToObjectiveBody, engineToScoredBody } from "./mapping";
import type { MockSkill } from "./types";

// Canonical skill order for the mock flow. `attempt.skills[]` from the backend is NOT
// guaranteed to be in this order, so `currentSkill` must always walk this const, not the
// attempt's own array order. Speaking-first order (design item 5): Speaking → Listening →
// Reading → Writing.
const SKILL_ORDER: MockSkill[] = ["speaking", "listening", "reading", "writing"];

export function useMockAttempt(assignmentId: string) {
  // start-mock is a POST but resume-idempotent server-side (returns the existing in-progress
  // attempt if one exists) — safe to model as the initial load query, refetched after every
  // skill submit so `currentSkill`/`allDone` recompute from fresh skill-state.
  const attemptQuery = useQuery({
    queryKey: ["mock-attempt", assignmentId],
    queryFn: () => mockApi.startMock(assignmentId),
  });

  const attempt = attemptQuery.data;

  const catalogQuery = useQuery({
    queryKey: ["catalog-set", attempt?.set_id],
    queryFn: () => catalogSetApi.get(attempt!.set_id),
    enabled: !!attempt?.set_id,
  });

  const questionsForSkill = (skill: MockSkill): CatalogQuestion[] => {
    const items = catalogQuery.data?.items ?? [];
    return catalogItemsToQuestions(items.filter((item) => item.skill === skill));
  };

  const skillState = (skill: MockSkill) => attempt?.skills.find((s) => s.skill === skill);

  const currentSkill = SKILL_ORDER.find(
    (skill) => (skillState(skill)?.status ?? "not_started") === "not_started"
  );

  const allDone = attempt
    ? SKILL_ORDER.every((skill) => (skillState(skill)?.status ?? "not_started") !== "not_started")
    : false;

  // GC6: device check + intro only show for a brand-new attempt (every skill still
  // `not_started`). Default to `true` while `attempt` has not loaded yet so the phase-machine
  // effect in the page does not prematurely jump to "exam" before we know better.
  const isFresh = attempt
    ? SKILL_ORDER.every((skill) => (skillState(skill)?.status ?? "not_started") === "not_started")
    : true;

  const submitSkill = async (
    skill: MockSkill,
    payload: SubmitPayload,
    opts?: { voiceSample?: string | null },
  ): Promise<void> => {
    if (!attempt) throw new Error("Attempt chưa sẵn sàng");
    if (skill === "reading" || skill === "listening") {
      await mockApi.submitObjectiveSkill(attempt.attempt_id, skill, engineToObjectiveBody(payload).answers);
    } else {
      const responses = engineToScoredBody(payload).responses;
      const voiceSample = skill === "speaking" ? opts?.voiceSample ?? null : null;
      try {
        await mockApi.submitScoredSkill(attempt.attempt_id, skill, responses, voiceSample);
      } catch (e) {
        // Deploy-order safety net: the backend's strict JSON decoder 400s on an unknown
        // `voice_sample` field until the matching backend ships. Retry once without it so a
        // paid B2B submit never gets stuck on this field alone.
        if (voiceSample && isApiError(e) && e.code === "invalid_json") {
          await mockApi.submitScoredSkill(attempt.attempt_id, skill, responses);
        } else {
          throw e;
        }
      }
    }
    // Nothing else observes the ["mock-attempt", assignmentId] query key, so a direct refetch
    // is sufficient (no need to also invalidateQueries first).
    await attemptQuery.refetch();
  };

  // 2-strike terminate (design item 2, D1): forfeit every skill still `not_started` by posting an
  // EMPTY payload. The backend completes an empty scored/objective skill with band/score 0
  // synchronously (GC4), so this naturally drives the attempt to `completed` once every skill has a
  // terminal status — no separate "terminate" endpoint needed. `exceptSkill` skips the current
  // skill when the caller already force-submitted it successfully (avoids a redundant empty submit
  // that the backend's not_started guard would reject anyway); pass `undefined` to forfeit ALL
  // remaining (used when the current-skill force-submit failed, so it also gets a band-0 forfeit).
  const forfeitRemaining = async (exceptSkill?: MockSkill): Promise<void> => {
    if (!attempt) return;
    for (const skill of SKILL_ORDER) {
      if (exceptSkill && skill === exceptSkill) continue;
      if ((skillState(skill)?.status ?? "not_started") !== "not_started") continue;
      // A single skill's submit must NOT abort forfeiting the REST — otherwise a
      // violation-terminate leaves later skills `not_started` and the attempt unlocked
      // (the lock-bypass bug). The trigger this closes: the stale closure re-submitting the
      // already-completed CURRENT objective skill (now a backend no-op; historically a 409
      // that aborted the loop). NOTE: a not_started objective skill missing its answer-key
      // snapshot still 409s and stays not_started — that's a broken-set content bug (it also
      // blocks normal play), out of scope here; the catch only guarantees the OTHER skills
      // still get forfeited.
      try {
        if (skill === "reading" || skill === "listening") {
          await mockApi.submitObjectiveSkill(attempt.attempt_id, skill, []);
        } else {
          await mockApi.submitScoredSkill(attempt.attempt_id, skill, []);
        }
      } catch {
        // keep forfeiting the remaining skills
      }
    }
    await attemptQuery.refetch();
  };

  return {
    attempt,
    currentSkill,
    questionsForSkill,
    submitSkill,
    forfeitRemaining,
    allDone,
    isFresh,
    isLoading: attemptQuery.isLoading || (!!attempt?.set_id && catalogQuery.isLoading),
    error: attemptQuery.error ?? catalogQuery.error ?? null,
  };
}
