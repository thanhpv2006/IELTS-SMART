import {
  JSON_IMPORT_SKILLS,
  type JSONImportFileInput,
  type JSONImportMediaRef,
  type JSONImportRequest,
  type JSONImportSkill,
  type MediaMatch,
  type PickedJSONFile,
} from "./types";

const ALLOWED_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  webm: "audio/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export function mediaBasename(value: string): string {
  const parts = value.trim().split(/[/\\]/);
  return parts[parts.length - 1];
}

export function detectSkill(filename: string): JSONImportSkill | null {
  const base = mediaBasename(filename).toLowerCase();
  return JSON_IMPORT_SKILLS.find((skill) => base.includes(skill)) ?? null;
}

export function parseJSONText(
  text: string,
): { ok: true; content: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, content: JSON.parse(text) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `File không phải JSON hợp lệ: ${message}` };
  }
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được file " + file.name));
    reader.readAsText(file);
  });
}

export function isJSONFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".json");
}

function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function setAtPointer(root: unknown, pointer: string, value: string): unknown {
  const clone = structuredClone(root);
  const segments = pointer.split("/").slice(1).map(unescapePointerSegment);
  let cursor = clone as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = cursor[segments[i]];
    if (next === null || typeof next !== "object") {
      throw new Error("Không tìm thấy vị trí " + pointer);
    }
    cursor = next as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (!(last in cursor)) {
    throw new Error("Không tìm thấy vị trí " + pointer);
  }
  cursor[last] = value;
  return clone;
}

export function matchMediaRefs(
  refs: JSONImportMediaRef[],
  media: File[],
): { matches: MediaMatch[]; missing: JSONImportMediaRef[] } {
  const matches: MediaMatch[] = [];
  const missing: JSONImportMediaRef[] = [];
  for (const ref of refs) {
    if (!ref.local) continue;
    const refBasename = mediaBasename(ref.value).toLowerCase();
    const file = media.find((f) => mediaBasename(f.name).toLowerCase() === refBasename);
    if (file) {
      matches.push({ ref, file });
    } else {
      missing.push(ref);
    }
  }
  return { matches, missing };
}

export function contentTypeForName(name: string): string | null {
  const extension = mediaBasename(name).toLowerCase().split(".").pop() ?? "";
  return EXTENSION_CONTENT_TYPES[extension] ?? null;
}

export function contentTypeOf(file: File): string | null {
  if (ALLOWED_CONTENT_TYPES.has(file.type)) return file.type;
  return contentTypeForName(file.name);
}

export function mediaKindOf(file: File): "audio" | "image" | null {
  const type = contentTypeOf(file);
  if (!type) return null;
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("image/")) return "image";
  return null;
}

export function inputSignature(name: string, picked: PickedJSONFile[]): string {
  return JSON.stringify({
    name: name.trim(),
    files: picked.map((p) => [p.file.name, p.file.size, p.file.lastModified, p.skill]),
  });
}

export function missingMediaMessage(ref: JSONImportMediaRef): string {
  return `Thiếu file media "${ref.value}" (${ref.file} ${ref.pointer})`;
}

export function toRequest(name: string, picked: PickedJSONFile[]): JSONImportRequest {
  const files: JSONImportFileInput[] = picked.map((p) => {
    if (!p.skill) {
      throw new Error("Chưa chọn kỹ năng cho file " + p.file.name);
    }
    return { filename: p.file.name, skill: p.skill, content: p.content };
  });
  return { name, files };
}
