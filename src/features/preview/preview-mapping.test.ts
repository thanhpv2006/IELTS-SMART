import { describe, it, expect } from "vitest";
import { groupChooseResults } from "@novaforge-team/ielts-exam-engine";
import {
  isEngineSkill,
  isObjectiveSkill,
  toEngineQuestions,
  toObjectiveResult,
} from "./preview-mapping";
import type { PreviewQuestion } from "./types";

// Shapes taken from the real smoke job 82cc80d4: reading passages 2 and 3 both came back numbered
// 7..26, passage 3 came back with an empty prompt, and questions 1-13 were TRUE/FALSE/NOT GIVEN
// typed as gap_fill. A preview that "fixes" any of those hides the defect it exists to expose.

function draft(
  skill: string,
  part: number,
  prompt: string,
  metadata: Record<string, unknown>,
): PreviewQuestion {
  return { skill, part, prompt, metadata };
}

function group(type: string, numbers: number[], extra: Record<string, unknown> = {}) {
  return {
    type,
    items: numbers.map((n) => ({
      number: n,
      prompt: `Q${n}`,
      answer_key: [`ans-${n}`],
      explanation: `why ${n}`,
    })),
    ...extra,
  };
}

describe("toEngineQuestions", () => {
  it("keeps duplicated question numbers as separate questions instead of merging them", () => {
    const questions = [
      draft("reading", 2, "<h2>P2</h2>", { groups: [group("gap_fill", [7, 8])] }),
      draft("reading", 3, "<h2>P3</h2>", { groups: [group("gap_fill", [7, 8])] }),
    ];

    const { questions: mapped } = toEngineQuestions(questions, "reading");

    expect(mapped).toHaveLength(2);
    expect(mapped[0].metadata.groups?.[0].items?.map((i) => i.number)).toEqual([7, 8]);
    expect(mapped[1].metadata.groups?.[0].items?.map((i) => i.number)).toEqual([7, 8]);
  });

  it("maps a question whose prompt is empty without throwing", () => {
    const { questions } = toEngineQuestions(
      [draft("reading", 3, "", { groups: [group("gap_fill", [27])] })],
      "reading",
    );

    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe("");
  });

  it("preserves a gap_fill group whose answers are TRUE/FALSE rather than retyping it", () => {
    const g = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "statement", answer_key: ["FALSE"] }],
    };

    const { questions } = toEngineQuestions(
      [draft("reading", 1, "<h2>P1</h2>", { groups: [g] })],
      "reading",
    );

    expect(questions[0].metadata.groups?.[0].type).toBe("gap_fill");
  });

  it("keeps a completion group's layout and card title so the preview draws the same frame as the take", () => {
    const g = group("gap_fill", [31], {
      layout: "note",
      card_title: "Microplastics",
      content_html: '<h3>Where microplastics come from</h3><ul><li><span data-blank="31">31</span></li></ul>',
    });

    const { questions } = toEngineQuestions(
      [draft("listening", 4, "", { groups: [g] })],
      "listening",
    );

    expect(questions[0].metadata.groups?.[0].layout).toBe("note");
    expect(questions[0].metadata.groups?.[0].card_title).toBe("Microplastics");
  });

  it("blanks placeholder assets and reports each one", () => {
    const { questions, scrubbed } = toEngineQuestions(
      [
        draft("listening", 1, "L", {
          audio_url: "__AUDIO_URL__",
          groups: [group("diagram_label", [11], { image_url: "__IMG_LISTENING_Q11-16__" })],
        }),
      ],
      "listening",
    );

    expect(questions[0].metadata.audio_url).toBe("");
    expect(questions[0].metadata.groups?.[0].image_url).toBe("");
    expect(scrubbed.join(" ")).toContain("__AUDIO_URL__");
    expect(scrubbed.join(" ")).toContain("__IMG_LISTENING_Q11-16__");
  });

  it("keeps a real asset url untouched", () => {
    const { questions, scrubbed } = toEngineQuestions(
      [draft("listening", 1, "L", { audio_url: "https://cdn/x.mp3", groups: [] })],
      "listening",
    );

    expect(questions[0].metadata.audio_url).toBe("https://cdn/x.mp3");
    expect(scrubbed).toEqual([]);
  });

  it("excludes other skills but still derives ids from the full draft list", () => {
    const questions = [
      draft("speaking", 1, "S", {}),
      draft("reading", 1, "<h2>P1</h2>", { groups: [group("gap_fill", [1])] }),
    ];

    const { questions: mapped } = toEngineQuestions(questions, "reading");

    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe("ai-draft-1");
  });

  it("drops a draft whose skill the engine does not know", () => {
    const { questions } = toEngineQuestions([draft("grammar", 1, "x", {})], "grammar");
    expect(questions).toEqual([]);
  });
});

