/**
 * Unit tests for the pure form-completion builder core in ./rl-form-html.ts.
 * Locks down round-trip serialize/parse correctness, escaping, structural
 * rejection (fallback to raw HTML), and item-sync (reconcileItems).
 */
import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  serializeForm,
  parseForm,
  resolveModel,
  reconcileItems,
  blankNumbersFromHtml,
  normalizeContentHtml,
  type FormModel,
} from "./rl-form-html";
import type { RLItemDraft } from "./types";

describe("serializeForm / parseForm — round-trip", () => {
  it("round-trips a model with instruction, title, a blank row and a given row", () => {
    const model: FormModel = {
      instruction: "Complete the notes below.",
      title: "Booking Form",
      rows: [
        { label: "First name", right: { kind: "blank", number: 1 } },
        { label: "Family name", right: { kind: "given", text: "Yuichini" } },
      ],
    };
    const html = serializeForm(model);
    expect(parseForm(html)).toEqual(model);
  });

  it("serializes a blank row #3 with the canonical data-blank span", () => {
    const model: FormModel = {
      instruction: "",
      title: "",
      rows: [{ label: "Passport no.", right: { kind: "blank", number: 3 } }],
    };
    const html = serializeForm(model);
    expect(html).toContain('<span data-blank="3"></span>');
  });

  it("escapes special characters in a label and round-trips the exact original", () => {
    const model: FormModel = {
      instruction: "",
      title: "",
      rows: [{ label: "<b>&", right: { kind: "given", text: "ok" } }],
    };
    const html = serializeForm(model);
    // must not break the surrounding markup
    expect(html).not.toContain("<b>&");
    const parsed = parseForm(html);
    expect(parsed).not.toBeNull();
    expect(parsed?.rows[0].label).toBe("<b>&");
  });

  it("round-trips an empty given cell (not null)", () => {
    const model: FormModel = {
      instruction: "",
      title: "",
      rows: [{ label: "L", right: { kind: "given", text: "" } }],
    };
    const html = serializeForm(model);
    expect(parseForm(html)).toEqual(model);
  });

  it("round-trips a zero-row model", () => {
    const model: FormModel = { instruction: "", title: "", rows: [] };
    const html = serializeForm(model);
    expect(html).toBe("<table><tbody></tbody></table>");
    expect(parseForm(html)).toEqual(model);
  });
});

// ── parseForm — structural rejection ────────────────────────────────────────

describe("parseForm — rejects unrecognized structure", () => {
  it("returns null when there is no <table>", () => {
    expect(parseForm("<p>x</p><ul><li>y</li></ul>")).toBeNull();
  });

  it("returns null when a <tr> has 3 <td>s", () => {
    const html = "<table><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>";
    expect(parseForm(html)).toBeNull();
  });

  it("returns null when a right <td> contains both a span and other text", () => {
    const html =
      '<table><tbody><tr><td>L</td><td><span data-blank="1"></span>extra</td></tr></tbody></table>';
    expect(parseForm(html)).toBeNull();
  });
});

// ── parseForm — whitespace / pretty-print tolerance ─────────────────────────

