import { apiFetch } from "@/lib/api/client";
import type {
  AIImportJob,
  AIImportJobFilter,
  AIImportRegion,
  StartAIImportBody,
  UpdateAIImportResultBody,
} from "./types";

const BASE = "/smart/catalog/ai-import";

export const aiImportApi = {
  start: (body: StartAIImportBody) => apiFetch<{ job_id: string }>(BASE, { method: "POST", body }),
  list: (filter?: AIImportJobFilter) =>
    apiFetch<{ items: AIImportJob[]; total: number }>(BASE, { query: filter }),
  get: (id: string) => apiFetch<AIImportJob>(`${BASE}/${id}`),
  updateResult: (id: string, body: UpdateAIImportResultBody) =>
    apiFetch<AIImportJob>(`${BASE}/${id}/result`, { method: "PATCH", body }),
  // The classification checkpoint: whatever regions the reviewer leaves on screen become the
  // job's regions, and the build phase is enqueued from there.
  confirmClassification: (id: string, regions: AIImportRegion[]) =>
    apiFetch<void>(`${BASE}/${id}/classification`, { method: "POST", body: { regions } }),
  confirm: (id: string) =>
    apiFetch<{ question_set_id: string }>(`${BASE}/${id}/confirm`, { method: "POST" }),
  // The only escape from a job stuck mid-run: the centre has a single active-import slot, and
  // without cancel a stuck job holds it forever (see CancelAIImportHandler).
  cancel: (id: string) => apiFetch<void>(`${BASE}/${id}/cancel`, { method: "POST" }),
};

export type AIImportMediaType = "document" | "image" | "audio";

// Every AI-import source file (paper/answer/audio/image) and every S/W draft
// image share this one endpoint — only media_type differs per slot, and the
// backend only accepts application/pdf + the DOCX mime for "document".
export function presignAIImportUpload(mediaType: AIImportMediaType, file: File) {
  return apiFetch<{ upload_url: string; public_url: string; key: string }>("/media/presign-upload", {
    method: "POST",
    body: {
      media_type: mediaType,
      content_type: file.type,
      folder: "ai-import",
      filename: file.name,
    },
  });
}
