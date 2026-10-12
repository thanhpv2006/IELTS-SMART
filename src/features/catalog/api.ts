import { apiFetch } from "@/lib/api/client";
import type {
  CatalogCategory,
  CatalogImportResult,
  CatalogQuestion,
  CatalogQuestionFilter,
  CatalogQuestionSet,
  CatalogQuestionSetDetail,
  CatalogSetFilter,
  CatalogStatus,
  CreateCatalogCategoryBody,
  CreateCatalogQuestionBody,
  CreateCatalogSetBody,
  UpdateCatalogQuestionBody,
  UpdateCatalogSetBody,
} from "./types";
import { normalizeKind } from "./types";

// ─── Questions ───────────────────────────────────────────────────────────────

const questionApi = {
  list: async (filter?: CatalogQuestionFilter) => {
    const { items } = await apiFetch<{ items: CatalogQuestion[] }>("/smart/catalog/questions", {
      query: filter,
    });
    return items;
  },
  create: (body: CreateCatalogQuestionBody) =>
    apiFetch<{ id: string }>("/smart/catalog/questions", { method: "POST", body }),
  get: (id: string) => apiFetch<CatalogQuestion>(`/smart/catalog/questions/${id}`),
  update: (id: string, body: UpdateCatalogQuestionBody) =>
    apiFetch<void>(`/smart/catalog/questions/${id}`, { method: "PATCH", body }),
  setStatus: (id: string, status: CatalogStatus) =>
    apiFetch<void>(`/smart/catalog/questions/${id}/status`, { method: "POST", body: { status } }),
};

async function listSetsPage(filter?: CatalogSetFilter) {
  const { items, total } = await apiFetch<{ items: CatalogQuestionSet[]; total: number }>(
    "/smart/catalog/question-sets",
    { query: filter },
  );
  return { items: items.map((it) => ({ ...it, kind: normalizeKind(it.kind) })), total };
}

const BACKEND_MAX_SET_PAGE = 200;

async function listAllSets(filter?: CatalogSetFilter) {
  const pageAt = (offset: number) => listSetsPage({ ...filter, limit: BACKEND_MAX_SET_PAGE, offset });
  const first = await pageAt(0);
  const offsets: number[] = [];
  for (let offset = BACKEND_MAX_SET_PAGE; offset < first.total; offset += BACKEND_MAX_SET_PAGE) offsets.push(offset);
  const rest = await Promise.all(offsets.map(pageAt));
  // A set created between page requests shifts later offsets, so the same set can come back twice.
  const byId = new Map([first, ...rest].flatMap((page) => page.items).map((set) => [set.id, set]));
  return [...byId.values()];
}

const questionSetApi = {
  listSets: listAllSets,
  listSetsPage,
  createSet: (body: CreateCatalogSetBody) =>
    apiFetch<{ id: string }>("/smart/catalog/question-sets", { method: "POST", body }),
  getSet: async (id: string) => {
    const res = await apiFetch<CatalogQuestionSetDetail>(`/smart/catalog/question-sets/${id}`);
    return { ...res, kind: normalizeKind(res.kind) };
  },
  updateSet: (id: string, body: UpdateCatalogSetBody) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}`, { method: "PATCH", body }),
  setItems: (id: string, questionIds: string[]) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}/items`, {
      method: "PUT",
      body: { question_ids: questionIds },
    }),
  publishSet: (id: string) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}/status`, {
      method: "POST",
      body: { status: "published" },
    }),
  setPractice: (id: string, enabled: boolean) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}/practice`, { method: "PATCH", body: { enabled } }),
  archiveSet: (id: string) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}/status`, {
      method: "POST",
      body: { status: "archived" },
    }),
  restoreSet: (id: string) =>
    apiFetch<void>(`/smart/catalog/question-sets/${id}/status`, {
      method: "POST",
      body: { status: "draft" },
    }),
  deleteSet: (id: string) => apiFetch<void>(`/smart/catalog/question-sets/${id}`, { method: "DELETE" }),
  addItem: (
    setId: string,
    body: { part: number; sequence: number; prompt: string; stimulus_url?: string; examiner_audio_url?: string },
  ) => apiFetch<{ id: string }>(`/smart/catalog/question-sets/${setId}/items`, { method: "POST", body }),
  updateItem: (
    itemId: string,
    body: { part?: number; sequence?: number; prompt: string; stimulus_url?: string; examiner_audio_url?: string },
  ) => apiFetch<void>(`/smart/catalog/question-sets/items/${itemId}`, { method: "PATCH", body }),
  deleteItem: (itemId: string) =>
    apiFetch<void>(`/smart/catalog/question-sets/items/${itemId}`, { method: "DELETE" }),
};

// ─── Categories ──────────────────────────────────────────────────────────────

const categoryApi = {
  listCategories: async () => {
    const { items } = await apiFetch<{ items: CatalogCategory[] }>("/smart/catalog/topic-categories");
    return items;
  },
  createCategory: (body: CreateCatalogCategoryBody) =>
    apiFetch<{ id: string }>("/smart/catalog/topic-categories", { method: "POST", body }),
};

// ─── Import ──────────────────────────────────────────────────────────────────

const importApi = {
  import: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<CatalogImportResult>("/smart/catalog/import", { method: "POST", body: form });
  },
  // Unified set import. `importType` (reading/listening/speaking/writing) tells
  // the backend which per-skill format to parse and forces the skill; omit it
  // for the legacy flat format (skill read from the "Kỹ năng" column).
  // `targetSetId`, when set, appends the parsed questions into that existing
  // full_test set instead of creating a new set (full-test-excel-import).
  importXlsx: (
    file: File,
    opts?: { importType?: ImportSkill; targetSetId?: string; practiceEnabled?: boolean },
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (opts?.importType) form.append("import_type", opts.importType);
    if (opts?.targetSetId) form.append("target_set_id", opts.targetSetId);
    if (opts?.practiceEnabled) form.append("practice_enabled", "true");
    return apiFetch<CatalogImportResult>("/smart/catalog/question-sets/import", { method: "POST", body: form });
  },
};

export type ImportSkill = "reading" | "listening" | "writing" | "speaking";

export const catalogApi = {
  ...questionApi,
  ...questionSetApi,
  ...categoryApi,
  ...importApi,
};
