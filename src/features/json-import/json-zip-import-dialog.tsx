"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { jsonImportApi, uploadJSONImportMedia } from "./api";
import { readZip, type LoadedZipFolder } from "./zip";
import { checkZipFolder, importZipFolder, isImportable, localBlockers, mapLimit, ZipImportError, type ZipFolderCheck } from "./zip-flow";
import { JSONImportReport } from "./json-import-report";
import type { JSONImportCreatedSet } from "./types";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const DUPLICATE_WARNING =
  "Một số bộ đề có thể đã được tạo — kiểm tra danh sách bộ đề trước khi nhập lại để tránh trùng.";

type FolderState =
  | { phase: "blocked" }
  | { phase: "checking" }
  | { phase: "check_failed"; message: string }
  | { phase: "checked"; check: ZipFolderCheck }
  | { phase: "importing"; check: ZipFolderCheck; upload: { done: number; total: number } | null }
  | { phase: "imported"; check: ZipFolderCheck; sets: JSONImportCreatedSet[] }
  | { phase: "failed"; check: ZipFolderCheck; message: string };

function importFailureMessage(err: unknown): string {
  const zipErr = err instanceof ZipImportError ? err : null;
  const cause = zipErr ? zipErr.cause : err;
  const message = errorMessage(cause);
  if (!zipErr?.writing) return message;
  if (isApiError(cause) && (cause.status < 500 || cause.code === "json_import_partial")) return message;
  return `${message} ${DUPLICATE_WARNING}`;
}

function statusBadge(state: FolderState | undefined, stopped: boolean): { tone: BadgeProps["tone"]; label: string } {
  switch (state?.phase) {
    case "blocked":
      return { tone: "error", label: "Lỗi" };
    case "checking":
    case undefined:
      return { tone: "gray", label: "Đang kiểm tra…" };
    case "check_failed":
      return { tone: "error", label: "Không kiểm tra được" };
    case "importing":
      return { tone: "info", label: "Đang nhập…" };
    case "imported":
      return { tone: "success", label: `Đã nhập ${state.sets.length} bộ` };
    case "failed":
      return { tone: "error", label: "Lỗi khi nhập" };
    case "checked": {
      const { report, missing } = state.check;
      if (report.problems.length > 0) return { tone: "error", label: `${report.problems.length} lỗi` };
      if (missing.length > 0) return { tone: "warning", label: `Thiếu ${missing.length} media` };
      if (stopped) return { tone: "gray", label: "Chưa nhập" };
      return { tone: "success", label: `Hợp lệ · ${report.plan.length} bộ` };
    }
  }
}

