import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mergeSWMetadata, SWDraftForm } from "./sw-draft-form";
import type { AIImportQuestionDraft } from "./types";

describe("mergeSWMetadata", () => {
  it("sets a new field", () => {
    expect(mergeSWMetadata({}, { task_type: "task1" })).toEqual({ task_type: "task1" });
  });

  it("drops a field cleared to undefined instead of persisting an empty value", () => {
    expect(mergeSWMetadata({ task_type: "task1", min_words: 150 }, { task_type: undefined })).toEqual({
      min_words: 150,
    });
  });

  it("preserves unrelated keys (e.g. examiner_audio_url) untouched", () => {
    expect(mergeSWMetadata({ examiner_audio_url: "https://x/a.mp3" }, { min_words: 250 })).toEqual({
      examiner_audio_url: "https://x/a.mp3",
      min_words: 250,
    });
  });
});

function writingDraft(metadata: Record<string, unknown> = {}): AIImportQuestionDraft {
  return { skill: "writing", part: 1, prompt: "Describe the chart.", metadata };
}

function speakingDraft(): AIImportQuestionDraft {
  return { skill: "speaking", part: 1, prompt: "Tell me about your hometown.", metadata: {} };
}

describe("SWDraftForm", () => {
  it("hides task_type/min_words/image_url for a speaking draft", () => {
    render(<SWDraftForm draft={speakingDraft()} onChange={vi.fn()} />);
    expect(screen.getByTestId("sw-draft-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("sw-draft-task-type")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sw-draft-min-words")).not.toBeInTheDocument();
  });

  it("shows task_type/min_words for a writing draft", () => {
    render(<SWDraftForm draft={writingDraft()} onChange={vi.fn()} />);
    expect(screen.getByTestId("sw-draft-task-type")).toBeInTheDocument();
    expect(screen.getByTestId("sw-draft-min-words")).toBeInTheDocument();
  });

  it("editing the prompt textarea calls onChange with the updated draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SWDraftForm draft={writingDraft()} onChange={onChange} />);
    await user.type(screen.getByTestId("sw-draft-prompt"), "!");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Describe the chart.!" }));
  });

  it("changing min_words patches metadata via onChange", async () => {
    // Component is a controlled leaf (per spec: fetches nothing, no internal state), so
    // typing a multi-digit value needs a stateful host feeding each onChange back in as
    // the next `draft` prop — otherwise the input snaps back to its unchanged prop value
    // after every keystroke.
    function Harness({ onChangeSpy }: { onChangeSpy: (d: AIImportQuestionDraft) => void }) {
      const [draft, setDraft] = useState(writingDraft());
      return (
        <SWDraftForm
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            onChangeSpy(next);
          }}
        />
      );
    }

    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByTestId("sw-draft-min-words"), "150");
    const last = onChangeSpy.mock.calls.at(-1)?.[0] as AIImportQuestionDraft;
    expect(last.metadata.min_words).toBe(150);
  });
});
