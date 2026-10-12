import { apiFetch } from "@/lib/api/client";
import type { CatalogQuestion } from "@novaforge-team/ielts-exam-engine";

/** A published catalog question-set as returned to students (grouped R/L content, answer keys redacted). */
export type CatalogSetDetail = {
  id: string;
  title: string;
  items: CatalogQuestion[];
};

export type ObjectiveGradeBody = {
  skill: string;
  answers: { number: number; value: string[] }[];
};

export type ObjectiveGradeResult = {
  raw: number;
  total: number;
  band: number;
  items: { number: number; correct: boolean }[];
};

export const catalogSetApi = {
  get: (setId: string) => apiFetch<CatalogSetDetail>(`/catalog/question-sets/${setId}`),
};

export const objectiveGradeApi = {
  grade: (setId: string, body: ObjectiveGradeBody) =>
    apiFetch<ObjectiveGradeResult>(`/catalog/question-sets/${setId}/grade`, {
      method: "POST",
      body,
    }),
};
