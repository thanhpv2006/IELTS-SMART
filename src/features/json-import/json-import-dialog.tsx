"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { jsonImportApi, uploadJSONImportMedia } from "./api";
import { uploadAndApplyMedia } from "./media";
import {
  contentTypeOf,
  detectSkill,
  inputSignature,
  isJSONFile,
  matchMediaRefs,
  parseJSONText,
  readFileText,
  toRequest,
} from "./prepare";
import { JSONImportReport } from "./json-import-report";
import { JSON_IMPORT_SKILLS, type JSONImportCreatedSet, type JSONImportSkill, type JSONImportValidateResponse, type PickedJSONFile } from "./types";
import { SkillPreviewOverlay } from "@/features/preview/skill-preview-overlay";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const SKILL_LABELS: Record<JSONImportSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

const KIND_LABELS: Record<JSONImportCreatedSet["kind"], string> = {
  full_test: "Full test",
  practice: "Luyện tập",
};

type Busy = "validating" | "uploading" | "importing" | null;

function replaceByName<T>(items: T[], incoming: T[], nameOf: (item: T) => string): T[] {
  const names = new Set(incoming.map(nameOf));
  return [...items.filter((item) => !names.has(nameOf(item))), ...incoming];
}

async function readPickedJSONFile(file: File): Promise<PickedJSONFile> {
  const skill = detectSkill(file.name);
  try {
    const parsed = parseJSONText(await readFileText(file));
    return parsed.ok
      ? { file, skill, content: parsed.content, parseError: null }
      : { file, skill, content: null, parseError: parsed.message };
  } catch (err) {
    return { file, skill, content: null, parseError: errorMessage(err) };
  }
}

