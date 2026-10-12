/**
 * Unit tests for pure helpers exported from
 * src/app/(student)/student/take/[id]/page.tsx
 *
 * Covers TK-27 (parseCuePrompt), TK-30 (wordCount basic), TK-33 (wordCount edge).
 */
import { describe, it, expect } from "vitest";
import { wordCount, parseCuePrompt } from "@/app/(student)/student/take/[id]/page";

// ── wordCount (TK-30, TK-33) ─────────────────────────────────────────────────

describe("wordCount — TK-30 / TK-33", () => {
  it("TK-30: counts words in a normal sentence", () => {
    expect(wordCount("The quick brown fox")).toBe(4);
  });

  it("TK-30: returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  it("TK-30: returns 0 for whitespace-only string", () => {
    expect(wordCount("   \t  ")).toBe(0);
  });

  it("TK-33: multiple spaces between words count as one boundary", () => {
    expect(wordCount("hello   world")).toBe(2);
  });

  it("TK-33: tabs between words treated as whitespace", () => {
    expect(wordCount("word1\tword2\tword3")).toBe(3);
  });

  it("TK-33: newlines between words treated as whitespace", () => {
    expect(wordCount("line one\nline two\nline three")).toBe(6);
  });

  it("TK-33: mixed whitespace (spaces + newlines + tabs)", () => {
    expect(wordCount("a  b\n\nc\t\td")).toBe(4);
  });

  it("TK-33: leading/trailing whitespace does not create phantom words", () => {
    expect(wordCount("  hello world  ")).toBe(2);
  });

  it("TK-33: single word with surrounding newlines", () => {
    expect(wordCount("\n\nhello\n\n")).toBe(1);
  });

  it("TK-30: counts a realistic 150-word essay excerpt correctly", () => {
    const essay = Array(150).fill("word").join(" ");
    expect(wordCount(essay)).toBe(150);
  });

  it("TK-33: carriage return + newline (Windows line ending)", () => {
    expect(wordCount("one\r\ntwo\r\nthree")).toBe(3);
  });
});

// ── parseCuePrompt (TK-27) ────────────────────────────────────────────────────

describe("parseCuePrompt — TK-27", () => {
  it("TK-27: returns null when 'You should say:' is absent (plain prompt)", () => {
    const result = parseCuePrompt("Describe your hometown.");
    expect(result).toBeNull();
  });

  it("TK-27: returns null for HTML prompt without cue card pattern", () => {
    const result = parseCuePrompt("<p>Talk about a time when you helped someone.</p>");
    expect(result).toBeNull();
  });

  it("TK-27: extracts topic and bullet points from plain-text cue card", () => {
    const prompt = [
      "Describe a place you have visited recently.",
      "You should say:",
      "where it is",
      "when you went there",
      "what you did there",
    ].join("\n");

    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.topic).toBe("Describe a place you have visited recently.");
    expect(result!.points).toEqual([
      "where it is",
      "when you went there",
      "what you did there",
    ]);
    expect(result!.note).toBeUndefined();
  });

  it("TK-27: extracts note line containing time instruction", () => {
    const prompt = [
      "Talk about a memorable journey.",
      "You should say:",
      "where you went",
      "who you went with",
      "You have 1 minute to prepare and 1-2 minutes to speak.",
    ].join("\n");

    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toEqual(["where you went", "who you went with"]);
    expect(result!.note).toMatch(/1\s*[-–]\s*2\s*minute/i);
  });

  it("TK-27: parses cue from HTML with <br> tags", () => {
    const prompt =
      "Describe a book you enjoyed.<br>You should say:<br>what the book is about<br>when you read it";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.topic).toBe("Describe a book you enjoyed.");
    expect(result!.points).toContain("what the book is about");
    expect(result!.points).toContain("when you read it");
  });

  it("TK-27: parses cue from HTML with <ul>/<li> structure", () => {
    const prompt = `<p>Describe a skill you would like to learn.</p><p>You should say:</p><ul><li>what the skill is</li><li>why you want to learn it</li><li>how you plan to learn it</li></ul>`;
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.topic).toContain("Describe a skill");
    expect(result!.points.length).toBeGreaterThanOrEqual(3);
  });

  it("TK-27: case-insensitive match for 'YOU SHOULD SAY:'", () => {
    const prompt = "A topic.\nYOU SHOULD SAY:\nsome point";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toContain("some point");
  });

  it("TK-27: bullet characters (•) are stripped from points", () => {
    const prompt = "Describe a gadget.\nYou should say:\n• what it is\n• how you use it";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toEqual(["what it is", "how you use it"]);
  });

  it("TK-27: hyphen bullet characters are stripped from points", () => {
    const prompt = "A topic.\nYou should say:\n- point one\n- point two";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toEqual(["point one", "point two"]);
  });

  it("TK-27: empty points list when no lines after 'You should say:'", () => {
    const prompt = "A topic.\nYou should say:";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toEqual([]);
    expect(result!.note).toBeUndefined();
  });

  it("TK-27: note line with 'you should speak' pattern is extracted as note", () => {
    const prompt = "Topic.\nYou should say:\npoint A\nYou should speak for about 1-2 minutes.";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.points).toEqual(["point A"]);
    expect(result!.note).toMatch(/you should speak/i);
  });

  it("TK-27: &nbsp; in HTML is normalised to space before parsing", () => {
    const prompt = "Describe&nbsp;a&nbsp;journey.\nYou should say:\npoint one";
    const result = parseCuePrompt(prompt);
    // After stripHtml, &nbsp; → space; topic should still be non-null.
    expect(result).not.toBeNull();
  });

  it("TK-27: topic is trimmed correctly when there is leading/trailing whitespace", () => {
    const prompt = "  A topic with spaces.  \nYou should say:\npoint";
    const result = parseCuePrompt(prompt);
    expect(result).not.toBeNull();
    expect(result!.topic).toBe("A topic with spaces.");
  });
});
