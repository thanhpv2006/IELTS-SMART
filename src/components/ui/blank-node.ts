import { Node, mergeAttributes } from "@tiptap/core";

// Tiptap inline atom node representing an answer blank in form/table
// completion content. Serializes to an EMPTY `<span data-blank="N"></span>` —
// this is the storage contract shared with the exam-engine renderer and the
// backend blank-count validator. The visible number chip is rendered only
// in the editor via a vanilla node view; it must never leak into getHTML().
export type BlankNodeAttrs = {
  number: number | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blank: {
      insertBlank: (n: number) => ReturnType;
    };
  }
}

export const BlankNode = Node.create({
  name: "blank",

  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      number: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          // Fail-closed: reject malformed values (empty, non-numeric, non-integer)
          // so a bad attribute never round-trips back as data-blank="NaN", which
          // would corrupt the storage contract the backend validator depends on.
          const value = element.getAttribute("data-blank");
          if (value == null) return null;
          const n = Number(value);
          return Number.isInteger(n) && n > 0 ? n : null;
        },
        renderHTML: (attributes: BlankNodeAttrs) => {
          if (attributes.number == null) return {};
          return { "data-blank": String(attributes.number) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-blank]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // Empty span — no content hole, no text. getHTML() must produce exactly
    // <span data-blank="N"></span>.
    return ["span", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "blank-chip";
      dom.contentEditable = "false";
      // Never render the literal "null"/"NaN" — show "?" if the number attribute
      // is missing/invalid (should not happen via insertBlank).
      const num = node.attrs.number;
      const label = typeof num === "number" && Number.isInteger(num) ? String(num) : "?";
      // A pencil marker + number so the blank is unmistakably an answer slot, not a
      // literal number in the form text (e.g. "$5", "Open on 3"). Styled inline (not via
      // globals.css) because the editor-only chip must not depend on the CSS pipeline and
      // never reaches getHTML() (the node serializes to an empty <span data-blank="N">).
      dom.textContent = `✎ ${label}`;
      Object.assign(dom.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "0 0.4rem",
        margin: "0 2px",
        border: "1px solid #c7d2fe",
        borderBottom: "2px solid #6366f1",
        borderRadius: "5px",
        background: "#eef2ff",
        color: "#4338ca",
        fontWeight: "700",
        fontSize: "0.78rem",
        lineHeight: "1.5",
        verticalAlign: "baseline",
        whiteSpace: "nowrap",
        userSelect: "none",
        cursor: "default",
      });
      return { dom };
    };
  },

  addCommands() {
    return {
      insertBlank:
        (n: number) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { number: n } }),
    };
  },
});
