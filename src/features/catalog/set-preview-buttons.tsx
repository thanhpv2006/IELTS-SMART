"use client";

import { useState } from "react";
import { isObjectiveSkill } from "@/features/preview/preview-mapping";
import {
  SkillPreviewOverlay,
  type SkillPreviewMode,
} from "@/features/preview/skill-preview-overlay";
import { Button } from "@/components/ui/button";
import type { CatalogQuestion, CatalogSkill } from "./types";

const NOTE = "Bản xem trước — thao tác ở đây không được chấm và không thay đổi bộ đề.";

/**
 * SetPreviewButtons opens the saved set's content the way a student meets it, and its answer key,
 * from the set editor's skill panel.
 */
export function SetPreviewButtons({
  skill,
  questions,
}: {
  skill: CatalogSkill;
  questions: CatalogQuestion[];
}) {
  const [mode, setMode] = useState<SkillPreviewMode | null>(null);
  const empty = questions.length === 0;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="set-preview-exam"
        disabled={empty}
        onClick={() => setMode("exam")}
      >
        Xem trước đề
      </Button>
      {isObjectiveSkill(skill) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="set-preview-result"
          disabled={empty}
          onClick={() => setMode("result")}
        >
          Xem trước đáp án
        </Button>
      )}

      {mode && (
        <SkillPreviewOverlay
          mode={mode}
          skill={skill}
          questions={questions}
          note={NOTE}
          onClose={() => setMode(null)}
        />
      )}
    </div>
  );
}
