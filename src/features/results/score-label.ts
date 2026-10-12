import { isObjectiveResult } from "@/features/take/objective-result-view";

/** Reading/Listening shows the number correct (a band converted from one Part means nothing); the rest show the band. */
export function resultScoreLabel(payload: unknown, band: number | null | undefined): string | null {
  if (isObjectiveResult(payload)) return `${payload.raw}/${payload.total}`;
  return typeof band === "number" ? band.toFixed(1) : null;
}
