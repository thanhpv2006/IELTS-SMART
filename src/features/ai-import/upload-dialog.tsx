"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { aiImportApi, presignAIImportUpload, type AIImportMediaType } from "./api";
import type { AIImportSourceFile } from "./types";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Mirrors the /media/presign-upload whitelist. Checked here as well because the presign
// endpoint's media_type buckets accept anything in their own bucket, and a file the pipeline
// cannot read should cost neither an upload nor a paid run.
const ACCEPTED: Record<string, AIImportMediaType> = {
  "application/pdf": "document",
  [DOCX_MIME]: "document",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "audio/webm": "audio",
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
};

const ACCEPT_ATTR = ".pdf,.docx,.mp3,.wav,.m4a,.webm,.jpg,.jpeg,.png,.gif,.webp";

/** Rejects a file the pipeline cannot read, before it costs an upload and a paid run. */
export function unsupportedFileMessage(contentType: string): string | null {
  if (ACCEPTED[contentType]) return null;
  return contentType
    ? `Không hỗ trợ định dạng ${contentType} — chỉ nhận PDF, DOCX, mp3/wav/m4a/webm, jpg/png/gif/webp.`
    : "Không nhận diện được định dạng file — chỉ nhận PDF, DOCX, mp3/wav/m4a/webm, jpg/png/gif/webp.";
}

type PoolItem = {
  id: string;
  filename: string;
  bytes: number;
  contentType: string;
} & (
  | { status: "uploading" }
  | { status: "done"; key: string }
  | { status: "failed"; error: string }
);

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}

export function UploadDialog({ open, onClose, onCreated }: UploadDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [items, setItems] = useState<PoolItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nextId = useRef(0);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const patchItem = (id: string, patch: Partial<PoolItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...patch } as PoolItem) : it)));
  };

  const addFiles = (files: File[]) => {
    setFormError(null);
    for (const file of files) {
      const id = `f${nextId.current++}`;
      const base = { id, filename: file.name, bytes: file.size, contentType: file.type };
      const unsupported = unsupportedFileMessage(file.type);
      if (unsupported) {
        setItems((prev) => [...prev, { ...base, status: "failed", error: unsupported }]);
        continue;
      }
      setItems((prev) => [...prev, { ...base, status: "uploading" }]);
      void upload(id, file);
    }
  };

  const upload = async (id: string, file: File) => {
    try {
      const { upload_url, key } = await presignAIImportUpload(ACCEPTED[file.type], file);
      const res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      // A failed PUT that goes unnoticed here would submit a job pointing at a key that was
      // never written to storage — the paid pipeline would only discover it minutes later.
      if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
      patchItem(id, { status: "done", key });
    } catch (e) {
      patchItem(id, { status: "failed", error: errorMessage(e) });
    }
  };

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(picked);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  // kind is "unknown" for every file: the customer classifies nothing, the backend derives the
  // role from the content (ClassifySources) and the reviewer confirms it at the checkpoint.
  const sourceFiles = (): AIImportSourceFile[] =>
    items.flatMap((it) =>
      it.status === "done"
        ? [{ kind: "unknown" as const, key: it.key, filename: it.filename, content_type: it.contentType }]
        : [],
    );

  const uploading = items.some((it) => it.status === "uploading");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Vui lòng nhập tên đề.");
      return;
    }
    if (!slug.trim()) {
      setFormError("Vui lòng nhập slug.");
      return;
    }
    if (uploading) {
      setFormError("Đang tải file lên, vui lòng đợi.");
      return;
    }
    const files = sourceFiles();
    if (files.length === 0) {
      setFormError("Chưa có file nào tải lên thành công.");
      return;
    }

    setSubmitting(true);
    try {
      const { job_id } = await aiImportApi.start({ slug: slug.trim(), name: name.trim(), files });
      onCreated(job_id);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} title="Import đề bằng AI" size="lg">
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-5">
          <p className="text-sm text-ink-600">
            Tải lên tất cả file của đề — đề, đáp án, giải thích, audio, ảnh — không cần phân loại. AI sẽ tự nhận
            diện từng file, bạn xác nhận lại bảng nhận diện trước khi nó soạn câu hỏi.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Tên đề <span className="text-brand-500">*</span>
              </label>
              <input
                data-testid="ai-import-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="VD: Cambridge 19 Test 2"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Slug <span className="text-brand-500">*</span>
              </label>
              <input
                data-testid="ai-import-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder="cambridge-19-test-2"
                className={inputCls}
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-brand-500 bg-brand-50/60" : "border-ink-200",
            )}
          >
            <p className="text-sm font-medium text-ink-700">Kéo thả file vào đây hoặc chọn từ máy</p>
            <p className="mt-1 mb-3 text-xs text-ink-500">
              PDF, DOCX, mp3/wav/m4a/webm, jpg/png/gif/webp — chọn được nhiều file một lượt
            </p>
            <input
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              data-testid="ai-import-files"
              onChange={handlePick}
              className={cn(
                "mx-auto block w-full max-w-sm text-sm text-ink-600",
                "file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100",
              )}
            />
          </div>

          {items.length > 0 && (
            <ul data-testid="ai-import-pool" className="space-y-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  data-testid={`ai-import-pool-item-${it.filename}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{it.filename}</p>
                    <p className="text-xs text-ink-500">
                      {humanBytes(it.bytes)}
                      {it.contentType ? ` · ${it.contentType}` : ""}
                    </p>
                    {it.status === "failed" && (
                      <p
                        data-testid={`ai-import-pool-error-${it.filename}`}
                        className="mt-0.5 text-xs text-error-600"
                      >
                        {it.error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {it.status === "uploading" && <Badge tone="info">Đang tải…</Badge>}
                    {it.status === "done" && <Badge tone="success">Đã tải lên</Badge>}
                    {it.status === "failed" && <Badge tone="error">Lỗi</Badge>}
                    <button
                      type="button"
                      data-testid={`ai-import-pool-remove-${it.filename}`}
                      onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                      className="text-xs font-medium text-ink-500 hover:text-error-600"
                    >
                      Xoá
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {formError && (
            <p data-testid="ai-import-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
              {formError}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button data-testid="ai-import-submit" type="submit" disabled={submitting || uploading}>
            {submitting ? "Đang tạo…" : "Tạo job"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
