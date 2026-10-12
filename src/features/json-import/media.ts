import { setAtPointer } from "./prepare";
import type { JSONImportFileInput, MediaMatch } from "./types";

export async function uploadAndApplyMedia(
  files: JSONImportFileInput[],
  matches: MediaMatch[],
  upload: (file: File) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<JSONImportFileInput[]> {
  const distinctFiles = [...new Set(matches.map((m) => m.file))];
  const urlByFile = new Map<File, string>();
  for (let i = 0; i < distinctFiles.length; i++) {
    const file = distinctFiles[i];
    urlByFile.set(file, await upload(file));
    onProgress?.(i + 1, distinctFiles.length);
  }

  const contentByFilename = new Map(files.map((f) => [f.filename, structuredClone(f.content)]));
  for (const match of matches) {
    const url = urlByFile.get(match.file);
    if (url === undefined) continue;
    const content = contentByFilename.get(match.ref.file);
    contentByFilename.set(match.ref.file, setAtPointer(content, match.ref.pointer, url));
  }

  return files.map((f) => ({ ...f, content: contentByFilename.get(f.filename) ?? f.content }));
}
