/**
 * Unit tests for the pure `buildRLMetadata` payload builder extracted from
 * RLQuestionEditor's mutationFn. Locks down the listening audio/transcript
 * keys, the reading passage_html_marked / stripped-prompt invariant, and the
 * client-only `_key` + empty-option cleanup applied to every group.
 */
import { describe, it, expect } from "vitest";
import { buildRLMetadata, parseGroupsFromMetadata } from "./rl-question-editor";
import type { RLGroupDraft } from "./types";

describe("buildRLMetadata — listening", () => {
  it("carries audio_url, transcript and groups, with no reading-only key", () => {
    const groups: RLGroupDraft[] = [
      {
        type: "gap_fill",
        _key: "group-1",
        items: [{ number: 1, prompt: "Q1", answer_key: ["cat"] }],
      },
    ];

    const { metadata, prompt } = buildRLMetadata({
      groups,
      skill: "listening",
      audioUrl: "https://cdn.example.com/audio.mp3",
      transcript: "Speaker A: hello.",
      prompt: "<p>Listen to the conversation.</p>",
    });

    expect(Object.keys(metadata).sort()).toEqual(["audio_url", "groups", "transcript"]);
    expect(metadata.audio_url).toBe("https://cdn.example.com/audio.mp3");
    expect(metadata.transcript).toBe("Speaker A: hello.");
    expect(prompt).toBe("<p>Listen to the conversation.</p>");
  });
});

describe("buildRLMetadata — reading", () => {
  it("keeps the original marked prompt in passage_html_marked and strips answer spans from the returned prompt", () => {
    const markedPrompt = '<p>This is <span data-answer-q="1">answer</span> text.</p>';
    const groups: RLGroupDraft[] = [
      { type: "tfng", _key: "group-1", items: [{ number: 1, answer_key: ["TRUE"] }] },
    ];

    const { metadata, prompt } = buildRLMetadata({
      groups,
      skill: "reading",
      audioUrl: undefined,
      transcript: "",
      prompt: markedPrompt,
    });

    expect(metadata.passage_html_marked).toBe(markedPrompt);
    expect(prompt).toBe("<p>This is answer text.</p>");
    expect(prompt).not.toContain("data-answer-q");
  });
});

describe("buildRLMetadata — group cleanup", () => {
  it("strips the client-only _key field from every group", () => {
    const groups: RLGroupDraft[] = [
      { type: "gap_fill", _key: "k1", items: [{ number: 1, answer_key: ["a"] }] },
      { type: "gap_fill", _key: "k2", items: [{ number: 2, answer_key: ["b"] }] },
    ];

    const { metadata } = buildRLMetadata({
      groups,
      skill: "reading",
      audioUrl: undefined,
      transcript: "",
      prompt: "<p>passage</p>",
    });

    const cleanGroups = metadata.groups as Record<string, unknown>[];
    expect(cleanGroups).toHaveLength(2);
    for (const g of cleanGroups) {
      expect(g).not.toHaveProperty("_key");
    }
  });

  it("drops empty per-item options and group shared_options", () => {
    const groups: RLGroupDraft[] = [
      {
        type: "mcq_multi",
        _key: "group-1",
        shared_options: ["  ", ""],
        items: [{ number: 1, answer_key: ["A"], options: ["  ", ""] }],
      },
    ];

    const { metadata } = buildRLMetadata({
      groups,
      skill: "reading",
      audioUrl: undefined,
      transcript: "",
      prompt: "<p>passage</p>",
    });

    const cleanGroups = metadata.groups as { shared_options?: string[]; items: { options?: string[] }[] }[];
    expect(cleanGroups[0].shared_options).toBeUndefined();
    expect(cleanGroups[0].items[0].options).toBeUndefined();
  });
});

describe("parseGroupsFromMetadata → buildRLMetadata", () => {
  it("keeps a Choose-N group's select_count through an edit round trip", () => {
    const groups = parseGroupsFromMetadata({
      groups: [
        {
          type: "mcq_multi",
          select_count: 2,
          shared_options: ["A. one", "B. two", "C. three"],
          items: [
            { number: 21, prompt: "Which TWO?", answer_key: ["A", "C"] },
            { number: 22, prompt: "Which TWO?", answer_key: ["A", "C"] },
          ],
        },
      ],
    });

    const { metadata } = buildRLMetadata({ groups, skill: "reading", audioUrl: undefined, transcript: "", prompt: "" });

    expect((metadata.groups as Array<Record<string, unknown>>)[0]).toMatchObject({ select_count: 2 });
  });
});
