"use client";

import { useEffect, useRef, useState } from "react";
import { SkillRunner, defaultCopyEn } from "@novaforge-team/ielts-exam-engine";
import { Maximize2, Minimize2 } from "lucide-react";
import { ObjectiveResultView } from "@/features/take/objective-result-view";
import { Button } from "@/components/ui/button";
import { isEngineSkill, toEngineQuestions, toObjectiveResult } from "./preview-mapping";
import type { PreviewQuestion } from "./types";

export type SkillPreviewMode = "exam" | "result";

const MODE_TITLE: Record<SkillPreviewMode, string> = {
  exam: "Xem trước đề",
  result: "Xem trước đáp án",
};

const SKILL_TITLE: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

export type SkillPreviewOverlayProps = {
  mode: SkillPreviewMode;
  skill: string;
  questions: PreviewQuestion[];
  /** Subtitle telling the viewer what they are looking at — an unsaved draft, or a saved set. */
  note: string;
  onClose: () => void;
};

/**
 * SkillPreviewOverlay shows one skill's questions the way a student would meet them — the exam
 * itself, or the released answer key — so the author can approve content and marking. The source is
 * either an unsaved AI-import draft or a saved catalog set.
 *
 * It renders as a fixed full-viewport overlay rather than through the shared Dialog primitive:
 * Dialog caps at max-w-3xl/max-h-[90vh] and its body is not a flex item, so SkillRunner's
 * fillHeight would resolve against an indefinite height and collapse to nothing.
 */
export function SkillPreviewOverlay({
  mode,
  skill,
  questions,
  note,
  onClose,
}: SkillPreviewOverlayProps) {
  const engine = mode === "exam" ? toEngineQuestions(questions, skill) : null;
  const objective = mode === "result" ? toObjectiveResult(questions, skill) : null;
  const scrubbed = engine?.scrubbed ?? objective?.scrubbed ?? [];

  const title = `${MODE_TITLE[mode]} — ${SKILL_TITLE[skill] ?? skill}`;
  const { overlayRef, canFullscreen, isFullscreen, toggleFullscreen, leaveFullscreen } = useOverlayFullscreen();

  async function handleClose() {
    await leaveFullscreen();
    onClose();
  }

  return (
    <div ref={overlayRef} data-testid="skill-preview-overlay" className="fixed inset-0 z-50 bg-white">
      <div className="flex h-dvh w-full flex-col bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-ink-100 px-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink-900">{title}</h2>
            <p className="truncate text-xs text-ink-500">{note}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canFullscreen && (
              <Button type="button" variant="outline" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                {isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        </header>

        {scrubbed.length > 0 && (
          <div className="shrink-0 border-b border-warning-200 bg-warning-50 px-4 py-2 sm:px-6">
            <p className="text-xs font-semibold text-warning-800">
              Có {scrubbed.length} tài nguyên chưa được tải lên — chỗ đó trong bản xem trước sẽ trống:
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {scrubbed.map((entry) => (
                <li key={entry} className="font-mono text-xs text-warning-700">
                  {entry}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rl-take min-h-0 flex-1 overflow-y-auto">
          <PreviewBody
            mode={mode}
            skill={skill}
            engine={engine}
            objective={objective}
            onClose={handleClose}
          />
        </div>
      </div>
    </div>
  );
}

function useOverlayFullscreen() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled === true);
    // Esc leaves fullscreen without going through our button, so the label follows the browser.
    const sync = () => setIsFullscreen(document.fullscreenElement === overlayRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function leaveFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await leaveFullscreen();
    else await overlayRef.current?.requestFullscreen();
  }

  return { overlayRef, canFullscreen, isFullscreen, toggleFullscreen, leaveFullscreen };
}

function PreviewBody({
  mode,
  skill,
  engine,
  objective,
  onClose,
}: {
  mode: SkillPreviewMode;
  skill: string;
  engine: ReturnType<typeof toEngineQuestions> | null;
  objective: ReturnType<typeof toObjectiveResult> | null;
  onClose: () => void;
}) {
  if (mode === "result") {
    if (!objective || objective.result.sections.length === 0) {
      return <EmptyPreview>Chưa có câu nào để dựng đáp án.</EmptyPreview>;
    }
    return <ObjectiveResultView result={objective.result} answerKey />;
  }

  if (!isEngineSkill(skill)) {
    return <EmptyPreview>Không xem trước được kỹ năng &quot;{skill}&quot;.</EmptyPreview>;
  }
  if (!engine || engine.questions.length === 0) {
    return <EmptyPreview>Chưa có câu nào cho kỹ năng đó.</EmptyPreview>;
  }

  return (
    <SkillRunner
      skill={skill}
      // practice, with every guard switched off explicitly: exam mode installs a beforeunload
      // prompt and document-level copy/paste capture handlers that would cover the whole console,
      // and auto-starts the microphone on speaking.
      mode="practice"
      policyOverrides={{ antiCheat: false, timed: false, autoRecord: false }}
      questions={engine.questions}
      copy={defaultCopyEn}
      fillHeight
      enableHighlighter={false}
      showSubmit={false}
      onUploadAudio={async () => ""}
      onSubmit={() => {}}
      onExit={onClose}
    />
  );
}

function EmptyPreview({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 py-10 text-center text-sm text-ink-500">{children}</p>
  );
}
