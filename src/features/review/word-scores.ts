import type { WordScore } from "@/features/partner/result-types";

// SpeechSuper reports word timings in centiseconds even though the fields are
// named `_ms` — dividing by 1000 seeks 10× too far into the recording.
export const SEEK_DIVISOR = 100;

// Below this share of tokens located in the transcript the alignment is treated
// as failed: colouring the wrong words is worse than colouring none.
const MIN_ALIGNED_RATIO = 0.6;

// Played back on its own a word runs ~100ms, too bare to judge; a slice of the
// neighbouring speech gives the ear something to place it against.
export const PLAYBACK_PAD_SEC = 0.15;

/** WordRange is one scored word at its character offsets in the transcript. */
export type WordRange = {
  start: number;
  end: number;
  score: number;
  startSec: number;
  endSec: number;
  level?: string;
  /** SpeechSuper reports -1 timings for words it could not align in the audio;
   * those cannot be seeked to, so playback is refused rather than guessed. */
  playable: boolean;
};

// Tints sit at the 100 step, not 50: on the near-white script panel the 50 step
// is indistinguishable from the background (measured L* 97.8 vs 98.2).
export function wordTierClass(score: number): string {
  if (score >= 90) return "bg-emerald-100";
  if (score >= 60) return "bg-amber-100";
  return "bg-rose-200 font-semibold";
}

export function wordTooltip(r: WordRange): string {
  const base = `Phát âm ${r.score}%`;
  return r.level && r.level !== "unknown" ? `${base} · ${r.level}` : base;
}

// Locate each scored word inside `text` by walking a single forward cursor, so
// repeated words map to successive occurrences rather than all to the first.
export function alignWordRanges(text: string, words: WordScore[] | undefined): WordRange[] | null {
  if (!text || !words || words.length === 0) return null;
  const lower = text.toLowerCase();
  const ranges: WordRange[] = [];
  let cursor = 0;
  let considered = 0;
  for (const w of words) {
    const token = w.word?.trim();
    if (!token) continue;
    considered++;
    let at = text.indexOf(token, cursor);
    if (at < 0) at = lower.indexOf(token.toLowerCase(), cursor);
    if (at < 0) continue;
    ranges.push({
      start: at,
      end: at + token.length,
      score: w.score,
      startSec: w.start_ms / SEEK_DIVISOR,
      endSec: w.end_ms / SEEK_DIVISOR,
      level: w.level,
      playable: w.start_ms >= 0 && w.end_ms > w.start_ms,
    });
    cursor = at + token.length;
  }
  if (considered === 0 || ranges.length < considered * MIN_ALIGNED_RATIO) return null;
  return ranges;
}
