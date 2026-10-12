"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "@/features/partner/api";

/**
 * Generic XLSX import dialog: uploads a file, shows the per-row result and any
 * auto-generated passwords. Used by the management screens (teachers, students,
 * classes, banks). `columns` describes the expected file layout to the user.
 */
export function ImportDialog({
  title,
  columns,
  importFn,
  invalidateKeys,
  templateHref,
  onClose,
}: {
  title: string;
  columns: React.ReactNode;
  importFn: (file: File) => Promise<ImportResult>;
  invalidateKeys: string[][];
  templateHref?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: importFn,
    onSuccess: (res) => {
      setResult(res);
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open onClose={onClose} title={title} size="sm">
      <DialogBody className="space-y-4">
        <p className="text-sm text-ink-600">{columns}</p>
        {templateHref && (
          <a
            href={templateHref}
            download
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            <Download className="size-4" /> Tải file mẫu
          </a>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError(null);
            setResult(null);
            mutation.mutate(file);
          }}
          className="w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
        />
        {mutation.isPending && <p className="text-sm text-ink-500">Đang nhập...</p>}
        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
        {result && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-success-700">✓ {result.imported} thành công</span>
              {result.skipped > 0 && <span className="text-ink-400">{result.skipped} bỏ qua</span>}
              {(result.errors ?? []).length > 0 && <span className="text-error-700">{result.errors.length} lỗi</span>}
            </div>
            {(result.errors ?? []).length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700">
                {result.errors.map((e, i) => <p key={i}>Dòng {e.row}: {e.reason}</p>)}
              </div>
            )}
            {(result.generated_passwords ?? []).length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-ink-600">Mật khẩu tự sinh:</p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 font-mono text-xs">
                  {result.generated_passwords.map((c, i) => <p key={i}>{c.email}: <span className="font-semibold">{c.password}</span></p>)}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Đóng</Button>
      </DialogFooter>
    </Dialog>
  );
}