export function JSONImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PickedJSONFile[]>([]);
  const [media, setMedia] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<JSONImportValidateResponse | null>(null);
  const [reportSig, setReportSig] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<JSONImportCreatedSet[] | null>(null);
  const [previewSkill, setPreviewSkill] = useState<string | null>(null);

  const signature = useMemo(() => inputSignature(name, picked), [name, picked]);

  // A report describes only the exact input it was validated against; any edit hides it until
  // the next "Kiểm tra".
  const report = reportSig === signature ? lastReport : null;

  const { matches, missing } = useMemo(
    () => (report ? matchMediaRefs(report.media_refs, media) : { matches: [], missing: [] }),
    [report, media],
  );

  const reset = () => {
    setName("");
    setPicked([]);
    setMedia([]);
    setMediaError(null);
    setLastReport(null);
    setReportSig(null);
    setBusy(null);
    setProgress(null);
    setError(null);
    setCreated(null);
    setPreviewSkill(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Dialog listens for Escape on document, so it also fires while the preview overlay is on top.
  const handleDialogDismiss = () => {
    if (previewSkill) {
      setPreviewSkill(null);
      return;
    }
    if (!busy) handleClose();
  };

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";

    const mediaFiles = incoming.filter((f) => !isJSONFile(f));
    const unsupportedMedia = mediaFiles.filter((f) => contentTypeOf(f) === null);
    const supportedMedia = mediaFiles.filter((f) => contentTypeOf(f) !== null);
    setMediaError(
      unsupportedMedia.length > 0
        ? `Định dạng file không hỗ trợ: ${unsupportedMedia.map((f) => f.name).join(", ")}. Chỉ nhận mp3, wav, m4a, webm, jpg, png, gif, webp.`
        : null,
    );
    if (supportedMedia.length > 0) {
      setMedia((prev) => replaceByName(prev, supportedMedia, (f) => f.name));
    }

    const jsonFiles = incoming.filter(isJSONFile);
    if (jsonFiles.length > 0) {
      const entries = await Promise.all(jsonFiles.map(readPickedJSONFile));
      setPicked((prev) => replaceByName(prev, entries, (p) => p.file.name));
    }
  };

  const setPickedSkill = (file: File, value: string) => {
    const skill = (JSON_IMPORT_SKILLS as readonly string[]).includes(value) ? (value as JSONImportSkill) : null;
    setPicked((prev) => prev.map((p) => (p.file === file ? { ...p, skill } : p)));
  };

  const removePicked = (file: File) => setPicked((prev) => prev.filter((p) => p.file !== file));
  const removeMedia = (file: File) => setMedia((prev) => prev.filter((f) => f !== file));

  const canValidate =
    !busy && name.trim() !== "" && picked.length > 0 && picked.every((p) => p.parseError === null && p.skill !== null);

  const handleValidate = async () => {
    setBusy("validating");
    setError(null);
    try {
      const res = await jsonImportApi.validate(toRequest(name, picked));
      setLastReport(res);
      setReportSig(inputSignature(name, picked));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const canImport = !busy && !!report && report.problems.length === 0 && missing.length === 0;

  const handleImport = async () => {
    setError(null);
    let writing = false;
    try {
      setBusy("uploading");
      setProgress({ done: 0, total: new Set(matches.map((m) => m.file)).size });
      const { files } = toRequest(name, picked);
      const uploadedFiles = await uploadAndApplyMedia(files, matches, uploadJSONImportMedia, (done, total) =>
        setProgress({ done, total }),
      );

      setBusy("importing");
      writing = true;
      const result = await jsonImportApi.importSets({ name, files: uploadedFiles });
      setCreated(result.sets);
      qc.invalidateQueries({ queryKey: ["catalog-sets"] });
    } catch (err) {
      if (!writing || (isApiError(err) && err.status < 500)) {
        setError(errorMessage(err));
      } else {
        setLastReport(null);
        setReportSig(null);
        qc.invalidateQueries({ queryKey: ["catalog-sets"] });
        const partial = isApiError(err) && err.code === "json_import_partial";
        setError(
          partial
            ? errorMessage(err)
            : `${errorMessage(err)} Một số bộ đề có thể đã được tạo — kiểm tra danh sách bộ đề trước khi nhập lại để tránh trùng.`,
        );
      }
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const previewSkills = report && report.problems.length === 0 ? [...new Set(report.drafts.map((d) => d.skill))] : [];

  if (created) {
    return (
      <Dialog open={open} onClose={handleClose} title="Đã nhập đề" size="xl">
        <DialogBody className="space-y-3">
          <ul className="flex flex-col gap-2">
            {created.map((set) => (
              <li
                key={set.id}
                className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-sm"
              >
                <Link href={`/banks/${set.id}`} data-testid={`json-import-created-${set.id}`} className="font-medium text-brand-600 hover:underline">
                  {set.title}
                </Link>
                <Badge tone="gray">{KIND_LABELS[set.kind]}</Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-500">
            Các bộ đề đang ở trạng thái nháp — mở từng bộ để kiểm tra rồi xuất bản.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={handleClose}>
            Đóng
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleDialogDismiss} title="Import JSON" size="xl">
      <DialogBody className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Tên đề <span className="text-brand-500">*</span>
          </label>
          <input
            data-testid="json-import-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Cam 21 Test 1"
            className={inputCls}
          />
        </div>

        <div>
          <input
            type="file"
            multiple
            accept=".json,audio/*,image/*"
            aria-label="Chọn file JSON và file media (mp3, ảnh)"
            data-testid="json-import-files"
            onChange={handleFilePick}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {JSON_IMPORT_SKILLS.map((skill) => (
              <a
                key={skill}
                href={`/templates/json/${skill}-mau.json`}
                download
                className="font-medium text-brand-600 hover:underline"
              >
                {SKILL_LABELS[skill]} — Tải file mẫu
              </a>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            File mẫu chỉ minh hoạ định dạng (vài câu). Nhập cả 4 file mẫu cùng lúc sẽ bị báo thiếu câu vì full test
            cần đủ 40 câu Listening và Reading.
          </p>
          {mediaError && (
            <p data-testid="json-import-media-error" className="mt-2 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
              {mediaError}
            </p>
          )}
        </div>

        {picked.length > 0 && (
          <ul data-testid="json-import-json-list" className="flex flex-col gap-2">
            {picked.map((p) => (
              <li
                key={p.file.name}
                data-testid={`json-import-json-row-${p.file.name}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{p.file.name}</p>
                  {p.parseError && (
                    <p data-testid={`json-import-parse-error-${p.file.name}`} className="mt-0.5 text-xs text-error-600">
                      {p.parseError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    data-testid={`json-import-skill-${p.file.name}`}
                    value={p.skill ?? ""}
                    onChange={(e) => setPickedSkill(p.file, e.target.value)}
                    className={inputCls}
                  >
                    <option value="" disabled>
                      Chọn kỹ năng
                    </option>
                    {JSON_IMPORT_SKILLS.map((skill) => (
                      <option key={skill} value={skill}>
                        {SKILL_LABELS[skill]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid={`json-import-remove-json-${p.file.name}`}
                    onClick={() => removePicked(p.file)}
                    className="text-xs font-medium text-ink-500 hover:text-error-600"
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {media.length > 0 && (
          <ul data-testid="json-import-media-list" className="flex flex-col gap-2">
            {media.map((file) => (
              <li
                key={file.name}
                data-testid={`json-import-media-row-${file.name}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
              >
                <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
                <button
                  type="button"
                  data-testid={`json-import-remove-media-${file.name}`}
                  onClick={() => removeMedia(file)}
                  className="text-xs font-medium text-ink-500 hover:text-error-600"
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}

        {report && <JSONImportReport report={report} matches={matches} missing={missing} />}

        {previewSkills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previewSkills.map((skill) => (
              <Button
                key={skill}
                type="button"
                variant="outline"
                size="sm"
                data-testid={`json-import-preview-${skill}`}
                onClick={() => setPreviewSkill(skill)}
              >
                Xem trước {SKILL_LABELS[skill as JSONImportSkill] ?? skill}
              </Button>
            ))}
          </div>
        )}

        {busy === "uploading" && progress && (
          <p className="text-sm text-ink-600">
            Đang upload {progress.done}/{progress.total}
          </p>
        )}

        {error && (
          <p data-testid="json-import-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" data-testid="json-import-validate" onClick={handleValidate} disabled={!canValidate}>
          {busy === "validating" ? "Đang kiểm tra…" : "Kiểm tra"}
        </Button>
        <Button type="button" data-testid="json-import-submit" onClick={handleImport} disabled={!canImport}>
          {busy === "importing" ? "Đang nhập…" : "Nhập đề"}
        </Button>
        <Button type="button" variant="outline" onClick={handleClose} disabled={!!busy}>
          Huỷ
        </Button>
      </DialogFooter>

      {previewSkill && report && (
        <SkillPreviewOverlay
          mode="exam"
          skill={previewSkill}
          questions={report.drafts
            .filter((d) => d.skill === previewSkill)
            .map((d) => ({ skill: d.skill, part: d.part, prompt: d.prompt, metadata: d.metadata }))}
          note="Bản xem trước — file media chưa upload sẽ không phát được."
          onClose={() => setPreviewSkill(null)}
        />
      )}
    </Dialog>
  );
}
