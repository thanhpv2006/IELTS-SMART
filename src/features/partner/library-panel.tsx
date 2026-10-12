"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Search, Eye } from "lucide-react";
import { libraryApi, type LibraryItem, type LibrarySet } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { stripHtml } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/search-pagination";

const LIBRARY_PAGE_SIZE = 12;

const inputCls =
  "rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

type LibraryKind = LibrarySet["kind"];

const KIND_LABELS: Record<LibraryKind, string> = {
  practice: "Luyện tập",
  homework: "BTVN (cũ)",
  exam: "Đề thi (cũ)",
  full_test: "Full test",
};
const SKILL_LABELS: Record<string, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
};
const skillLabel = (s: string) => SKILL_LABELS[s] ?? "Speaking";
const SKILL_TONES: Record<string, "success" | "warning" | "info" | "purple"> = {
  speaking: "success",
  writing: "warning",
  reading: "info",
  listening: "purple",
};
const skillTone = (s: string) => SKILL_TONES[s] ?? "success";
const partLabel = (skill: string, part: number) => {
  if (skill === "writing") return `Task ${part}`;
  if (skill === "reading") return `Passage ${part}`;
  if (skill === "listening") return `Section ${part}`;
  return `Part ${part}`;
};

const FULL_TEST_SKILL_ORDER = ["listening", "reading", "writing", "speaking"] as const;

function groupBySkill(items: LibraryItem[]) {
  return FULL_TEST_SKILL_ORDER.map((skill) => ({
    skill,
    items: items.filter((it) => it.skill === skill),
  })).filter((g) => g.items.length > 0);
}

// The question-set library written by Ielts Smart and shared with every centre. Rendered
// as one tab of the question bank page.
export function LibraryPanel() {
  const qc = useQueryClient();
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["library"],
    queryFn: () => libraryApi.list({ includeFullTest: true }),
  });

  const [kind, setKind] = useState<"" | LibraryKind>("");
  const [skill, setSkill] = useState<"" | "speaking" | "writing" | "reading" | "listening">("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [previewSet, setPreviewSet] = useState<LibrarySet | null>(null);

  const importMut = useMutation({
    mutationFn: (id: string) => libraryApi.import(id),
    onMutate: (id) => {
      setImportingId(id);
      setError(null);
    },
    onSuccess: () => {
      // An imported set is a real bank set → refresh both "Đề của tôi" and the library.
      qc.invalidateQueries({ queryKey: ["library"] });
      qc.invalidateQueries({ queryKey: ["catalog-sets"] });
    },
    onError: (e) => setError(errorMessage(e)),
    onSettled: () => setImportingId(null),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sets.filter((s) => {
      if (kind && s.kind !== kind) return false;
      if (skill && s.kind !== "full_test" && s.skill !== skill) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sets, kind, skill, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / LIBRARY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * LIBRARY_PAGE_SIZE, safePage * LIBRARY_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-500">
        Bộ đề mẫu do hệ thống biên soạn, dùng chung cho mọi trung tâm. Bấm{" "}
        <span className="font-medium text-ink-700">Thêm vào ngân hàng</span> để sao chép đề về
        Ngân hàng đề của trung tâm, sau đó giao cho học viên như đề tự tạo.
      </p>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-2 text-sm text-error-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          data-testid="library-filter-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "" | LibraryKind);
            setPage(1);
          }}
          className={inputCls}
        >
          <option value="">Tất cả loại đề</option>
          <option value="practice">{KIND_LABELS.practice}</option>
          <option value="full_test">{KIND_LABELS.full_test}</option>
        </select>

        {kind !== "full_test" && (
          <select
            data-testid="library-filter-skill"
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value as "" | "speaking" | "writing" | "reading" | "listening");
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="">Tất cả kỹ năng</option>
            <option value="speaking">Speaking</option>
            <option value="writing">Writing</option>
            <option value="reading">Reading</option>
            <option value="listening">Listening</option>
          </select>
        )}

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên đề…"
            className="w-64 rounded-lg border border-input py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-ink-500">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-500">Chưa có đề nào.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((s) => (
              <LibraryCard
                key={s.id}
                set={s}
                importing={importingId === s.id && importMut.isPending}
                onImport={() => importMut.mutate(s.id)}
                onPreview={() => setPreviewSet(s)}
              />
            ))}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {previewSet && (
        <LibraryPreviewDialog
          // Read from the list so the "imported" state reflects an addition made inside the modal.
          set={sets.find((s) => s.id === previewSet.id) ?? previewSet}
          importing={importingId === previewSet.id && importMut.isPending}
          onImport={() => importMut.mutate(previewSet.id)}
          onClose={() => setPreviewSet(null)}
        />
      )}
    </div>
  );
}

