// Pure mapping from a preview source — an unsaved AI-import draft or a saved catalog set — to the
// two shapes the preview needs: the engine's CatalogQuestion for the "Xem trước đề" mode, and the
// app's ObjectiveResult for "Xem trước đáp án". No React, no fetch.
//
// Everything here may read UNVALIDATED AI JSON — a draft reaches this file before QC has passed,
// and previewing a broken draft is the whole point — so every traversal is defensive and nothing is
// normalized away. In particular duplicate question numbers are preserved verbatim: the engine
// degrades visibly on them (shared answer inputs, collapsed palette jumps, an inflated total) and
// that degradation is the signal the reviewer is here to see.

import { isRLGroupType } from "@novaforge-team/ielts-exam-engine";
import type {
  CatalogQuestion,
  CompletionLayout,
  QuestionMetadata,
  RLGroup,
  RLGroupType,
  RLItem,
  Skill,
} from "@novaforge-team/ielts-exam-engine";
import type {
  ObjectiveResult,
  ObjectiveResultItem,
  ObjectiveResultSection,
} from "@/features/take/objective-result-view";
import type { PreviewQuestion } from "./types";

const ENGINE_SKILLS: readonly string[] = ["reading", "listening", "speaking", "writing"];

export function isEngineSkill(skill: string): skill is Skill {
  return ENGINE_SKILLS.includes(skill);
}

/** isObjectiveSkill reports whether the skill has an objective answer key to preview. */
export function isObjectiveSkill(skill: string): boolean {
  return skill === "reading" || skill === "listening";
}

// The import pipeline leaves "__AUDIO_URL__" / "__IMG_LISTENING_Q11-16__" in place for assets a
// human still has to upload. Handing those to the browser would render a broken image or a failed
// audio element, which a reviewer reads as an AI defect rather than a missing upload.
const PLACEHOLDER = /^__.+__$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : undefined;
}

type Scrubber = { take(label: string, value: unknown): string | undefined; tokens: string[] };

function newScrubber(): Scrubber {
  const tokens: string[] = [];
  return {
    tokens,
    take(label, value) {
      const s = asString(value);
      if (s === undefined) return undefined;
      if (!PLACEHOLDER.test(s)) return s;
      const entry = `${label}: ${s}`;
      if (!tokens.includes(entry)) tokens.push(entry);
      return "";
    },
  };
}

function toEngineItem(raw: unknown): RLItem | undefined {
  if (!isRecord(raw)) return undefined;
  const number = asNumber(raw.number);
  if (number === undefined) return undefined;
  return {
    number,
    prompt: asString(raw.prompt),
    options: asStringArray(raw.options),
    label: asString(raw.label),
    before: asString(raw.before),
    after: asString(raw.after),
  };
}

function toEngineGroup(raw: unknown, scrub: Scrubber): RLGroup | undefined {
  if (!isRecord(raw)) return undefined;
  const rawType = asString(raw.type);
  if (rawType === undefined) return undefined;
  const items = Array.isArray(raw.items)
    ? raw.items.map(toEngineItem).filter((i): i is RLItem => i !== undefined)
    : undefined;
  return {
    // Kept verbatim even when it is not a known type. QC reports an unknown type as
    // `invalid_metadata`; substituting a valid-looking one here would hide it from the preview.
    type: isRLGroupType(rawType) ? rawType : (rawType as RLGroupType),
    section: asNumber(raw.section),
    title: asString(raw.title),
    layout: asString(raw.layout) as CompletionLayout | undefined,
    card_title: asString(raw.card_title),
    instructions_html: asString(raw.instructions_html),
    content_html: asString(raw.content_html),
    image_url: scrub.take(`group image (${rawType})`, raw.image_url),
    image_caption: asString(raw.image_caption),
    shared_options: asStringArray(raw.shared_options),
    select_count: asNumber(raw.select_count),
    items,
  };
}

function toEngineMetadata(raw: Record<string, unknown>, scrub: Scrubber): QuestionMetadata {
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map((g) => toEngineGroup(g, scrub)).filter((g): g is RLGroup => g !== undefined)
    : undefined;
  return {
    ...raw,
    audio_url: scrub.take("audio_url", raw.audio_url),
    examiner_audio_url: scrub.take("examiner_audio_url", raw.examiner_audio_url),
    examiner_image_url: scrub.take("examiner_image_url", raw.examiner_image_url),
    groups,
  };
}

export type EngineQuestions = { questions: CatalogQuestion[]; scrubbed: string[] };

/**
 * toEngineQuestions builds the engine's question list for one skill.
 *
 * A saved set carries its own question id; a draft has none, so the fallback is derived from the
 * index in the FULL source array, not the filtered one, so it stays stable and unique no matter
 * which skill is previewed — the engine uses it as a React key.
 */
export function toEngineQuestions(
  questions: PreviewQuestion[],
  skill: string,
): EngineQuestions {
  const scrub = newScrubber();
  const out: CatalogQuestion[] = [];
  questions.forEach((draft, index) => {
    if (draft.skill !== skill || !isEngineSkill(draft.skill)) return;
    out.push({
      id: draft.id ?? `ai-draft-${index}`,
      skill: draft.skill,
      part: draft.part,
      prompt: draft.prompt ?? "",
      metadata: toEngineMetadata(isRecord(draft.metadata) ? draft.metadata : {}, scrub),
    });
  });
  return { questions: out, scrubbed: scrub.tokens };
}

export type PreviewObjectiveResult = { result: ObjectiveResult; scrubbed: string[] };

/**
 * toObjectiveResult builds an all-correct review payload from a preview source, mirroring the
 * backend's objective grader (internal/catalog/app/objective_grader.go) section for section.
 *
 * Every item is marked correct: there is no attempt to grade, and the reviewer's question is
 * "what does the published answer key look like", not "what did a student score".
 */
export function toObjectiveResult(
  questions: PreviewQuestion[],
  skill: string,
): PreviewObjectiveResult {
  const scrub = newScrubber();
  const sections: ObjectiveResultSection[] = [];
  let total = 0;

  for (const draft of questions) {
    if (draft.skill !== skill) continue;
    const metadata = isRecord(draft.metadata) ? draft.metadata : {};
    const items: ObjectiveResultItem[] = [];

    const groups = Array.isArray(metadata.groups) ? metadata.groups : [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.items)) continue;
      for (const raw of group.items) {
        if (!isRecord(raw)) continue;
        const number = asNumber(raw.number);
        if (number === undefined) continue;
        items.push({
          number,
          correct: true,
          type: asString(group.type),
          prompt: asString(raw.prompt),
          correct_answers: asStringArray(raw.answer_key),
          accepted_variants: asStringArray(raw.accepted_variants),
          explanation: asString(raw.explanation),
        });
      }
    }

    if (items.length === 0) continue;
    total += items.length;
    sections.push({
      // `||`, not `??`: a source can carry passage_html_marked as an empty string, and falling back
      // to the prompt shows the reviewer the passage instead of a blank panel.
      passage: asString(metadata.passage_html_marked) || draft.prompt || "",
      audio_url: scrub.take("audio_url", metadata.audio_url),
      transcript: asString(metadata.transcript),
      items,
    });
  }

  return {
    result: { kind: "objective", skill, raw: total, total, band: 0, sections },
    scrubbed: scrub.tokens,
  };
}
