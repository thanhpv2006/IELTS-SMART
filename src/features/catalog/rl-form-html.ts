// Pure serialize/parse/reconcile core for the R/L "form completion" authoring
// builder. Bridges a structured, editable form model and the persisted
// `group.instructions_html` (source of truth) + `group.items[]`.
// No React, no side effects (besides DOMParser, guarded) — safe to unit test.

import { emptyItem } from "./rl-metadata";
import type { RLItemDraft } from "./types";

export type FormCell = { kind: "given"; text: string } | { kind: "blank"; number: number };
export type FormRow = { label: string; right: FormCell };
export type FormModel = { instruction: string; title: string; rows: FormRow[] };

/** Escape text for safe HTML embedding. Order matters: `&` first, then `<`/`>`. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Serialize a form model into the canonical `instructions_html` markup. */
export function serializeForm(m: FormModel): string {
  const instructionHtml = m.instruction ? `<p>${escapeHtml(m.instruction)}</p>` : "";
  const titleHtml = m.title ? `<h3>${escapeHtml(m.title)}</h3>` : "";
  const rowsHtml = m.rows
    .map((r) => {
      const right =
        r.right.kind === "blank"
          ? `<span data-blank="${r.right.number}"></span>`
          : escapeHtml(r.right.text);
      return `<tr><td>${escapeHtml(r.label)}</td><td>${right}</td></tr>`;
    })
    .join("");
  return `${instructionHtml}${titleHtml}<table><tbody>${rowsHtml}</tbody></table>`;
}

const BLANK_NUMBER_RE = /^[0-9]{1,3}$/;

/**
 * Parse `instructions_html` into a form model. Deterministic inverse of
 * `serializeForm`. Returns null for any structure it doesn't recognize
 * (caller falls back to raw-HTML editing — never loses data).
 */
export function parseForm(html: string): FormModel | null {
  if (typeof window === "undefined") return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const bodyChildren = Array.from(doc.body.children);

  let idx = 0;
  let instruction = "";
  let title = "";

  if (bodyChildren[idx]?.tagName === "P") {
    instruction = bodyChildren[idx].textContent ?? "";
    idx += 1;
  }
  if (bodyChildren[idx]?.tagName === "H3") {
    title = bodyChildren[idx].textContent ?? "";
    idx += 1;
  }

  const tableEl = bodyChildren[idx];
  if (!tableEl || tableEl.tagName !== "TABLE") return null;
  idx += 1;
  if (idx !== bodyChildren.length) return null; // trailing unexpected elements

  const table = tableEl as HTMLTableElement;
  const rows: FormRow[] = [];

  for (const tr of Array.from(table.rows)) {
    const cells = Array.from(tr.cells);
    if (cells.length !== 2) return null;

    const [leftTd, rightTd] = cells;
    const label = leftTd.textContent ?? "";

    const rightElementChildren = Array.from(rightTd.children);
    let right: FormCell;
    if (rightElementChildren.length === 1 && rightElementChildren[0].tagName === "SPAN") {
      const span = rightElementChildren[0] as HTMLSpanElement;
      const blankAttr = span.getAttribute("data-blank");
      const otherText = Array.from(rightTd.childNodes)
        .filter((n) => n !== span)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (blankAttr !== null && BLANK_NUMBER_RE.test(blankAttr) && otherText === "") {
        right = { kind: "blank", number: Number(blankAttr) };
      } else {
        return null;
      }
    } else if (rightElementChildren.length === 0) {
      right = { kind: "given", text: rightTd.textContent ?? "" };
    } else {
      return null;
    }

    rows.push({ label, right });
  }

  return { instruction, title, rows };
}

/**
 * Resolve a form model for the builder: parse the persisted HTML, or — if
 * html is empty — seed one blank row per existing item (so opening the
 * builder on a group authored via the classic item flow never drops items).
 * Non-empty & unparseable HTML returns null (fallback to raw-HTML editing).
 */
export function resolveModel(html: string, items: RLItemDraft[]): FormModel | null {
  const parsed = parseForm(html);
  if (parsed) return parsed;
  if (html.trim() === "") {
    return {
      instruction: "",
      title: "",
      rows: items.map((it) => ({
        label: it.prompt ?? "",
        right: { kind: "blank", number: it.number },
      })),
    };
  }
  return null;
}

/**
 * Sync the item set with the current blank set: keep existing items whose
 * number is still a blank (preserving answer_key/accepted_variants/prompt),
 * create empty items for new blank numbers, drop items for removed blanks.
 * Result order follows `blankNumbers` (i.e. row order in the model).
 */
export function reconcileItems(items: RLItemDraft[], blankNumbers: number[]): RLItemDraft[] {
  const byNumber = new Map(items.map((it) => [it.number, it]));
  return blankNumbers.map((n) => byNumber.get(n) ?? emptyItem(n));
}

/**
 * Extract the ordered list of `data-blank` numbers from arbitrary HTML
 * (document order, deduped keeping the first occurrence). Drives
 * `reconcileItems` for the richtext form editor.
 */
export function blankNumbersFromHtml(html: string): number[] {
  if (typeof window === "undefined") return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<number>();
  const result: number[] = [];

  for (const el of Array.from(doc.querySelectorAll("[data-blank]"))) {
    const attr = el.getAttribute("data-blank");
    if (attr === null || !BLANK_NUMBER_RE.test(attr)) continue;
    const n = Number(attr);
    if (seen.has(n)) continue;
    seen.add(n);
    result.push(n);
  }

  return result;
}

/**
 * Normalize a Tiptap-authored `content_html` field: empty content (no
 * blanks, no images, whitespace-only text — including Tiptap's empty-doc
 * variants like `"<p></p>"` / `"<p><br></p>"`) becomes `undefined`, so the
 * exam-engine's `content_html ?? instructions_html` fallback still applies.
 * Non-empty input is returned byte-for-byte unchanged (identity) so
 * `content_html === editor.getHTML()` stays stable and the editor never
 * thrashes.
 */
export function normalizeContentHtml(html: string | undefined): string | undefined {
  if (html === undefined) return undefined;

  if (typeof window === "undefined") {
    return html.trim() ? html : undefined;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const hasBlank = doc.body.querySelector("[data-blank]") !== null;
  const hasImg = doc.body.querySelector("img") !== null;
  const hasText = (doc.body.textContent ?? "").trim() !== "";

  if (!hasBlank && !hasImg && !hasText) return undefined;
  return html;
}