describe("toObjectiveResult", () => {
  it("builds one all-correct section per question with answers and explanations", () => {
    const { result } = toObjectiveResult(
      [draft("reading", 1, "<h2>P1</h2>", { groups: [group("gap_fill", [1, 2])] })],
      "reading",
    );

    expect(result.kind).toBe("objective");
    expect(result.sections).toHaveLength(1);
    expect(result.raw).toBe(2);
    expect(result.total).toBe(2);
    expect(result.sections[0].items[0]).toMatchObject({
      number: 1,
      correct: true,
      correct_answers: ["ans-1"],
      explanation: "why 1",
    });
  });

  it("carries the accepted variants so the reviewer sees every answer the grader takes", () => {
    const withVariants = group("gap_fill", [1, 2]);
    Object.assign(withVariants.items[0], { accepted_variants: ["color", "colours"] });

    const { result } = toObjectiveResult(
      [draft("reading", 1, "<h2>P1</h2>", { groups: [withVariants] })],
      "reading",
    );

    expect(result.sections[0].items[0].accepted_variants).toEqual(["color", "colours"]);
    expect(result.sections[0].items[1].accepted_variants).toBeUndefined();
  });

  it("prefers the marked passage over the plain prompt so answer highlights survive", () => {
    const { result } = toObjectiveResult(
      [
        draft("reading", 1, "<h2>plain</h2>", {
          passage_html_marked: '<h2>marked</h2><span data-answer-q="1">here</span>',
          groups: [group("gap_fill", [1])],
        }),
      ],
      "reading",
    );

    expect(result.sections[0].passage).toContain("data-answer-q");
  });

  it("falls back to the prompt when the marked passage is present but empty", () => {
    const { result } = toObjectiveResult(
      [
        draft("reading", 1, "<h2>plain</h2>", {
          passage_html_marked: "",
          groups: [group("gap_fill", [1])],
        }),
      ],
      "reading",
    );

    expect(result.sections[0].passage).toBe("<h2>plain</h2>");
  });

  it("falls back to the prompt when the draft has no marked passage", () => {
    const { result } = toObjectiveResult(
      [draft("reading", 1, "<h2>plain</h2>", { groups: [group("gap_fill", [1])] })],
      "reading",
    );

    expect(result.sections[0].passage).toBe("<h2>plain</h2>");
  });

  it("skips a question that carries no items at all", () => {
    const { result } = toObjectiveResult(
      [
        draft("reading", 3, "", { groups: [] }),
        draft("reading", 1, "<h2>P1</h2>", { groups: [group("gap_fill", [1])] }),
      ],
      "reading",
    );

    expect(result.sections).toHaveLength(1);
  });

  it("counts duplicated numbers twice, matching what the engine would show", () => {
    const { result } = toObjectiveResult(
      [
        draft("reading", 2, "<h2>P2</h2>", { groups: [group("gap_fill", [7])] }),
        draft("reading", 3, "<h2>P3</h2>", { groups: [group("gap_fill", [7])] }),
      ],
      "reading",
    );

    expect(result.total).toBe(2);
    expect(result.sections).toHaveLength(2);
  });
});

describe("toObjectiveResult — item type", () => {
  it("tags gap_fill items with their group type, so groupChooseResults keeps them as separate blocks", () => {
    const { result } = toObjectiveResult(
      [
        draft("reading", 1, "<h2>P1</h2>", {
          groups: [
            {
              type: "gap_fill",
              items: [
                { number: 1, prompt: "Q1", answer_key: ["colour", "color"] },
                { number: 2, prompt: "Q2", answer_key: ["colour", "color"] },
              ],
            },
          ],
        }),
      ],
      "reading",
    );

    const items = result.sections[0].items;
    expect(items.map((i) => i.type)).toEqual(["gap_fill", "gap_fill"]);

    const blocks = groupChooseResults(items);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveLength(1);
    expect(blocks[1]).toHaveLength(1);
  });

  it("tags an mcq_multi group's items with type mcq_multi", () => {
    const { result } = toObjectiveResult(
      [draft("reading", 1, "<h2>P1</h2>", { groups: [group("mcq_multi", [1, 2])] })],
      "reading",
    );

    expect(result.sections[0].items.map((i) => i.type)).toEqual(["mcq_multi", "mcq_multi"]);
  });
});

describe("isEngineSkill", () => {
  it("accepts the four IELTS skills and rejects anything else", () => {
    expect(isEngineSkill("reading")).toBe(true);
    expect(isEngineSkill("speaking")).toBe(true);
    expect(isEngineSkill("grammar")).toBe(false);
  });
});

describe("toEngineQuestions — id", () => {
  it("keeps the question id a saved set carries", () => {
    const saved: PreviewQuestion = {
      id: "q-7",
      skill: "reading",
      part: 1,
      prompt: "<p>P</p>",
      metadata: {},
    };
    expect(toEngineQuestions([saved], "reading").questions[0].id).toBe("q-7");
  });

  it("falls back to the source index when there is no id", () => {
    expect(toEngineQuestions([draft("reading", 1, "<p>P</p>", {})], "reading").questions[0].id).toBe(
      "ai-draft-0",
    );
  });
});

describe("isObjectiveSkill", () => {
  it("accepts the two skills that have an answer key", () => {
    expect(isObjectiveSkill("reading")).toBe(true);
    expect(isObjectiveSkill("listening")).toBe(true);
  });

  it("rejects the productive skills and unknown values", () => {
    expect(isObjectiveSkill("speaking")).toBe(false);
    expect(isObjectiveSkill("writing")).toBe(false);
    expect(isObjectiveSkill("gibberish")).toBe(false);
  });
});