function SetBadges({ set }: { set: LibrarySet }) {
  return (
    <>
      {set.kind === "full_test" ? (
        <Badge tone="purple">4 kỹ năng</Badge>
      ) : (
        <Badge tone={skillTone(set.skill)}>{skillLabel(set.skill)}</Badge>
      )}
      {set.part != null && set.skill !== "" && (
        <Badge tone="info">{partLabel(set.skill, set.part)}</Badge>
      )}
      <Badge tone="brand">{KIND_LABELS[set.kind]}</Badge>
      <Badge tone="gray">{set.item_count} câu</Badge>
    </>
  );
}

// The full-label row needs ~334px in Inter; below that the import button collapses to its icon.
const LABEL_WHEN_ROW_FITS = "hidden @min-[22rem]:inline";

function LibraryCard({
  set,
  importing,
  onImport,
  onPreview,
}: {
  set: LibrarySet;
  importing: boolean;
  onImport: () => void;
  onPreview: () => void;
}) {
  const importLabel = importing ? "Đang thêm…" : "Thêm vào ngân hàng";
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <SetBadges set={set} />
      </div>
      <button
        type="button"
        onClick={onPreview}
        className="flex-1 text-left text-[15px] font-medium leading-snug text-ink-900 hover:text-brand-600"
      >
        {set.title}
      </button>
      <div className="@container flex flex-wrap gap-2">
        <Button variant="outline" onClick={onPreview} className="shrink-0 gap-1.5" title="Xem trước đề">
          <Eye className="h-4 w-4" /> Xem trước
        </Button>
        {set.imported ? (
          <Button
            variant="outline"
            disabled
            aria-label="Đã thêm"
            className="flex-1 justify-center gap-1.5 text-success-700"
          >
            <Check className="h-4 w-4" /> <span className={LABEL_WHEN_ROW_FITS}>Đã thêm</span>
          </Button>
        ) : (
          <Button
            onClick={onImport}
            disabled={importing}
            aria-label={importLabel}
            title={importLabel}
            className="flex-1 justify-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> <span className={LABEL_WHEN_ROW_FITS}>{importLabel}</span>
          </Button>
        )}
      </div>
    </Card>
  );
}

function ItemRow({ index, skill, item }: { index: number; skill: string; item: LibraryItem }) {
  return (
    <div className="flex gap-3 rounded-xl border border-ink-200 p-3.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-600">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
          {partLabel(skill, item.part)}
        </div>
        <div className="mt-0.5 whitespace-pre-line text-sm text-ink-800">{stripHtml(item.prompt)}</div>
        {item.stimulus_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.stimulus_url}
            alt=""
            className="mt-2 max-h-48 rounded-lg border border-ink-200 object-contain"
          />
        )}
      </div>
    </div>
  );
}

// Preview modal for a library set — read-only, fetching the question details when opened.
// Importing straight from the modal is allowed.
function LibraryPreviewDialog({
  set,
  importing,
  onImport,
  onClose,
}: {
  set: LibrarySet;
  importing: boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["library", set.id],
    queryFn: () => libraryApi.get(set.id),
  });
  const items = detail?.items ?? [];
  const isFullTest = set.kind === "full_test";
  const groups = isFullTest ? groupBySkill(items) : [];

  return (
    <Dialog open onClose={onClose} title="" size="lg" bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="shrink-0">
          <div className="flex flex-wrap gap-2">
            <SetBadges set={set} />
          </div>
          <h3 className="mt-2.5 text-xl font-bold text-ink-900">{set.title}</h3>
          <p className="mt-0.5 text-sm text-ink-500">Đề mẫu do hệ thống biên soạn</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 shrink-0 text-sm font-semibold text-ink-900">
            Câu hỏi trong đề <span className="font-normal text-ink-400">({items.length} câu)</span>
          </p>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-ink-400">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-200 py-6 text-center text-sm text-ink-400">
              Đề chưa có câu hỏi.
            </p>
          ) : isFullTest ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.skill} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={skillTone(g.skill)}>{skillLabel(g.skill)}</Badge>
                    <span className="text-[13px] text-ink-500">{g.items.length} câu</span>
                  </div>
                  {g.items.map((it, i) => (
                    <ItemRow key={`${g.skill}-${it.part}-${it.sequence}-${i}`} index={i + 1} skill={g.skill} item={it} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
              {items.map((it, i) => (
                <ItemRow key={`${it.part}-${it.sequence}-${i}`} index={i + 1} skill={it.skill || set.skill} item={it} />
              ))}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        {set.imported ? (
          <Button variant="outline" disabled className="gap-1.5 text-success-700">
            <Check className="h-4 w-4" /> Đã thêm vào ngân hàng
          </Button>
        ) : (
          <Button onClick={onImport} disabled={importing} className="gap-1.5">
            <Plus className="h-4 w-4" /> {importing ? "Đang thêm…" : "Thêm vào ngân hàng"}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
