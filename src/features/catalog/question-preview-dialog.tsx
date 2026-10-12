"use client";

// Read-only preview of every question in a set (one skill). Lets the author
// review the authored content — passage/transcript/audio + each group's items,
// their answer key and explanation — without entering the editor.

import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { catalogApi } from "./api";
import type { CatalogQuestion, CatalogSkill } from "./types";
import { descriptorFor } from "./rl-metadata";
import type { RLGroupType } from "@novaforge-team/ielts-exam-engine";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type RLItem = {
  number?: number;
  prompt?: string;
  answer_key?: string[];
  accepted_variants?: string[];
  explanation?: string;
};
type RLGroup = { type?: string; instructions_html?: string; image_url?: string; items?: RLItem[] };

const SKILL_HEADER: Record<CatalogSkill, string> = {
  reading: "Passage",
  listening: "Part",
  writing: "Đề",
  speaking: "Đề",
};

export function QuestionPreviewDialog({
  skill,
  questions,
  open,
  onClose,
}: {
  skill: CatalogSkill;
  questions: CatalogQuestion[];
  open: boolean;
  onClose: () => void;
}) {
  // Fetch full detail (metadata) per question only while the dialog is open.
  const results = useQueries({
    queries: questions.map((q) => ({
      queryKey: ["catalog-question", q.id],
      queryFn: () => catalogApi.get(q.id),
      enabled: open,
      staleTime: 60_000,
    })),
  });
  const loading = open && results.some((r) => r.isLoading);
  const label = SKILL_HEADER[skill] ?? "Câu";

  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Xem câu hỏi" size="xl">
      <DialogBody className="space-y-6">
        {loading && <p className="text-sm text-ink-400">Đang tải nội dung…</p>}
        {results.map((r, qi) => {
          const q = r.data;
          if (!q) return null;
          const md = (q.metadata ?? {}) as Record<string, unknown>;
          const audio = md.audio_url as string | undefined;
          const transcript = md.transcript as string | undefined;
          const passage = (md.passage_html_marked as string | undefined) || q.prompt;
          const groups = (md.groups as RLGroup[] | undefined) ?? [];
          const isRL = skill === "reading" || skill === "listening";
          return (
            <section key={q.id} className="space-y-3 rounded-xl border border-ink-200 p-4">
              <div className="flex items-center gap-2">
                <Badge tone="brand">
                  {label} {qi + 1}
                </Badge>
                {typeof q.part === "number" && <span className="text-xs text-ink-400">Part {q.part}</span>}
              </div>

              {audio && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink-600">Audio</p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={audio} className="w-full" />
                </div>
              )}

              {isRL && passage && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-600">
                    {skill === "reading" ? "Đoạn văn" : "Ngữ cảnh"}
                  </p>
                  <div
                    className="rl-highlight prose prose-sm max-w-none text-ink-700"
                    dangerouslySetInnerHTML={{ __html: passage }}
                  />
                </div>
              )}

              {transcript && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-600">Transcript</p>
                  <div
                    className="rl-highlight prose prose-sm max-w-none text-ink-700"
                    dangerouslySetInnerHTML={{ __html: transcript }}
                  />
                </div>
              )}

              {isRL ? (
                groups.map((g, gi) => <GroupPreview key={gi} group={g} />)
              ) : (
                // speaking/writing: prompt is the whole question
                <div
                  className="prose prose-sm max-w-none text-ink-700"
                  dangerouslySetInnerHTML={{ __html: q.prompt }}
                />
              )}
            </section>
          );
        })}
      </DialogBody>
    </Dialog>
  );
}

function GroupPreview({ group }: { group: RLGroup }) {
  const desc = descriptorFor((group.type ?? "gap_fill") as RLGroupType);
  const items = group.items ?? [];
  return (
    <div className="space-y-2 rounded-lg border border-ink-100 bg-ink-50/50 p-3">
      <div className="flex items-center gap-2">
        <Badge tone="purple">{desc.label}</Badge>
      </div>
      {group.instructions_html && (
        <div
          className="prose prose-sm max-w-none text-ink-600"
          dangerouslySetInnerHTML={{ __html: group.instructions_html }}
        />
      )}
      {group.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.image_url} alt="Sơ đồ" className="max-h-72 rounded-lg border border-ink-200" />
      )}
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={it.number ?? i} className="rounded-md border border-ink-100 bg-white px-3 py-2 text-sm">
            <p className="text-ink-800">
              <span className="font-semibold">Câu {it.number}.</span>
              {/* prompt is authored HTML (entities / inline tags), sanitized backend-side — render
                  as HTML, consistent with the engine take-view and the result review. */}
              {it.prompt ? (
                <span className="ml-1" dangerouslySetInnerHTML={{ __html: it.prompt }} />
              ) : null}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-600">
              Đáp án: <span className="font-semibold text-green-700">{(it.answer_key ?? []).join(", ") || "—"}</span>
              {it.accepted_variants?.length ? (
                <span className="text-ink-400"> · biến thể: {it.accepted_variants.join(", ")}</span>
              ) : null}
            </p>
            {it.explanation ? (
              <p className="mt-1 rounded bg-ink-50 px-2 py-1 text-[13px] text-ink-600">
                <span className="font-semibold text-ink-700">Giải thích: </span>
                {it.explanation}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
