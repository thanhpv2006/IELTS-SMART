/**
 * Unit tests for the pure Speaking alignment helpers in ./grading-shared.tsx.
 * Regression guard: error blocks must land on the answer they actually belong
 * to, matched by the spoken transcript — not by raw position (the LLM emits a
 * block only per answer that HAS errors, and leaves `question` null).
 */
import { describe, it, expect } from "vitest";
import { buildBlockMap, resolveTranscripts } from "./grading-shared";
import type { AnswerItem } from "@/features/partner/api";
import type { SpeakingResult } from "@/features/partner/result-types";

// 10-question speaking submission; errors only on seq 5,6,7,8 (out of order).
// Mirrors real dev data (submission c9319863…): blocks carry no `question`,
// and their `original_answer` equals the transcript for their true sequence.
const answers: AnswerItem[] = Array.from({ length: 10 }, (_, i) => ({
  sequence: i + 1,
  audio_url: `audio/seq-${i + 1}.webm`,
}));

const result: SpeakingResult = {
  _transcripts: [
    { sequence: 1, transcript: "I work as a software engineer." },
    { sequence: 2, transcript: "I like my job." },
    { sequence: 3, transcript: "I enjoy being a student." },
    { sequence: 4, transcript: "I enjoy watching movies." },
    { sequence: 5, transcript: "I don't like any TV songs." },
    { sequence: 6, transcript: "I started learning English for about ten years." },
    { sequence: 7, transcript: "Speaking." },
    { sequence: 8, transcript: "I don't know." },
    { sequence: 9, transcript: "I don't know." },
    { sequence: 10, transcript: "I don't know." },
  ],
  errors: [
    { original_answer: "I started learning English for about ten years.", errors: [{ error_part: "for about ten years" }] }, // seq 6
    { original_answer: "I don't like any TV songs.", errors: [{ error_part: "TV songs" }] }, // seq 5
    { original_answer: "Speaking.", errors: [{ error_part: "Speaking" }] }, // seq 7
    { original_answer: "I don't know.", errors: [{ error_part: "know" }] }, // seq 8 (first of the duplicates)
  ],
};

describe("buildBlockMap — align error blocks to their spoken answer", () => {
  const { byBi, bySeq } = buildBlockMap(result, answers);

  it("maps each block to the sequence whose transcript equals its original_answer", () => {
    expect(byBi.get(0)?.sequence).toBe(6);
    expect(byBi.get(1)?.sequence).toBe(5);
    expect(byBi.get(2)?.sequence).toBe(7);
  });

  it("does not misattribute errors onto the leading questions (seq 1-4)", () => {
    for (const seq of [1, 2, 3, 4]) expect(bySeq.has(seq)).toBe(false);
  });

  it("resolves duplicate transcripts to distinct sequences (first unused)", () => {
    expect(byBi.get(3)?.sequence).toBe(8);
    // No two blocks collide on the same sequence.
    const seqs = [0, 1, 2, 3].map((bi) => byBi.get(bi)?.sequence);
    expect(new Set(seqs).size).toBe(4);
  });
});

// v1: the scorer now echoes the answer's `sequence` on each error block, so the
// map should trust it directly — even when the block's text can't be matched.
describe("buildBlockMap — sequence is authoritative when present (v1)", () => {
  const seqResult: SpeakingResult = {
    _transcripts: answers.map((a) => ({ sequence: a.sequence, transcript: `transcript ${a.sequence}` })),
    errors: [
      { sequence: 6, original_answer: "totally unrelated wording", errors: [{ error_part: "x" }] },
      { sequence: 5, original_answer: "", errors: [{ error_part: "y" }] },
    ],
  };
  const { byBi } = buildBlockMap(seqResult, answers);

  it("maps by echoed sequence, ignoring mismatched or empty original_answer text", () => {
    expect(byBi.get(0)?.sequence).toBe(6);
    expect(byBi.get(1)?.sequence).toBe(5);
  });
});

// Legacy results (scored before v1) have no `sequence`; the LLM's original_answer
// is often a single utterance excerpted from the fuller transcript, so exact
// text equality misses — the substring fallback must still land it correctly.
describe("buildBlockMap — substring fallback for legacy blocks without sequence", () => {
  const legacy: SpeakingResult = {
    _transcripts: [
      { sequence: 1, transcript: "Yes, there are several tall buildings near my home." },
      { sequence: 2, transcript: "Well, I enjoy being a student and I study very hard every day." },
    ],
    errors: [
      { original_answer: "I enjoy being a student", errors: [{ error_part: "student" }] }, // excerpt of seq 2
    ],
  };
  const twoAnswers: AnswerItem[] = [
    { sequence: 1, audio_url: "a1" },
    { sequence: 2, audio_url: "a2" },
  ];
  const { byBi, bySeq } = buildBlockMap(legacy, twoAnswers);

  it("attaches the block to the transcript that CONTAINS its original_answer", () => {
    expect(byBi.get(0)?.sequence).toBe(2);
  });

  it("does not misattribute onto the leading question (seq 1)", () => {
    expect(bySeq.has(1)).toBe(false);
  });
});

