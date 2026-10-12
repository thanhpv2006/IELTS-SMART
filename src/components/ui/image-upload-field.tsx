"use client";

import { useRef, useState } from "react";
import { mediaApi } from "@/features/partner/api";
import { cn } from "@/lib/utils";

type Props = {
  value?: string;
  onChange: (url: string | undefined) => void;
  className?: string;
};

const ACCEPTED = "image/jpeg,image/png,image/gif,image/webp";

export function ImageUploadField({ value, onChange, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const { upload_url, public_url } = await mediaApi.presignUpload({
        media_type: "image",
        content_type: file.type,
      });
      const res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
      onChange(public_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload thất bại");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {!value && (
          <span className="min-w-0 flex-1 text-sm text-ink-400">
            Chưa có ảnh — bấm Upload để tải ảnh minh hoạ (JPG/PNG/WebP)
          </span>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 disabled:opacity-60"
        >
          {uploading ? "Đang tải..." : "Upload"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="shrink-0 rounded-lg border border-red-200 px-2.5 py-2 text-xs text-red-500 hover:bg-red-50"
          >
            Xoá
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="stimulus preview"
          className="max-h-40 rounded-lg border border-ink-100 object-contain"
        />
      )}
    </div>
  );
}
