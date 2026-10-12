import { describe, it, expect } from "vitest";
import {
  detectSkill,
  parseJSONText,
  readFileText,
  isJSONFile,
  mediaBasename,
  setAtPointer,
  matchMediaRefs,
  mediaKindOf,
  contentTypeOf,
  contentTypeForName,
  inputSignature,
  missingMediaMessage,
} from "./prepare";
import type { JSONImportMediaRef, PickedJSONFile } from "./types";

describe("detectSkill", () => {
  it("finds the skill word in a nested path", () => {
    expect(detectSkill("cam21/Listening.json")).toBe("listening");
  });

  it("finds the skill word in a hyphenated basename", () => {
    expect(detectSkill("reading-mau.json")).toBe("reading");
  });

  it("returns null when no skill word is present", () => {
    expect(detectSkill("de-1.json")).toBeNull();
  });
});

describe("parseJSONText", () => {
  it("reports an error for invalid JSON", () => {
    const result = parseJSONText("{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.startsWith("File không phải JSON hợp lệ")).toBe(true);
    }
  });

  it("parses valid JSON", () => {
    const result = parseJSONText("[1]");
    expect(result).toEqual({ ok: true, content: [1] });
  });
});

describe("readFileText", () => {
  it("reads file content via FileReader", async () => {
    const file = new File(['{"a":1}'], "a.json");
    await expect(readFileText(file)).resolves.toBe('{"a":1}');
  });
});

describe("isJSONFile", () => {
  it("accepts .json regardless of case", () => {
    expect(isJSONFile(new File([], "A.JSON"))).toBe(true);
  });
});

describe("mediaBasename", () => {
  it("strips a Windows-style directory prefix", () => {
    expect(mediaBasename("img\\a.png")).toBe("a.png");
  });

  it("strips a Unix-style directory prefix", () => {
    expect(mediaBasename("./x/b.mp3")).toBe("b.mp3");
  });

  it("ignores surrounding whitespace like the backend", () => {
    expect(mediaBasename(" img/c.png ")).toBe("c.png");
  });
});

describe("setAtPointer", () => {
  it("returns a new object with the value set", () => {
    const root = { a: [{ b: "x" }] };
    const result = setAtPointer(root, "/a/0/b", "y") as typeof root;
    expect(result.a[0].b).toBe("y");
  });

  it("leaves the original untouched", () => {
    const root = { a: [{ b: "x" }] };
    setAtPointer(root, "/a/0/b", "y");
    expect(root.a[0].b).toBe("x");
  });

  it("unescapes ~1 to address a key containing a slash", () => {
    const root = { "a/b": "x" };
    const result = setAtPointer(root, "/a~1b", "y") as typeof root;
    expect(result["a/b"]).toBe("y");
  });

  it("throws when a segment of the path is missing", () => {
    expect(() => setAtPointer({ a: {} }, "/a/b/c", "y")).toThrow();
  });
});

describe("matchMediaRefs", () => {
  const refs: JSONImportMediaRef[] = [
    { file: "listening.json", pointer: "/audio_url", value: "Test 1.mp3", local: true },
    { file: "listening.json", pointer: "/groups/0/image_url", value: "https://cdn.example.com/a.png", local: false },
    { file: "reading.json", pointer: "/0/groups/0/image_url", value: "x.png", local: true },
  ];
  const media = [new File([], "test 1.MP3")];

  it("matches local refs to media by case-insensitive basename", () => {
    const { matches } = matchMediaRefs(refs, media);
    expect(matches).toEqual([{ ref: refs[0], file: media[0] }]);
  });

  it("reports the unmatched local ref as missing", () => {
    const { missing } = matchMediaRefs(refs, media);
    expect(missing).toEqual([refs[2]]);
  });

  it("ignores remote refs entirely", () => {
    const { matches, missing } = matchMediaRefs(refs, media);
    const all = [...matches.map((m) => m.ref), ...missing];
    expect(all).not.toContainEqual(refs[1]);
  });
});

describe("mediaKindOf", () => {
  it("classifies an audio mime type as audio", () => {
    expect(mediaKindOf(new File([], "x.mp3", { type: "audio/mpeg" }))).toBe("audio");
  });

  it("classifies a recognized image extension with empty type as image", () => {
    expect(mediaKindOf(new File([], "a.webp"))).toBe("image");
  });

  it("returns null for an unsupported extension", () => {
    expect(mediaKindOf(new File([], "a.pdf"))).toBeNull();
  });
});

describe("contentTypeOf", () => {
  it("maps .m4a with empty type to audio/mp4", () => {
    expect(contentTypeOf(new File([], "a.m4a"))).toBe("audio/mp4");
  });

  it("maps .m4a with a non-whitelisted type to audio/mp4", () => {
    expect(contentTypeOf(new File([], "a.m4a", { type: "audio/x-m4a" }))).toBe("audio/mp4");
  });

  it("maps .wav with a non-whitelisted type to audio/wav", () => {
    expect(contentTypeOf(new File([], "a.wav", { type: "audio/x-wav" }))).toBe("audio/wav");
  });

  it("maps .jpeg with empty type to image/jpeg", () => {
    expect(contentTypeOf(new File([], "a.jpeg"))).toBe("image/jpeg");
  });

  it("keeps an already-whitelisted type", () => {
    expect(contentTypeOf(new File([], "a.png", { type: "image/png" }))).toBe("image/png");
  });

  it("returns null for an unsupported extension", () => {
    expect(contentTypeOf(new File([], "a.pdf"))).toBeNull();
  });
});

describe("contentTypeForName", () => {
  it("maps an upper-case audio extension", () => {
    expect(contentTypeForName("A.MP3")).toBe("audio/mpeg");
  });

  it("uses only the last path segment", () => {
    expect(contentTypeForName("x.y/b.jpeg")).toBe("image/jpeg");
  });

  it("returns null for a non-media file", () => {
    expect(contentTypeForName("Reading.pdf")).toBeNull();
  });
});

describe("inputSignature", () => {
  const basePicked: PickedJSONFile[] = [
    { file: new File([], "listening.json"), skill: "listening", content: {}, parseError: null },
  ];

  it("changes when the name changes", () => {
    const s1 = inputSignature("Test", basePicked);
    const s2 = inputSignature("Test 2", basePicked);
    expect(s2).not.toBe(s1);
  });

  it("changes when a file's skill changes", () => {
    const s1 = inputSignature("Test", basePicked);
    const changed: PickedJSONFile[] = [{ ...basePicked[0], skill: "reading" }];
    const s2 = inputSignature("Test", changed);
    expect(s2).not.toBe(s1);
  });
});

describe("missingMediaMessage", () => {
  it("formats the file and pointer", () => {
    const ref: JSONImportMediaRef = {
      file: "reading.json",
      pointer: "/0/groups/0/image_url",
      value: "x.png",
      local: true,
    };
    expect(missingMediaMessage(ref)).toBe('Thiếu file media "x.png" (reading.json /0/groups/0/image_url)');
  });
});
