import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerTablePanel } from "./answer-table-panel";
import type { AIImportAnswerRow, AIImportAnswerTable } from "./types";

// Backends deployed before the DTO fix send null for both lists on a single-answer row; the panel
// must survive that rather than take the whole review page down.
function nullListsRow(number: number, answerKey: string[] | null): AIImportAnswerRow {
  return {
    number,
    answer_key: answerKey,
    accepted_variants: null,
    explanation: "",
    source: "parser",
  } as unknown as AIImportAnswerRow;
}

describe("AnswerTablePanel", () => {
  it("renders rows whose answer lists arrive as null", () => {
    const table: AIImportAnswerTable = {
      listening: [nullListsRow(1, ["blue card"]), nullListsRow(2, null)],
      reading: [],
      units: {},
      normalized_by: "parser",
    };

    render(<AnswerTablePanel table={table} />);

    const first = screen.getByTestId("ai-import-answer-row-Listening-1");
    expect(first).toHaveTextContent("blue card");
    expect(first).toHaveTextContent("—");
    expect(screen.getByTestId("ai-import-answer-row-Listening-2")).toBeInTheDocument();
  });
});