// I-1 guard: substring matching is one-directional (transcript CONTAINS the
// excerpt). A long original_answer that merely mentions a short transcript's
// wording (e.g. "Speaking") must NOT be swallowed onto that short answer.
describe("buildBlockMap — substring never lets a long answer swallow a short transcript", () => {
  const legacy: SpeakingResult = {
    _transcripts: [
      { sequence: 1, transcript: "Speaking" },
      { sequence: 2, transcript: "I really enjoy speaking about my hometown." },
    ],
    errors: [
      // Excerpt of seq 2 (no trailing period → not an exact match); it contains
      // the word "speaking", which pre-fix reverse-inclusion mis-mapped to seq 1.
      { original_answer: "I really enjoy speaking about my hometown", errors: [{ error_part: "hometown" }] },
    ],
  };
  const twoAnswers: AnswerItem[] = [
    { sequence: 1, audio_url: "a1" },
    { sequence: 2, audio_url: "a2" },
  ];
  const { byBi, bySeq } = buildBlockMap(legacy, twoAnswers);

  it("maps to the containing transcript (seq 2), not the short one (seq 1)", () => {
    expect(byBi.get(0)?.sequence).toBe(2);
    expect(bySeq.has(1)).toBe(false);
  });
});

// Era A (no _transcripts at all): the only fallback is question/part/position.
// A block's part_label must keep it inside its own part instead of falling onto
// the first leading answer.
describe("buildBlockMap — part constrains the positional fallback (no transcripts)", () => {
  const eraA: SpeakingResult = {
    errors: [
      // No sequence, no question, only a Part 2 label → must land on the Part 2 answer.
      { part_label: "Part 2", original_answer: "erm", errors: [{ error_part: "erm" }] },
    ],
  };
  const parted: AnswerItem[] = [
    { sequence: 1, part: 1, question_prompt: "P1 Q1", audio_url: "a1" },
    { sequence: 2, part: 1, question_prompt: "P1 Q2", audio_url: "a2" },
    { sequence: 3, part: 2, question_prompt: "P2 Q1", audio_url: "a3" },
  ];
  const { byBi } = buildBlockMap(eraA, parted);

  it("places the Part 2 block on the Part 2 answer, not seq 1", () => {
    expect(byBi.get(0)?.sequence).toBe(3);
  });
});

// Fix: the displayed SCRIPT is always the sequence-matched transcript — a block
// that can't be text-matched must never replace another question's transcript.
describe("resolveTranscripts — script comes from _transcripts by sequence", () => {
  const result: SpeakingResult = {
    _transcripts: [
      { sequence: 1, transcript: "Yes, there are several tall buildings." },
      { sequence: 2, transcript: "I prefer quiet places to relax." },
    ],
    // Legacy block (no sequence) whose text belongs to seq 2.
    errors: [{ original_answer: "I prefer quiet places to relax.", errors: [{ error_part: "quiet places" }] }],
  };
  const answers: AnswerItem[] = [
    { sequence: 1, question_prompt: "Are there tall buildings near your home?", audio_url: "a1" },
    { sequence: 2, question_prompt: "Do you prefer quiet or noisy places?", audio_url: "a2" },
  ];
  const scripts = resolveTranscripts(result, answers);

  it("keeps each answer's own transcript (block text never leaks onto seq 1)", () => {
    expect(scripts[0].script).toBe("Yes, there are several tall buildings.");
    expect(scripts[1].script).toBe("I prefer quiet places to relax.");
  });
});

describe("resolveTranscripts — words gating", () => {
  const words = [{ word: "Yes,", score: 91, start_ms: 0, end_ms: 20 }];
  const answers: AnswerItem[] = [
    { sequence: 1, audio_url: "a1" },
    { sequence: 2, audio_url: "a2" },
    { sequence: 3, audio_url: "a3" },
  ];
  const scripts = resolveTranscripts(
    {
      _transcripts: [
        { sequence: 1, transcript: "Yes, definitely.", words },
        { sequence: 2, words },
      ],
      errors: [{ sequence: 2, original_answer: "A block answer.", errors: [] }],
    },
    answers,
  );

  it("carries words when the script is the SpeechSuper transcript", () => {
    expect(scripts[0].script).toBe("Yes, definitely.");
    expect(scripts[0].words).toEqual(words);
  });

  it("drops words when the script falls back to another source", () => {
    expect(scripts[1].script).toBe("A block answer.");
    expect(scripts[1].words).toBeUndefined();
  });

  it("has no words when the answer has no matching transcript", () => {
    expect(scripts[2].words).toBeUndefined();
  });
});
