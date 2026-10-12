import { describe, it, expect, vi } from "vitest";
import { checkZipFolder, importZipFolder, isImportable, localBlockers, mapLimit, ZipImportError } from "./zip-flow";
import type { LoadedZipFolder } from "./zip";
import type { JSONImportValidateResponse } from "./types";

function folder(overrides: Partial<LoadedZipFolder> = {}): LoadedZipFolder {
  return {
    key: "T",
    name: "T",
    picked: [
      {
        file: new File(["{}"], "listening.json"),
        skill: "listening",
        content: { audio_url: "a.mp3" },
        parseError: null,
      },
    ],
    media: [new File(["x"], "a.mp3", { type: "audio/mpeg" })],
    ignored: [],
    skillError: null,
    ...overrides,
  };
}

const CLEAN: JSONImportValidateResponse = {
  plan: [{ title: "T", kind: "practice", skill: "listening", part: 1, question_count: 1 }],
  problems: [],
  media_refs: [{ file: "listening.json", pointer: "/audio_url", value: "a.mp3", local: true }],
  drafts: [],
};

describe("localBlockers", () => {
  it("lists the skill error and parse errors", () => {
    const f = folder({
      skillError: "Không nhận ra kỹ năng",
      picked: [{ file: new File([""], "r.json"), skill: "reading", content: null, parseError: "hỏng" }],
    });
    expect(localBlockers(f)).toEqual(["Không nhận ra kỹ năng", "r.json: hỏng"]);
  });
});

describe("checkZipFolder + isImportable", () => {
  it("validates with the folder name and matches media", async () => {
    const validate = vi.fn().mockResolvedValue(CLEAN);
    const f = folder();
    const check = await checkZipFolder(f, validate);
    expect(validate).toHaveBeenCalledWith({
      name: "T",
      files: [{ filename: "listening.json", skill: "listening", content: { audio_url: "a.mp3" } }],
    });
    expect(check.matches.map((m) => m.file.name)).toEqual(["a.mp3"]);
    expect(isImportable(f, check)).toBe(true);
  });

  it("is not importable with problems, missing media or no check", async () => {
    const f = folder({ media: [] });
    const check = await checkZipFolder(f, vi.fn().mockResolvedValue(CLEAN));
    expect(check.missing).toHaveLength(1);
    expect(isImportable(f, check)).toBe(false);
    expect(isImportable(folder(), { report: { ...CLEAN, problems: [{ file: "", path: "", message: "x" }] }, matches: [], missing: [] })).toBe(false);
    expect(isImportable(folder(), null)).toBe(false);
  });
});

describe("importZipFolder", () => {
  it("uploads matched media then imports with the URL substituted", async () => {
    const f = folder();
    const check = await checkZipFolder(f, vi.fn().mockResolvedValue(CLEAN));
    const upload = vi.fn().mockResolvedValue("https://cdn/a.mp3");
    const importSets = vi.fn().mockResolvedValue({ sets: [{ id: "s1", title: "T", kind: "practice", skill: "listening", question_count: 1 }] });

    const sets = await importZipFolder(f, check, upload, importSets);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(importSets.mock.calls[0][0].files[0].content).toEqual({ audio_url: "https://cdn/a.mp3" });
    expect(sets.map((s) => s.id)).toEqual(["s1"]);
  });

  it("marks an upload failure as happening before any write", async () => {
    const f = folder();
    const check = await checkZipFolder(f, vi.fn().mockResolvedValue(CLEAN));
    const cause = new Error("upload down");
    const err = await importZipFolder(f, check, vi.fn().mockRejectedValue(cause), vi.fn()).catch((e) => e);
    expect(err).toBeInstanceOf(ZipImportError);
    expect(err.writing).toBe(false);
    expect(err.cause).toBe(cause);
  });

  it("marks an import failure as happening during the write", async () => {
    const f = folder();
    const check = await checkZipFolder(f, vi.fn().mockResolvedValue(CLEAN));
    const err = await importZipFolder(f, check, vi.fn().mockResolvedValue("https://x"), vi.fn().mockRejectedValue(new Error("500"))).catch((e) => e);
    expect(err.writing).toBe(true);
  });
});

describe("mapLimit", () => {
  it("never runs more than the limit at once and keeps order", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([30, 10, 20, 5, 1], 2, async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return ms * 2;
    });
    expect(peak).toBe(2);
    expect(result).toEqual([60, 20, 40, 10, 2]);
  });
});
