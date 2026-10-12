import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, onTestFinished, vi } from "vitest";

import { ObjectiveResultView, type ObjectiveResult } from "./objective-result-view";

function listeningResult(sections: ObjectiveResult["sections"]): ObjectiveResult {
  return { kind: "objective", skill: "listening", raw: 0, total: 4, band: 0, sections };
}

const part1: ObjectiveResult["sections"][number] = {
  transcript: '<p>Mary: <span data-answer-q="1">a deposit of $15</span></p>',
  items: [{ number: 1, correct: false, prompt: "Library deposit ($)" }],
};
const part3: ObjectiveResult["sections"][number] = {
  transcript: "<p>No answer marks in this part.</p>",
  items: [{ number: 21, correct: false, prompt: "Volcanoes" }],
};

describe("ObjectiveResultView — Part/Passage tabs", () => {
  it("orders the tabs by question number even when the sections arrive shuffled", () => {
    render(<ObjectiveResultView result={listeningResult([part3, part1])} />);

    // Part 1 is the tab shown first, and it holds the lowest-numbered question.
    expect(screen.getByRole("button", { name: "Part 1" })).toBeInTheDocument();
    expect(screen.getByText("Câu 1.")).toBeInTheDocument();
    expect(screen.queryByText("Câu 21.")).not.toBeInTheDocument();
  });
});

describe('ObjectiveResultView — "Xem vị trí"', () => {
  it("offers the button only for questions the material marks with data-answer-q", () => {
    render(<ObjectiveResultView result={listeningResult([part1])} />);
    expect(screen.getByRole("button", { name: "Xem vị trí" })).toBeInTheDocument();
  });

  it("hides the button when the question has no marked location in the material", () => {
    render(<ObjectiveResultView result={listeningResult([part3])} />);
    expect(screen.queryByRole("button", { name: "Xem vị trí" })).not.toBeInTheDocument();
  });

  it("keeps the button off unmarked questions of a partially marked part", () => {
    const mixed = {
      transcript: '<p><span data-answer-q="1">first</span> then nothing for 2</p>',
      items: [
        { number: 1, correct: true, prompt: "Marked" },
        { number: 2, correct: false, prompt: "Unmarked" },
      ],
    };
    render(<ObjectiveResultView result={listeningResult([mixed])} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).queryByRole("button", { name: "Xem vị trí" })).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button", { name: "Xem vị trí" })).not.toBeInTheDocument();
  });
});

