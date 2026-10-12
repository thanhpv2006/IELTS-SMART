import { apiFetch } from "@/lib/api/client";
import { mediaApi } from "@/features/partner/api";
import { contentTypeOf, mediaKindOf } from "./prepare";
import type { JSONImportRequest, JSONImportResult, JSONImportValidateResponse } from "./types";

export const jsonImportApi = {
  validate: (body: JSONImportRequest) =>
    apiFetch<JSONImportValidateResponse>("/smart/catalog/json-import/validate", { method: "POST", body }),
  importSets: (body: JSONImportRequest) =>
    apiFetch<JSONImportResult>("/smart/catalog/json-import", { method: "POST", body }),
};

export async function uploadJSONImportMedia(file: File): Promise<string> {
  const kind = mediaKindOf(file);
  const type = contentTypeOf(file);
  if (!kind || !type) {
    throw new Error("Định dạng file không hỗ trợ: " + file.name);
  }

  const { upload_url, public_url } = await mediaApi.presignUpload({ media_type: kind, content_type: type });
  let res: Response;
  try {
    res = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": type }, body: file });
  } catch {
    throw new Error(`Upload thất bại (không kết nối được kho lưu trữ): ${file.name}`);
  }
  if (!res.ok) {
    throw new Error(`Upload thất bại (${res.status}): ${file.name}`);
  }
  return public_url;
}
