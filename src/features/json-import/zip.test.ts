// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { groupZipEntries, readZip } from "./zip";

describe("groupZipEntries", () => {
  it("treats each directory holding json as one test under a wrapper directory", () => {
    const { folders, ignored } = groupZipEntries(
      [
        "de/",
        "de/C17 - Reading 1/reading.json",
        "de/C17 - Reading 1/img/map.png",
        "de/C17 - Listening 1/listening.json",
        "de/C17 - Listening 1/test 1.mp3",
      ],
      "de.zip",
    );
    expect(folders.map((f) => [f.key, f.name, f.jsonPaths, f.mediaPaths])).toEqual([
      ["de/C17 - Listening 1", "C17 - Listening 1", ["de/C17 - Listening 1/listening.json"], ["de/C17 - Listening 1/test 1.mp3"]],
      ["de/C17 - Reading 1", "C17 - Reading 1", ["de/C17 - Reading 1/reading.json"], ["de/C17 - Reading 1/img/map.png"]],
    ]);
    expect(ignored).toEqual([]);
  });

  it("names a root-level test after the zip file", () => {
    const { folders } = groupZipEntries(["reading.json", "a.png"], "Cam 21 Test 1.ZIP");
    expect(folders.map((f) => [f.key, f.name, f.mediaPaths])).toEqual([["", "Cam 21 Test 1", ["a.png"]]]);
  });

  it("drops macOS metadata and dot files silently", () => {
    const { folders, ignored } = groupZipEntries(
      ["T/reading.json", "__MACOSX/T/._reading.json", "T/.DS_Store", "T/._a.png"],
      "x.zip",
    );
    expect(folders[0].ignored).toEqual([]);
    expect(folders[0].mediaPaths).toEqual([]);
    expect(ignored).toEqual([]);
  });

  it("lists non-media files inside a test as ignored for that test", () => {
    const { folders } = groupZipEntries(["T/reading.json", "T/Reading.pdf", "T/notes/a.docx"], "x.zip");
    expect(folders[0].ignored).toEqual(["T/Reading.pdf", "T/notes/a.docx"]);
  });

  it("lists files outside every test as ignored globally", () => {
    const { ignored } = groupZipEntries(["T/reading.json", "orphan.mp3", "readme.md"], "x.zip");
    expect(ignored).toEqual(["orphan.mp3", "readme.md"]);
  });

  it("assigns media to the nearest test when tests are nested", () => {
    const { folders } = groupZipEntries(["A/reading.json", "A/B/listening.json", "A/B/x.mp3", "A/y.png"], "x.zip");
    const byKey = Object.fromEntries(folders.map((f) => [f.key, f.mediaPaths]));
    expect(byKey).toEqual({ A: ["A/y.png"], "A/B": ["A/B/x.mp3"] });
  });

  it("orders tests by name with numbers compared numerically", () => {
    const { folders } = groupZipEntries(["Test 10/reading.json", "Test 2/reading.json"], "x.zip");
    expect(folders.map((f) => f.name)).toEqual(["Test 2", "Test 10"]);
  });
});

async function buildZip(files: Record<string, string>): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [path, text] of Object.entries(files)) {
    await writer.add(path, new TextReader(text));
  }
  const blob = await writer.close();
  return new File([blob], "bundle.zip", { type: "application/zip" });
}

describe("readZip", () => {
  it("falls back to the folder name for the skill of a lone json file", async () => {
    const zip = await buildZip({ "C17 - Reading 1/de.json": "[]" });
    const { folders } = await readZip(zip);
    expect(folders[0].picked.map((p) => [p.file.name, p.skill])).toEqual([["de.json", "reading"]]);
    expect(folders[0].skillError).toBeNull();
  });

  it("reports a skill error when several json files lack a skill word", async () => {
    const zip = await buildZip({ "Test 1/a.json": "[]", "Test 1/b.json": "[]" });
    const { folders } = await readZip(zip);
    expect(folders[0].skillError).toBe(
      "Không nhận ra kỹ năng của file a.json. Đặt tên file là listening/reading/writing/speaking.json.",
    );
  });

  it("turns media entries into files named by basename with a media type", async () => {
    const zip = await buildZip({ "T/listening.json": "{}", "T/audio/Test 1.MP3": "x" });
    const { folders } = await readZip(zip);
    expect(folders[0].media.map((f) => [f.name, f.type])).toEqual([["Test 1.MP3", "audio/mpeg"]]);
  });

  it("keeps a parse error for invalid json", async () => {
    const zip = await buildZip({ "T/reading.json": "{" });
    const { folders } = await readZip(zip);
    expect(folders[0].picked[0].parseError?.startsWith("File không phải JSON hợp lệ")).toBe(true);
  });

  it("rejects a file that is not a zip", async () => {
    const notZip = new File([new Blob(["hello"])], "a.zip");
    await expect(readZip(notZip)).rejects.toThrow("Không đọc được file zip");
  });
});

