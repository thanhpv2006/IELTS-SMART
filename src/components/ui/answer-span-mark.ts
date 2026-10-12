import { Mark, mergeAttributes } from "@tiptap/core";

// Tiptap mark that wraps a transcript/passage text span and links it to a
// question number via the `data-answer-q` HTML attribute. Used to render
// clickable, highlightable answer spans in R/L transcript/passage review.
export type AnswerSpanAttrs = {
  q: number | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    answerSpan: {
      setAnswerSpan: (q: number) => ReturnType;
      unsetAnswerSpan: () => ReturnType;
    };
  }
}

export const AnswerSpanMark = Mark.create({
  name: "answerSpan",

  addAttributes() {
    return {
      q: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-answer-q");
          return value == null ? null : Number(value);
        },
        renderHTML: (attributes: AnswerSpanAttrs) => {
          if (attributes.q == null) return {};
          return { "data-answer-q": String(attributes.q) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-answer-q]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "answer-span" }), 0];
  },

  addCommands() {
    return {
      setAnswerSpan:
        (q: number) =>
        ({ commands }) =>
          commands.setMark(this.name, { q }),
      unsetAnswerSpan:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