describe("parseForm — tolerates whitespace pretty-printing", () => {
  it("parses a table with newlines/indentation between <tr>/<td>", () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>First name</td>
            <td><span data-blank="1"></span></td>
          </tr>
          <tr>
            <td>Family name</td>
            <td>Yuichini</td>
          </tr>
        </tbody>
      </table>
    `;
    const parsed = parseForm(html);
    expect(parsed).toEqual({
      instruction: "",
      title: "",
      rows: [
        { label: "First name", right: { kind: "blank", number: 1 } },
        { label: "Family name", right: { kind: "given", text: "Yuichini" } },
      ],
    });
  });

  it("parses an explicitly empty table into a zero-row model", () => {
    expect(parseForm("<table><tbody></tbody></table>")).toEqual({
      instruction: "",
      title: "",
      rows: [],
    });
  });
});

// ── escapeHtml ───────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes & before < and >", () => {
    expect(escapeHtml("<b>&")).toBe("&lt;b&gt;&amp;");
  });
});

// ── reconcileItems ───────────────────────────────────────────────────────

describe("reconcileItems", () => {
  it("keeps an existing item's answer_key and adds an empty item for a new blank", () => {
    const items: RLItemDraft[] = [{ number: 1, prompt: "", answer_key: ["Kenji"] }];
    const result = reconcileItems(items, [1, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ number: 1, prompt: "", answer_key: ["Kenji"] });
    expect(result[1]).toEqual({ number: 2, prompt: "", answer_key: [] });
  });

  it("drops items whose number is no longer a blank", () => {
    const items: RLItemDraft[] = [
      { number: 1, prompt: "", answer_key: ["a"] },
      { number: 2, prompt: "", answer_key: ["b"] },
    ];
    const result = reconcileItems(items, [1]);
    expect(result).toEqual([{ number: 1, prompt: "", answer_key: ["a"] }]);
  });
});

// ── resolveModel ─────────────────────────────────────────────────────────

describe("resolveModel", () => {
  it("seeds one blank row per item when html is empty", () => {
    const items: RLItemDraft[] = [
      { number: 1, prompt: "First name", answer_key: [] },
      { number: 2, prompt: "Passport", answer_key: [] },
    ];
    expect(resolveModel("", items)).toEqual({
      instruction: "",
      title: "",
      rows: [
        { label: "First name", right: { kind: "blank", number: 1 } },
        { label: "Passport", right: { kind: "blank", number: 2 } },
      ],
    });
  });

  it("returns null for non-empty, unparseable html", () => {
    const items: RLItemDraft[] = [{ number: 1, prompt: "First name", answer_key: [] }];
    expect(resolveModel("<div>x</div>", items)).toBeNull();
  });
});

// ── blankNumbersFromHtml ─────────────────────────────────────────────────

describe("blankNumbersFromHtml", () => {
  it("returns blank numbers in document order, not sorted", () => {
    const html =
      '<table><tbody><tr><td><span data-blank="5"></span></td>' +
      '<td><span data-blank="1"></span></td>' +
      '<td><span data-blank="3"></span></td></tr></tbody></table>';
    expect(blankNumbersFromHtml(html)).toEqual([5, 1, 3]);
  });

  it("dedups a duplicate data-blank, keeping the first occurrence", () => {
    const html =
      '<span data-blank="2"></span><span data-blank="2"></span>';
    expect(blankNumbersFromHtml(html)).toEqual([2]);
  });

  it("returns an empty array for html with no blanks", () => {
    expect(blankNumbersFromHtml("<p>No blanks here.</p>")).toEqual([]);
  });

  it("ignores invalid data-blank values (non-numeric, empty) alongside a valid one", () => {
    const html =
      '<span data-blank="abc"></span><span data-blank=""></span><span data-blank="4"></span>';
    expect(blankNumbersFromHtml(html)).toEqual([4]);
  });
});

// ── normalizeContentHtml ─────────────────────────────────────────────────

describe("normalizeContentHtml", () => {
  it("normalizes an empty <p></p> to undefined", () => {
    expect(normalizeContentHtml("<p></p>")).toBeUndefined();
  });

  it("normalizes Tiptap's empty-doc <p><br></p> to undefined", () => {
    expect(normalizeContentHtml("<p><br></p>")).toBeUndefined();
  });

  it("normalizes an empty string to undefined", () => {
    expect(normalizeContentHtml("")).toBeUndefined();
  });

  it("normalizes a whitespace-only string to undefined", () => {
    expect(normalizeContentHtml("   ")).toBeUndefined();
  });

  it("passes undefined through as undefined", () => {
    expect(normalizeContentHtml(undefined)).toBeUndefined();
  });

  it("returns non-empty content with a blank unchanged (identity)", () => {
    const input =
      '<h3>T</h3><table><tbody><tr><td>x</td><td><span data-blank="1"></span></td></tr></tbody></table>';
    expect(normalizeContentHtml(input)).toBe(input);
  });

  it("returns content with only an image unchanged (identity)", () => {
    const input = '<p><img src="x"></p>';
    expect(normalizeContentHtml(input)).toBe(input);
  });
});
