"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileArchive, FileJson, FileSpreadsheet, Sparkles, Upload } from "lucide-react";
import { catalogApi, type ImportSkill } from "@/features/catalog/api";
import { FULL_TEST_ENABLED } from "@/features/catalog/types";
import { FullTestImportDialog } from "@/features/catalog/full-test-import-dialog";
import type { ImportResult } from "@/features/partner/api";
import { ImportDialog } from "@/features/partner/import-dialog";
import { JSONImportDialog } from "@/features/json-import/json-import-dialog";
import { JSONZipImportDialog } from "@/features/json-import/json-zip-import-dialog";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Import menu for the question bank. "Excel" opens a skill picker (Reading / Listening / Writing / Speaking); the chosen
 * skill is sent as `import_type` to the unified import endpoint, which selects
 * the matching per-skill format and forces that skill. Each skill has its own
 * template + column hint. full_test has no importer (it is composed via
 * "Import từ đề thi"), so it is a hint, not a button.
 */

interface ImportConfig {
  label: string;
  title: string;
  templateHref: string;
  columns: React.ReactNode;
}

const IMPORT_CONFIGS: Record<ImportSkill, ImportConfig> = {
  reading: {
    label: "Reading",
    title: "Import đề Reading",
    templateHref: "/templates/reading-mau.xlsx",
    columns: (
      <>
        Điền sheet <strong>Reading</strong>; mỗi dòng là 1 câu. Các cột cấu trúc (Tên đề, Passage, Part, Đoạn văn,
        Dạng) để trống = giống dòng trên; danh sách trong ô ngăn bằng <strong>|</strong>. Tải file mẫu để xem ví dụ.
      </>
    ),
  },
  listening: {
    label: "Listening",
    title: "Import đề Listening",
    templateHref: "/templates/listening-mau.xlsx",
    columns: (
      <>
        Điền sheet <strong>Listening</strong> + cột <strong>Audio</strong> (URL file nghe); mỗi dòng là 1 câu. Các cột
        cấu trúc để trống = giống dòng trên; danh sách trong ô ngăn bằng <strong>|</strong>. Tải file mẫu để xem ví dụ.
      </>
    ),
  },
  writing: {
    label: "Writing",
    title: "Import đề Writing",
    templateHref: "/templates/writing-mau.xlsx",
    columns: (
      <>
        File phẳng, mỗi dòng là 1 câu; cột <strong>Kỹ năng</strong> = <strong>writing</strong>, cột{" "}
        <strong>Loại</strong> = practice (luyện tập 1 Part). Tải file mẫu để xem ví dụ.
      </>
    ),
  },
  speaking: {
    label: "Speaking",
    title: "Import đề Speaking",
    templateHref: "/templates/speaking-mau.xlsx",
    columns: (
      <>
        File phẳng, mỗi dòng là 1 câu; cột <strong>Kỹ năng</strong> = <strong>speaking</strong>, cột{" "}
        <strong>Loại</strong> = practice (luyện tập 1 Part). Tải file mẫu để xem ví dụ.
      </>
    ),
  },
};

const SKILL_ORDER: ImportSkill[] = ["reading", "listening", "writing", "speaking"];

const menuItemCls =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50 [&_svg]:size-4 [&_svg]:text-ink-500";

export function ImportMenu({ showJSON, showAI }: { showJSON: boolean; showAI: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [skill, setSkill] = useState<ImportSkill | null>(null);
  const [fullTestOpen, setFullTestOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cfg = skill ? IMPORT_CONFIGS[skill] : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const choose = (open: () => void) => () => {
    setMenuOpen(false);
    open();
  };

  return (
    <>
      <div ref={wrapperRef} className="relative inline-flex">
        <Button
          variant="outline"
          data-testid="import-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Upload /> Import <ChevronDown />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-xl border border-ink-200 bg-white p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="import-excel-btn"
              className={menuItemCls}
              onClick={choose(() => setPicking(true))}
            >
              <FileSpreadsheet /> Excel
            </button>
            {showJSON && (
              <button
                type="button"
                role="menuitem"
                data-testid="json-import-btn"
                className={menuItemCls}
                onClick={choose(() => setJsonOpen(true))}
              >
                <FileJson /> JSON
              </button>
            )}
            {showJSON && (
              <button
                type="button"
                role="menuitem"
                data-testid="zip-import-btn"
                className={menuItemCls}
                onClick={choose(() => setZipOpen(true))}
              >
                <FileArchive /> ZIP (nhiều đề)
              </button>
            )}
            {showAI && (
              <Link
                href="/ai-import"
                role="menuitem"
                data-testid="ai-import-btn"
                className={menuItemCls}
                onClick={() => setMenuOpen(false)}
              >
                <Sparkles /> Bằng AI
              </Link>
            )}
          </div>
        )}
      </div>

      {picking && (
        <Dialog open onClose={() => setPicking(false)} title="Import Excel" size="sm">
          <DialogBody className="space-y-4">
            <p className="text-sm text-ink-600">Chọn loại đề để import:</p>
            <div className="grid grid-cols-2 gap-3">
              {SKILL_ORDER.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  data-testid={`import-skill-${s}`}
                  onClick={() => {
                    setSkill(s);
                    setPicking(false);
                  }}
                >
                  {IMPORT_CONFIGS[s].label}
                </Button>
              ))}
            </div>
            {FULL_TEST_ENABLED && (
              <Button
                variant="outline"
                className="w-full"
                data-testid="import-skill-full_test"
                onClick={() => {
                  setPicking(false);
                  setFullTestOpen(true);
                }}
              >
                Full test (4 kỹ năng)
              </Button>
            )}
          </DialogBody>
        </Dialog>
      )}

      {fullTestOpen && <FullTestImportDialog onClose={() => setFullTestOpen(false)} />}

      {jsonOpen && <JSONImportDialog open onClose={() => setJsonOpen(false)} />}

      {zipOpen && <JSONZipImportDialog open onClose={() => setZipOpen(false)} />}

      {cfg && (
        <ImportDialog
          title={cfg.title}
          columns={cfg.columns}
          importFn={async (file: File): Promise<ImportResult> => {
            const res = await catalogApi.importXlsx(file, { importType: skill ?? undefined });
            return { ...res, generated_passwords: [] };
          }}
          invalidateKeys={[["catalog-sets"]]}
          templateHref={cfg.templateHref}
          onClose={() => setSkill(null)}
        />
      )}
    </>
  );
}
