import { uploadAndApplyMedia } from "./media";
import { matchMediaRefs, toRequest } from "./prepare";
import type { LoadedZipFolder } from "./zip";
import type {
  JSONImportCreatedSet,
  JSONImportMediaRef,
  JSONImportRequest,
  JSONImportResult,
  JSONImportValidateResponse,
  MediaMatch,
} from "./types";

export interface ZipFolderCheck {
  report: JSONImportValidateResponse;
  matches: MediaMatch[];
  missing: JSONImportMediaRef[];
}

export function localBlockers(folder: LoadedZipFolder): string[] {
  const blockers = folder.skillError ? [folder.skillError] : [];
  for (const p of folder.picked) {
    if (p.parseError) blockers.push(`${p.file.name}: ${p.parseError}`);
  }
  return blockers;
}

export async function checkZipFolder(
  folder: LoadedZipFolder,
  validate: (body: JSONImportRequest) => Promise<JSONImportValidateResponse>,
): Promise<ZipFolderCheck> {
  const report = await validate(toRequest(folder.name, folder.picked));
  const { matches, missing } = matchMediaRefs(report.media_refs, folder.media);
  return { report, matches, missing };
}

export function isImportable(folder: LoadedZipFolder, check: ZipFolderCheck | null): boolean {
  return (
    check !== null &&
    localBlockers(folder).length === 0 &&
    check.report.problems.length === 0 &&
    check.missing.length === 0
  );
}

export class ZipImportError extends Error {
  readonly writing: boolean;

  constructor(cause: unknown, writing: boolean) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "ZipImportError";
    this.writing = writing;
  }
}

export async function importZipFolder(
  folder: LoadedZipFolder,
  check: ZipFolderCheck,
  upload: (file: File) => Promise<string>,
  importSets: (body: JSONImportRequest) => Promise<JSONImportResult>,
  onUpload?: (done: number, total: number) => void,
): Promise<JSONImportCreatedSet[]> {
  const request = toRequest(folder.name, folder.picked);
  let files;
  try {
    files = await uploadAndApplyMedia(request.files, check.matches, upload, onUpload);
  } catch (err) {
    throw new ZipImportError(err, false);
  }
  try {
    return (await importSets({ name: folder.name, files })).sets;
  } catch (err) {
    throw new ZipImportError(err, true);
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
