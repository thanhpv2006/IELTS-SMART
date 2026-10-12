import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpeakingAnswerCard, critMarkClass } from "./grading-shared";
import { PLAYBACK_PAD_SEC } from "./word-scores";
import type { AnswerItem } from "@/features/partner/api";
import type { WordScore } from "@/features/partner/result-types";

const script = "I like coffee very much.";
const words: WordScore[] = [
  { word: "I", score: 96, start_ms: 0, end_ms: 12 },
  { word: "like", score: 74, start_ms: 12, end_ms: 40, level: "A1" },
  { word: "coffee", score: 41, start_ms: 40, end_ms: 90 },
  { word: "very", score: 92, start_ms: 90, end_ms: 120 },
  { word: "much.", score: 88, start_ms: 120, end_ms: 165 },
];
const answer: AnswerItem = { sequence: 1, audio_url: "https://example.test/a1.webm" };

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
});

beforeEach(() => {
  vi.mocked(HTMLMediaElement.prototype.play).mockClear();
});

function wordSpan(text: string): HTMLElement {
  const hit = screen
    .getAllByTestId("speaking-word")
    .find((el) => el.textContent === text);
  if (!hit) throw new Error(`no word span for ${text}`);
  return hit;
}

describe("SpeakingAnswerCard — pronunciation block", () => {
  it("renders pronunciation as a second block, tinting every word by tier", () => {
    render(<SpeakingAnswerCard answer={answer} transcript={{ script, words }} index={0} />);
    expect(screen.getByTestId("speaking-script").textContent).toBe(script);
    expect(screen.getByTestId("speaking-pronunciation").textContent).toBe(script);
    expect(wordSpan("I").className).toContain("bg-emerald-100");
    expect(wordSpan("like").className).toContain("bg-amber-100");
    expect(wordSpan("coffee").className).toContain("bg-rose-200");
  });

  it("omits the whole block when there are no word scores", () => {
    render(<SpeakingAnswerCard answer={answer} transcript={{ script }} index={0} />);
    expect(screen.queryByTestId("speaking-pronunciation")).toBeNull();
    expect(screen.queryByText("< 60% cần sửa")).toBeNull();
    expect(screen.queryAllByTestId("speaking-word").length).toBe(0);
    expect(screen.getByTestId("speaking-script").textContent).toBe(script);
  });

  it("reveals the score on hover and hides it on leave", () => {
    render(<SpeakingAnswerCard answer={answer} transcript={{ script, words }} index={0} />);
    fireEvent.mouseEnter(wordSpan("like"));
    expect(screen.getByText("Phát âm 74% · A1")).toBeTruthy();
    fireEvent.mouseLeave(wordSpan("like"));
    expect(screen.queryByText("Phát âm 74% · A1")).toBeNull();
  });

  it("plays the word's slice on a second element, leaving the progress player alone", () => {
    const { container } = render(<SpeakingAnswerCard answer={answer} transcript={{ script, words }} index={0} />);
    const [main, word] = [...container.querySelectorAll("audio")] as HTMLAudioElement[];
    fireEvent.click(wordSpan("coffee"));
    expect(word.currentTime).toBeCloseTo(0.4 - PLAYBACK_PAD_SEC);
    expect(main.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent(word, new Event("seeked"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("refuses playback for words SpeechSuper could not align", () => {
    const unaligned: WordScore[] = [
      { word: "I", score: 96, start_ms: 0, end_ms: 12 },
      { word: "like", score: 89, start_ms: -1, end_ms: -1 },
      { word: "coffee", score: 0, start_ms: -1, end_ms: -1 },
      { word: "very", score: 92, start_ms: 90, end_ms: 120 },
      { word: "much.", score: 88, start_ms: 120, end_ms: 165 },
    ];
    const { container } = render(<SpeakingAnswerCard answer={answer} transcript={{ script, words: unaligned }} index={0} />);
    const word = [...container.querySelectorAll("audio")][1] as HTMLAudioElement;
    word.currentTime = 5;

    fireEvent.click(wordSpan("like"));
    fireEvent.click(wordSpan("coffee"));
    expect(word.currentTime).toBe(5);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(wordSpan("like").className).not.toContain("cursor-pointer");
    // The score still shows — only seeking is refused.
    expect(wordSpan("coffee").className).toContain("bg-rose-200");

    fireEvent.click(wordSpan("very"));
    expect(word.currentTime).toBeCloseTo(0.9 - PLAYBACK_PAD_SEC);
    expect(wordSpan("very").className).toContain("cursor-pointer");
  });

  it("never seeks before the start of the recording", () => {
    const { container } = render(<SpeakingAnswerCard answer={answer} transcript={{ script, words }} index={0} />);
    const word = [...container.querySelectorAll("audio")][1] as HTMLAudioElement;
    fireEvent.click(wordSpan("I"));
    expect(word.currentTime).toBe(0);
  });

  it("still plays when the source never reports the seek", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<SpeakingAnswerCard answer={answer} transcript={{ script, words }} index={0} />);
      fireEvent.click(wordSpan("coffee"));
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      const word = [...container.querySelectorAll("audio")][1] as HTMLAudioElement;
      fireEvent(word, new Event("seeked"));
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the SCRIPT block untouched: marked text stays clickable and jumps", () => {
    const onMarkClick = vi.fn();
    render(
      <SpeakingAnswerCard
        answer={answer}
        transcript={{ script, words }}
        index={0}
        marks={[{ term: "like coffee", className: critMarkClass("GRA"), id: "mark-1" }]}
        onMarkClick={onMarkClick}
      />,
    );
    const mark = screen.getByTestId("speaking-mark");
    expect(mark.className).toContain("bg-red-50");
    expect(mark.className).toContain("underline");
    expect(mark.textContent).toBe("like coffee");
    expect(screen.getByTestId("speaking-script").contains(mark)).toBe(true);

    fireEvent.click(mark);
    expect(onMarkClick).toHaveBeenCalledWith("mark-1");
  });

  it("keeps the two blocks apart: no marks below, no word spans above", () => {
    render(
      <SpeakingAnswerCard
        answer={answer}
        transcript={{ script, words }}
        index={0}
        marks={[{ term: "like coffee", className: critMarkClass("GRA"), id: "mark-1" }]}
        onMarkClick={vi.fn()}
      />,
    );
    const scriptBlock = screen.getByTestId("speaking-script");
    const pronBlock = screen.getByTestId("speaking-pronunciation");
    expect(scriptBlock.querySelectorAll('[data-testid="speaking-word"]').length).toBe(0);
    expect(pronBlock.querySelectorAll('[data-testid="speaking-mark"]').length).toBe(0);
    expect(pronBlock.querySelectorAll('[data-testid="speaking-word"]').length).toBe(words.length);
  });
});