describe("ObjectiveResultView — answerKey", () => {
  const keyed = listeningResult([
    {
      transcript: '<p><span data-answer-q="1">a deposit of $15</span></p>',
      items: [
        { number: 1, correct: true, prompt: "Library deposit ($)", correct_answers: ["15"] },
      ],
    },
  ]);

  it("replaces the band header with a neutral answer-key header", () => {
    render(<ObjectiveResultView result={keyed} answerKey />);

    expect(screen.queryByText(/Band Listening ước tính/)).not.toBeInTheDocument();
    expect(screen.queryByText("Số câu đúng")).not.toBeInTheDocument();
    expect(screen.getByText("Đáp án Listening")).toBeInTheDocument();
    expect(screen.getByText("Số câu")).toBeInTheDocument();
  });

  it("prints the key on every item and drops the absent student's answer", () => {
    render(<ObjectiveResultView result={keyed} answerKey />);

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.queryByText(/Bạn trả lời/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Đúng")).not.toBeInTheDocument();
  });

  it("keeps the graded view by default: no key on a correct item", () => {
    render(<ObjectiveResultView result={keyed} />);

    expect(screen.getByText("Số câu đúng")).toBeInTheDocument();
    expect(screen.getByText(/Bạn trả lời/)).toBeInTheDocument();
    expect(screen.queryByText(/Đáp án đúng/)).not.toBeInTheDocument();
  });
});

describe("ObjectiveResultView — band header", () => {
  const graded: ObjectiveResult = { ...listeningResult([part1]), raw: 9, total: 13, band: 3.5 };

  it("shows only the number correct for a practice result, never an estimated band", () => {
    render(<ObjectiveResultView result={graded} />);

    expect(screen.getByText("Kết quả Listening")).toBeInTheDocument();
    expect(screen.getByText("9/13")).toBeInTheDocument();
    expect(screen.queryByText(/ước tính/)).not.toBeInTheDocument();
    expect(screen.queryByText("3.5")).not.toBeInTheDocument();
    expect(screen.queryByText("Điểm thô")).not.toBeInTheDocument();
  });

  it("shows the estimated band for a full test skill", () => {
    render(<ObjectiveResultView result={graded} showBand />);

    expect(screen.getByText("Band Listening ước tính")).toBeInTheDocument();
    expect(screen.getByText("3.5")).toBeInTheDocument();
    expect(screen.getByText("9/13")).toBeInTheDocument();
  });
});

describe("ObjectiveResultView — Choose-N block", () => {
  const chooseNItems: ObjectiveResult["sections"][number]["items"] = [
    {
      number: 21,
      correct: true,
      prompt: "Which TWO things?",
      submitted: ["B", "C"],
      correct_answers: ["B", "D"],
    },
    {
      number: 22,
      correct: false,
      prompt: "Which TWO things?",
      submitted: ["B", "C"],
      correct_answers: ["B", "D"],
    },
  ];
  const chooseNSection: ObjectiveResult["sections"][number] = {
    passage: "<p>Reading passage.</p>",
    items: chooseNItems,
  };
  const chooseNResult: ObjectiveResult = {
    kind: "objective",
    skill: "reading",
    raw: 1,
    total: 2,
    band: 0,
    sections: [chooseNSection],
  };

  it("merges the pair into one labelled row instead of two separate question numbers", () => {
    render(<ObjectiveResultView result={chooseNResult} />);

    expect(screen.getByText("Câu 21–22.")).toBeInTheDocument();
    expect(screen.queryByText("Câu 22.")).not.toBeInTheDocument();
  });

  it("shows the shared submitted set and answer key once each", () => {
    render(<ObjectiveResultView result={chooseNResult} />);

    expect(screen.getAllByText("B, C")).toHaveLength(1);
    expect(screen.getAllByText("B, D")).toHaveLength(1);
  });

  it("shows a partial-correct chip when only some numbers in the block are right", () => {
    render(<ObjectiveResultView result={chooseNResult} />);

    expect(screen.getByText("Đúng 1/2")).toBeInTheDocument();
  });

  it('keeps one "Xem vị trí" button on the block row when only one member number is marked', () => {
    const partiallyMarked: ObjectiveResult["sections"][number] = {
      passage: '<p><span data-answer-q="22">x</span></p>',
      items: chooseNItems,
    };
    render(<ObjectiveResultView result={{ ...chooseNResult, sections: [partiallyMarked] }} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getAllByRole("button", { name: "Xem vị trí" })).toHaveLength(1);
  });
});

describe("ObjectiveResultView — question context", () => {
  function withItem(item: ObjectiveResult["sections"][number]["items"][number]) {
    return listeningResult([{ items: [item] }]);
  }

  it("renders the blank placeholder of a gap-fill prompt as strong text", () => {
    render(
      <ObjectiveResultView
        result={withItem({
          number: 24,
          correct: false,
          prompt: "home has been <strong>(24) ______</strong>.",
        })}
      />,
    );
    expect(screen.getByText("(24) ______").tagName).toBe("STRONG");
  });

  it("appends the option text to matching answers", () => {
    render(
      <ObjectiveResultView
        result={withItem({
          number: 5,
          correct: false,
          type: "matching_headings",
          options: ["i Tried and tested", "vii Bees dance"],
          correct_answers: ["vii"],
          submitted: ["i"],
        })}
      />,
    );
    expect(screen.getByText("vii — Bees dance")).toBeInTheDocument();
    expect(screen.getByText("i — Tried and tested")).toBeInTheDocument();
  });

  it("lists every MCQ option and marks the correct and wrong ones", () => {
    render(
      <ObjectiveResultView
        result={withItem({
          number: 3,
          correct: false,
          type: "mcq_single",
          options: ["A one", "B two", "C three"],
          correct_answers: ["B"],
          submitted: ["C"],
        })}
      />,
    );
    const rows = screen.getAllByText(/^(one|two|three)$/).map((el) => el.closest("li"));
    expect(rows.map((r) => r?.getAttribute("data-state"))).toEqual(["neutral", "correct", "wrong"]);
  });

  it("shows bare option keys without a separator", () => {
    render(
      <ObjectiveResultView
        result={withItem({
          number: 8,
          correct: false,
          type: "tfng",
          options: ["TRUE", "FALSE", "NOT GIVEN"],
          correct_answers: ["TRUE"],
          submitted: ["FALSE"],
        })}
      />,
    );
    expect(screen.getByText("TRUE")).toBeInTheDocument();
    expect(screen.queryByText(/ — /)).not.toBeInTheDocument();
  });

  it("renders items without options as before", () => {
    render(
      <ObjectiveResultView
        result={withItem({
          number: 9,
          correct: false,
          type: "mcq_single",
          correct_answers: ["B"],
          submitted: ["C"],
        })}
      />,
    );
    expect(screen.queryByRole("list", { name: "Các lựa chọn" })).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});

describe("ObjectiveResultView — question groups", () => {
  type Item = ObjectiveResult["sections"][number]["items"][number];

  function readingResult(items: Item[], passage = "<p>Passage.</p>"): ObjectiveResult {
    return { kind: "objective", skill: "reading", raw: 0, total: items.length, band: 0, sections: [{ passage, items }] };
  }

  const headings = ["i Tried and tested", "ii Cooperation beneath", "iii Working together", "vii Bees dance"];
  const headingsInstructions = "<p>Questions 14–16</p><p>Choose the correct heading.</p>";
  const headingItems: Item[] = [
    {
      number: 14,
      correct: true,
      type: "matching_headings",
      prompt: "Paragraph A",
      options: headings,
      correct_answers: ["i"],
      submitted: ["i"],
      group: 1,
      group_instructions: headingsInstructions,
    },
    {
      number: 15,
      correct: false,
      type: "matching_headings",
      prompt: "Paragraph B",
      options: headings,
      correct_answers: ["iii"],
      submitted: ["ii"],
      group: 1,
      group_instructions: headingsInstructions,
    },
    {
      number: 16,
      correct: false,
      type: "matching_headings",
      prompt: "Paragraph C",
      options: headings,
      correct_answers: ["vii"],
      group: 1,
      group_instructions: headingsInstructions,
    },
  ];

  function rowOf(number: number): HTMLElement {
    const row = screen.getByText(`Câu ${number}.`).closest("li");
    if (!row) throw new Error(`row ${number} not found`);
    return row;
  }

  function bankRow(value: string): HTMLElement {
    const bank = screen.getByRole("list", { name: "Danh sách lựa chọn" });
    const row = within(bank)
      .getAllByRole("listitem")
      .find((li) => li.firstElementChild?.textContent === value);
    if (!row) throw new Error(`bank option ${value} not found`);
    return row;
  }

  it("renders one block per group with its instructions once", () => {
    const second: Item[] = [
      { number: 17, correct: true, type: "tfng", prompt: "Claim", group: 2, group_instructions: "<p>Questions 17</p>" },
    ];
    render(<ObjectiveResultView result={readingResult([...headingItems, ...second])} />);

    expect(screen.getAllByText("Questions 14–16")).toHaveLength(1);
    expect(screen.getAllByText("Questions 17")).toHaveLength(1);
    expect(screen.getByText("Questions 14–16").closest("section")).not.toBe(
      screen.getByText("Questions 17").closest("section"),
    );
  });

  it("collapses the shared headings into a bank with ✓/✗ marks per question", () => {
    render(<ObjectiveResultView result={readingResult(headingItems)} />);

    const summary = screen.getByText("Danh sách lựa chọn (4)");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(within(bankRow("iii")).getByText("✓ câu 15")).toBeInTheDocument();
    expect(within(bankRow("ii")).getByText("✗ câu 15")).toBeInTheDocument();
  });

  it("shows compact submitted → correct keys in bank rows", () => {
    render(<ObjectiveResultView result={readingResult(headingItems)} />);

    expect(rowOf(15).textContent).toContain("ii → iii");
    expect(rowOf(16).textContent).toContain("— → vii");
    expect(rowOf(14).textContent).not.toContain("→");
    expect(screen.queryByText(/Bạn trả lời/)).not.toBeInTheDocument();
  });

  it("drops ✗ marks and shows only the key in answerKey mode", () => {
    render(<ObjectiveResultView result={readingResult(headingItems)} answerKey />);

    expect(screen.queryByText(/✗ câu/)).not.toBeInTheDocument();
    expect(within(bankRow("iii")).getByText("✓ câu 15")).toBeInTheDocument();
    expect(rowOf(15).textContent).toContain("iii");
    expect(rowOf(15).textContent).not.toContain("→");
  });

  it("keeps the per-item option list for an MCQ group, without a bank", () => {
    const mcq: Item[] = [
      {
        number: 1,
        correct: false,
        type: "mcq_single",
        prompt: "Why?",
        options: ["A one", "B two"],
        correct_answers: ["B"],
        submitted: ["A"],
        group: 1,
        group_instructions: "<p>Choose A or B.</p>",
      },
    ];
    render(<ObjectiveResultView result={readingResult(mcq)} />);

    expect(screen.queryByText(/Danh sách lựa chọn/)).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Các lựa chọn" })).toBeInTheDocument();
  });

  const paragraphItem: Item = {
    number: 27,
    correct: false,
    type: "matching_info",
    prompt: "a reference to bees",
    options: ["A", "B", "C", "D", "E", "F", "G"],
    correct_answers: ["E"],
    submitted: ["B"],
    group: 1,
  };

  it("shows matching-info answers as paragraphs and jumps to a bold-lettered paragraph", () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      Element.prototype.scrollIntoView = original;
    });
    render(
      <ObjectiveResultView
        result={readingResult([paragraphItem], "<p><strong>A</strong> First.</p><p><strong>E</strong> Fifth.</p>")}
      />,
    );

    expect(screen.getByText("Đoạn E")).toBeInTheDocument();
    expect(screen.getByText("Đoạn B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem đoạn E" }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText("Fifth.").closest("p")).toHaveClass("answer-flash");
  });

  it("hides the paragraph jump when the passage does not bold its paragraph letters", () => {
    render(<ObjectiveResultView result={readingResult([paragraphItem], "<p>E Fifth.</p>")} />);

    expect(screen.getByText("Đoạn E")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xem đoạn/ })).not.toBeInTheDocument();
  });

  it("keeps the flat list when an item has no group", () => {
    const ungrouped = headingItems.map((item) => ({ ...item, group: undefined, group_instructions: undefined }));
    render(<ObjectiveResultView result={readingResult(ungrouped)} />);

    expect(screen.queryByText(/Danh sách lựa chọn/)).not.toBeInTheDocument();
    expect(screen.queryByText("Questions 14–16")).not.toBeInTheDocument();
    expect(screen.getByText("iii — Working together")).toBeInTheDocument();
  });
  it("starts a new block when the header changes even if the group number repeats", () => {
    const collapsed: Item[] = [1, 2, 3, 4, 5].map((n) => ({
      number: n,
      correct: false,
      prompt: `Q${n}`,
      group: 1,
      group_instructions: n <= 3 ? "<p>P1</p>" : "<p>P2</p>",
    }));
    render(<ObjectiveResultView result={readingResult(collapsed)} />);

    expect(screen.getAllByText("P1")).toHaveLength(1);
    expect(screen.getAllByText("P2")).toHaveLength(1);
    expect(screen.getByText("P1").closest("section")).toContainElement(rowOf(3));
    expect(screen.getByText("P2").closest("section")).toContainElement(rowOf(4));
  });

  it("keeps a choose-N pair split over two groups as one row under the first group", () => {
    const pair: Item[] = [1, 2].map((n) => ({
      number: n,
      correct: true,
      type: "mcq_multi",
      prompt: "Which TWO?",
      correct_answers: ["A", "C"],
      submitted: ["A", "C"],
      group: n,
      group_instructions: `<p>G${n}</p>`,
    }));
    render(<ObjectiveResultView result={readingResult(pair)} />);

    const row = screen.getByText("Câu 1–2.").closest("li");
    expect(screen.getByText("G1").closest("section")).toContainElement(row);
    expect(screen.queryByText("Câu 2.")).not.toBeInTheDocument();
  });

  it("renders no header for whitespace-only instructions", () => {
    const blank: Item[] = [{ number: 1, correct: true, prompt: "Q1", group: 1, group_instructions: "  \n " }];
    const { container } = render(<ObjectiveResultView result={readingResult(blank)} />);

    expect(container.querySelector("section > .bg-ink-50")).toBeNull();
  });

  it("keeps the flat list when only some items carry a group", () => {
    const partial = headingItems.map((item, i) => (i === 1 ? { ...item, group: undefined } : item));
    render(<ObjectiveResultView result={readingResult(partial)} />);

    expect(screen.queryByText(/Danh sách lựa chọn/)).not.toBeInTheDocument();
    expect(screen.queryByText("Questions 14–16")).not.toBeInTheDocument();
  });

  it("does not treat a bold option letter mid-sentence as a paragraph letter", () => {
    render(<ObjectiveResultView result={readingResult([paragraphItem], "<p>See option <b>E</b> text</p>")} />);

    expect(screen.queryByRole("button", { name: /Xem đoạn/ })).not.toBeInTheDocument();
  });

  it("finds a paragraph letter nested inside an answer mark", () => {
    render(
      <ObjectiveResultView
        result={readingResult([paragraphItem], '<p><span data-answer-q="5"><strong>E</strong> text</span></p>')}
      />,
    );

    expect(screen.getByRole("button", { name: "Xem đoạn E" })).toBeInTheDocument();
  });

  it("does not show paragraphs for an option-less matching-info group with non-letter keys", () => {
    const named: Item = { ...paragraphItem, options: undefined, correct_answers: ["Rome"], submitted: ["Paris"] };
    render(<ObjectiveResultView result={readingResult([named])} />);

    expect(screen.queryByText(/Đoạn/)).not.toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
  });

  it("refreshes paragraph jumps when switching to a passage without bold letters", () => {
    const result: ObjectiveResult = {
      kind: "objective",
      skill: "reading",
      raw: 0,
      total: 2,
      band: 0,
      sections: [
        { passage: "<p><strong>E</strong> Fifth.</p>", items: [paragraphItem] },
        { passage: "<p>E plain.</p>", items: [{ ...paragraphItem, number: 30 }] },
      ],
    };
    render(<ObjectiveResultView result={result} />);
    expect(screen.getByRole("button", { name: "Xem đoạn E" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Passage 2" }));
    expect(screen.queryByRole("button", { name: /Xem đoạn/ })).not.toBeInTheDocument();
  });
});
