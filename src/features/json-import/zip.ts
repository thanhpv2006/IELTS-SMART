import { BlobReader, BlobWriter, configure, TextWriter, ZipReader, type FileEntry } from "@zip.js/zip.js";
import { contentTypeForName, detectSkill, mediaBasename, parseJSONText } from "./prepare";
import type { PickedJSONFile } from "./types";

// Native DecompressionStream already keeps inflation off the main thread; zip.js workers would
// also need blob: script URLs that a Content-Security-Policy can refuse.
configure({ useWebWorkers: false });

export interface ZipFolderEntries {
  key: string;
  name: string;
  jsonPaths: string[];
  mediaPaths: string[];
  ignored: string[];
}

export interface LoadedZipFolder {
  key: string;
  name: string;
  picked: PickedJSONFile[];
  media: File[];
  ignored: string[];
  skillError: string | null;
}

function isJSONPath(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

function isSkippedPath(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith(".") || segment === "__MACOSX");
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function nearestGroup(dir: string, groups: Set<string>): string | null {
  for (let current = dir; ; current = dirOf(current)) {
    if (groups.has(current)) return current;
    if (current === "") return null;
  }
}

function groupName(key: string, zipName: string): string {
  if (key === "") return mediaBasename(zipName).replace(/\.zip$/i, "");
  return key.slice(key.lastIndexOf("/") + 1);
}

export function groupZipEntries(paths: string[], zipName: string): { folders: ZipFolderEntries[]; ignored: string[] } {
  const files = paths.filter((p) => !p.endsWith("/") && !isSkippedPath(p));
  const groupKeys = new Set(files.filter(isJSONPath).map(dirOf));
  const folders = new Map<string, ZipFolderEntries>(
    [...groupKeys].map((key) => [key, { key, name: groupName(key, zipName), jsonPaths: [], mediaPaths: [], ignored: [] }]),
  );
  const ignored: string[] = [];

  for (const path of files) {
    if (isJSONPath(path)) {
      folders.get(dirOf(path))!.jsonPaths.push(path);
      continue;
    }
    const owner = nearestGroup(dirOf(path), groupKeys);
    if (owner === null) {
      ignored.push(path);
      continue;
    }
    const folder = folders.get(owner)!;
    (contentTypeForName(path) !== null ? folder.mediaPaths : folder.ignored).push(path);
  }

  const sorted = [...folders.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }) || a.key.localeCompare(b.key),
  );
  return { folders: sorted, ignored };
}

function missingSkillMessage(filename: string): string {
  return `Không nhận ra kỹ năng của file ${filename}. Đặt tên file là listening/reading/writing/speaking.json.`;
}

async function readJSONEntry(entry: FileEntry, path: string): Promise<PickedJSONFile> {
  const text = await entry.getData(new TextWriter());
  const name = mediaBasename(path);
  const file = new File([text], name, { type: "application/json" });
  const parsed = parseJSONText(text);
  return parsed.ok
    ? { file, skill: detectSkill(name), content: parsed.content, parseError: null }
    : { file, skill: detectSkill(name), content: null, parseError: parsed.message };
}

async function readMediaEntry(entry: FileEntry, path: string): Promise<File> {
  const type = contentTypeForName(path) ?? "application/octet-stream";
  const blob = await entry.getData(new BlobWriter(type));
  return new File([blob], mediaBasename(path), { type });
}

async function loadFolder(group: ZipFolderEntries, byPath: Map<string, FileEntry>): Promise<LoadedZipFolder> {
  const picked = await Promise.all(group.jsonPaths.map((p) => readJSONEntry(byPath.get(p)!, p)));
  const media = await Promise.all(group.mediaPaths.map((p) => readMediaEntry(byPath.get(p)!, p)));
  if (picked.length === 1 && picked[0].skill === null) {
    picked[0] = { ...picked[0], skill: detectSkill(group.name) };
  }
  const unknown = picked.find((p) => p.skill === null);
  return {
    key: group.key,
    name: group.name,
    picked,
    media,
    ignored: group.ignored,
    skillError: unknown ? missingSkillMessage(unknown.file.name) : null,
  };
}

export async function readZip(file: File): Promise<{ folders: LoadedZipFolder[]; ignored: string[] }> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const byPath = new Map<string, FileEntry>();
    for (const entry of entries) {
      if (!entry.directory) byPath.set(entry.filename.replace(/\\/g, "/"), entry);
    }
    const grouping = groupZipEntries([...byPath.keys()], file.name);
    const folders: LoadedZipFolder[] = [];
    for (const group of grouping.folders) {
      folders.push(await loadFolder(group, byPath));
    }
    return { folders, ignored: grouping.ignored };
  } catch (err) {
    throw new Error("Không đọc được file zip: " + (err instanceof Error ? err.message : String(err)));
  } finally {
    await reader.close().catch(() => undefined);
  }
}
