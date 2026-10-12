import { describe, it, expect } from "vitest";
import { alignWordRanges, wordTierClass, wordTooltip } from "./word-scores";
import type { WordScore } from "@/features/partner/result-types";

function tokens(text: string, score = 100): WordScore[] {
  return text.split(" ").map((word, i) => ({
    word,
    score,
    start_ms: i * 10,
    end_ms: i * 10 + 8,
  }));
}

describe("alignWordRanges", () => {
  // SpeechSuper tokens carry their trailing punctuation, so joining them by a
  // single space reproduces the transcript exactly (verified against dev data).
  const real = "I'm working as a software engineer now. My job is sometimes very busy.";

  it("maps every token back onto its own slice of the transcript", () => {
    const words = tokens(real);
    const ranges = alignWordRanges(real, words);
    expect(ranges).not.toBeNull();
    expect(ranges!.length).toBe(words.length);
    ranges!.forEach((r, i) => {
      expect(real.slice(r.start, r.end)).toBe(words[i].word);
    });
  });

  it("maps a repeated word to successive occurrences", () => {
    const text = "I don't know. I don't know.";
    const ranges = alignWordRanges(text, tokens(text));
    expect(ranges).not.toBeNull();
    const iRanges = ranges!.filter((r) => text.slice(r.start, r.end) === "I");
    expect(iRanges.length).toBe(2);
    expect(iRanges[1].start).toBeGreaterThan(iRanges[0].start);
  });

  it("converts centisecond timings to seconds", () => {
    const ranges = alignWordRanges("hello", [{ word: "hello", score: 80, start_ms: 105, end_ms: 143 }]);
    expect(ranges![0].startSec).toBeCloseTo(1.05);
    expect(ranges![0].endSec).toBeCloseTo(1.43);
  });

  it("returns null when there are no words", () => {
    expect(alignWordRanges("hello", undefined)).toBeNull();
    expect(alignWordRanges("hello", [])).toBeNull();
    expect(alignWordRanges("", tokens("hello"))).toBeNull();
  });

  it("returns null when most tokens are absent from the transcript", () => {
    const ranges = alignWordRanges("I like coffee", tokens("alpha bravo charlie delta coffee"));
    expect(ranges).toBeNull();
  });

  // SpeechSuper emits -1 timings for words it failed to align in the audio.
  it("marks words without usable timings as unplayable", () => {
    const ranges = alignWordRanges("take some coffee", [
      { word: "take", score: 89, start_ms: -1, end_ms: -1 },
      { word: "some", score: 40, start_ms: 10, end_ms: 10 },
      { word: "coffee", score: 70, start_ms: 20, end_ms: 45 },
    ]);
    expect(ranges!.map((r) => r.playable)).toEqual([false, false, true]);
    expect(ranges!.map((r) => r.score)).toEqual([89, 40, 70]);
  });
});

describe("wordTierClass / wordTooltip", () => {
  it("splits into three tiers at 90 and 60", () => {
    expect(wordTierClass(90)).toContain("emerald");
    expect(wordTierClass(89)).toContain("amber");
    expect(wordTierClass(60)).toContain("amber");
    expect(wordTierClass(59)).toContain("rose");
  });

  it("appends the CEFR level only when it is known", () => {
    const base = { start: 0, end: 1, score: 72, startSec: 0, endSec: 1 };
    expect(wordTooltip({ ...base, level: "A2" })).toBe("Phát âm 72% · A2");
    expect(wordTooltip({ ...base, level: "unknown" })).toBe("Phát âm 72%");
    expect(wordTooltip(base)).toBe("Phát âm 72%");
  });
});