export function JSONZipImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [zipName, setZipName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [folders, setFolders] = useState<LoadedZipFolder[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, FolderState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<{ index: number; total: number; name: string } | null>(null);
  const [stopped, setStopped] = useState(false);

  const setState = (key: string, state: FolderState) => setStates((prev) => ({ ...prev, [key]: state }));

  const reset = () => {
    setZipName(null);
    setReading(false);
    setReadError(null);
    setFolders([]);
    setIgnored([]);
    setStates({});
    setSelected(new Set());
    setExpanded(new Set());
    setRunning(null);
    setStopped(false);
  };

  const handleClose = () => {
    if (running || reading) return;
    reset();
    onClose();
  };

  const handlePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    reset();
    setZipName(file.name);
    setReading(true);

    let loaded: Awaited<ReturnType<typeof readZip>>;
    try {
      loaded = await readZip(file);
    } catch (err) {
      setReadError(errorMessage(err));
      setReading(false);
      return;
    }
    setFolders(loaded.folders);
    setIgnored(loaded.ignored);
    const initial: Record<string, FolderState> = {};
    for (const f of loaded.folders) {
      initial[f.key] = localBlockers(f).length > 0 ? { phase: "blocked" } : { phase: "checking" };
    }
    setStates(initial);
    setReading(false);

    const toCheck = loaded.folders.filter((f) => localBlockers(f).length === 0);
    await mapLimit(toCheck, 3, async (folder) => {
      try {
        const check = await checkZipFolder(folder, jsonImportApi.validate);
        setState(folder.key, { phase: "checked", check });
        if (isImportable(folder, check)) {
          setSelected((prev) => new Set(prev).add(folder.key));
        }
      } catch (err) {
        setState(folder.key, { phase: "check_failed", message: errorMessage(err) });
      }
    });
  };

  const isSelectable = (folder: LoadedZipFolder) => {
    const state = states[folder.key];
    return state?.phase === "checked" && isImportable(folder, state.check);
  };

  const queue = folders.filter((f) => selected.has(f.key) && isSelectable(f));

  const toggleSelected = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleImport = async () => {
    const todo = queue;
    let createdAny = false;
    for (let i = 0; i < todo.length; i++) {
      const folder = todo[i];
      const state = states[folder.key];
      if (state?.phase !== "checked") continue;
      const { check } = state;
      setRunning({ index: i + 1, total: todo.length, name: folder.name });
      setState(folder.key, { phase: "importing", check, upload: null });
      try {
        const sets = await importZipFolder(folder, check, uploadJSONImportMedia, jsonImportApi.importSets, (done, total) =>
          setState(folder.key, { phase: "importing", check, upload: { done, total } }),
        );
        createdAny = true;
        setState(folder.key, { phase: "imported", check, sets });
      } catch (err) {
        if (err instanceof ZipImportError && err.writing) createdAny = true;
        setState(folder.key, { phase: "failed", check, message: importFailureMessage(err) });
        setStopped(true);
        break;
      }
    }
    setSelected(new Set());
    setRunning(null);
    if (createdAny) qc.invalidateQueries({ queryKey: ["catalog-sets"] });
  };

  const checking = folders.some((f) => states[f.key]?.phase === "checking");
  const importedCount = folders.filter((f) => states[f.key]?.phase === "imported").length;

  return (
    <Dialog open={open} onClose={handleClose} title="Import ZIP" size="xl">
      <DialogBody className="space-y-5">
        <div>
          <input
            type="file"
            accept=".zip,application/zip"
            aria-label="Chọn file zip chứa các thư mục đề"
            data-testid="zip-import-file"
            onChange={handlePick}
            disabled={reading || !!running}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
          />
          <p className="mt-1 text-xs text-ink-500">
            Mỗi thư mục chứa file .json là 1 đề, tên đề = tên thư mục. Đặt ảnh/audio của đề trong cùng thư mục đó.
            File khác (pdf, docx…) được bỏ qua.
          </p>
        </div>

        {reading && <p className="text-sm text-ink-600">Đang đọc {zipName}…</p>}

        {readError && (
          <p data-testid="zip-import-read-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
            {readError}
          </p>
        )}

        {zipName && !reading && !readError && folders.length === 0 && (
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
            Không tìm thấy thư mục nào có file .json trong {zipName}.
          </p>
        )}

        {folders.length > 0 && (
          <ul data-testid="zip-folder-list" className="flex flex-col gap-2">
            {folders.map((folder, i) => {
              const state = states[folder.key];
              const badge = statusBadge(state, stopped);
              const blockers = localBlockers(folder);
              const check = state && "check" in state ? state.check : null;
              const isOpen = expanded.has(folder.key);
              return (
                <li key={folder.key} data-testid={`zip-folder-${i}`} className="rounded-lg border border-ink-200 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      data-testid={`zip-folder-check-${i}`}
                      aria-label={`Chọn đề ${folder.name}`}
                      checked={selected.has(folder.key)}
                      disabled={!isSelectable(folder) || !!running}
                      onChange={() => toggleSelected(folder.key)}
                      className="size-4 accent-brand-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-800">{folder.name}</p>
                      <p className="truncate text-xs text-ink-500">
                        {folder.picked.map((p) => p.file.name).join(", ")} · {folder.media.length} media
                        {folder.key && folder.key !== folder.name ? ` · ${folder.key}` : ""}
                      </p>
                    </div>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <button
                      type="button"
                      data-testid={`zip-folder-toggle-${i}`}
                      onClick={() => toggleExpanded(folder.key)}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      {isOpen ? "Thu gọn" : "Chi tiết"}
                    </button>
                  </div>

                  {state?.phase === "importing" && state.upload && (
                    <p className="mt-1 text-xs text-ink-600">
                      Đang upload {state.upload.done}/{state.upload.total}
                    </p>
                  )}

                  {state?.phase === "imported" && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {state.sets.map((set) => (
                        <li key={set.id}>
                          <Link href={`/banks/${set.id}`} data-testid={`zip-created-${set.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                            {set.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  {state?.phase === "failed" && (
                    <p data-testid={`zip-folder-error-${i}`} className="mt-2 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
                      {state.message}
                    </p>
                  )}

                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-ink-100 pt-3">
                      {blockers.map((b) => (
                        <p key={b} className="text-sm text-error-600">
                          {b}
                        </p>
                      ))}
                      {state?.phase === "check_failed" && <p className="text-sm text-error-600">{state.message}</p>}
                      {check && <JSONImportReport report={check.report} matches={check.matches} missing={check.missing} />}
                      {folder.ignored.length > 0 && (
                        <p className="text-xs text-ink-500">Bỏ qua: {folder.ignored.join(", ")}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {ignored.length > 0 && (
          <p className="text-xs text-ink-500">
            Bỏ qua {ignored.length} file ngoài các thư mục đề: {ignored.slice(0, 5).join(", ")}
            {ignored.length > 5 ? "…" : ""}
          </p>
        )}

        {running && (
          <p data-testid="zip-import-progress" className="text-sm text-ink-600">
            Đang nhập {running.index}/{running.total}: {running.name}
          </p>
        )}

        {importedCount > 0 && !running && (
          <p className="text-xs text-ink-500">
            Đã nhập {importedCount} đề. Các bộ đề đang ở trạng thái nháp — mở từng bộ để kiểm tra rồi xuất bản.
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" data-testid="zip-import-submit" onClick={handleImport} disabled={queue.length === 0 || !!running || checking}>
          {running ? "Đang nhập…" : `Nhập ${queue.length} đề đã chọn`}
        </Button>
        {zipName && !running && (
          <Button type="button" variant="outline" onClick={reset} disabled={reading}>
            Nhập zip khác
          </Button>
        )}
        <Button type="button" variant="outline" onClick={handleClose} disabled={!!running || reading}>
          Đóng
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
