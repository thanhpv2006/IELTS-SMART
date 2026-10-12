import { describe, it, expect, vi } from "vitest";
import { uploadAndApplyMedia } from "./media";
import type { JSONImportFileInput, MediaMatch } from "./types";

function buildFiles(): JSONImportFileInput[] {
  return [
    {
      filename: "listening.json",
      skill: "listening",
      content: { audio_url: "test1.mp3", groups: [{ image_url: "a.png" }] },
    },
    {
      filename: "reading.json",
      skill: "reading",
      content: [{ image_url: "b.png" }],
    },
  ];
}

function buildMatches(fileA: File, fileB: File): MediaMatch[] {
  return [
    { ref: { file: "listening.json", pointer: "/audio_url", value: "test1.mp3", local: true }, file: fileA },
    { ref: { file: "listening.json", pointer: "/groups/0/image_url", value: "a.png", local: true }, file: fileA },
    { ref: { file: "reading.json", pointer: "/0/image_url", value: "b.png", local: true }, file: fileB },
  ];
}

describe("uploadAndApplyMedia", () => {
  it("uploads each distinct File once", async () => {
    const fileA = new File([], "test1.mp3");
    const fileB = new File([], "b.png");
    const upload = vi.fn(async (file: File) => (file === fileA ? "https://cdn/a-url" : "https://cdn/b-url"));

    await uploadAndApplyMedia(buildFiles(), buildMatches(fileA, fileB), upload);

    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("reports progress per distinct file", async () => {
    const fileA = new File([], "test1.mp3");
    const fileB = new File([], "b.png");
    const upload = vi.fn(async (file: File) => (file === fileA ? "https://cdn/a-url" : "https://cdn/b-url"));
    const onProgress = vi.fn();

    await uploadAndApplyMedia(buildFiles(), buildMatches(fileA, fileB), upload, onProgress);

    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("replaces each pointer with the uploaded url", async () => {
    const fileA = new File([], "test1.mp3");
    const fileB = new File([], "b.png");
    const upload = vi.fn(async (file: File) => (file === fileA ? "https://cdn/a-url" : "https://cdn/b-url"));

    const result = await uploadAndApplyMedia(buildFiles(), buildMatches(fileA, fileB), upload);

    const listeningContent = result[0].content as { audio_url: string; groups: { image_url: string }[] };
    const readingContent = result[1].content as { image_url: string }[];
    expect(listeningContent.audio_url).toBe("https://cdn/a-url");
    expect(listeningContent.groups[0].image_url).toBe("https://cdn/a-url");
    expect(readingContent[0].image_url).toBe("https://cdn/b-url");
  });

  it("does not mutate the input files", async () => {
    const fileA = new File([], "test1.mp3");
    const fileB = new File([], "b.png");
    const upload = vi.fn(async () => "https://cdn/url");
    const files = buildFiles();

    await uploadAndApplyMedia(files, buildMatches(fileA, fileB), upload);

    const listeningContent = files[0].content as { audio_url: string };
    expect(listeningContent.audio_url).toBe("test1.mp3");
  });

  it("propagates an upload rejection", async () => {
    const fileA = new File([], "test1.mp3");
    const fileB = new File([], "b.png");
    const upload = vi.fn(async () => {
      throw new Error("Upload thất bại (500): test1.mp3");
    });

    await expect(uploadAndApplyMedia(buildFiles(), buildMatches(fileA, fileB), upload)).rejects.toThrow(
      "Upload thất bại (500): test1.mp3",
    );
  });
});
