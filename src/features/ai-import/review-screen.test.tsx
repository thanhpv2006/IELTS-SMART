import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AIImportAnswerTable,
  AIImportInventoryFile,
  AIImportJob,
  AIImportQuestionDraft,
  AIImportRegion,
  UpdateAIImportResultBody,
} from "./types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  updateResult: vi.fn(),
  confirm: vi.fn(),
  confirmClassification: vi.fn(),
  push: vi.fn(),
}));

vi.mock("./api", () => ({
  aiImportApi: {
    get: mocks.get,
    updateResult: mocks.updateResult,
    confirm: mocks.confirm,
    confirmClassification: mocks.confirmClassification,
  },
  presignAIImportUpload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

// The real editor is a Tiptap-backed dialog (noisy in jsdom); the stub keeps the one contract
// this screen depends on — onSubmit hands back an edited payload instead of writing to catalog.
vi.mock("@/features/catalog/rl-question-editor", () => ({
  RLQuestionEditor: ({
    onSubmit,
  }: {
    onSubmit?: (p: { metadata: Record<string, unknown>; prompt: string; part: number }) => Promise<void>;
  }) => (
    <button
      type="button"
      data-testid="rl-editor-apply"
      onClick={() => onSubmit?.({ metadata: { groups: [] }, prompt: "<p>reviewer fixed this</p>", part: 1 })}
    >
      apply
    </button>
  ),
}));

// Stubbed so this suite never pulls the exam engine into jsdom; what the overlay does with the
// draft is covered by src/features/preview/skill-preview-overlay.test.tsx.
vi.mock("@/features/preview/skill-preview-overlay", () => ({
  SkillPreviewOverlay: ({ mode, skill }: { mode: string; skill: string }) => (
    <div data-testid="preview-overlay" data-mode={mode} data-skill={skill} />
  ),
}));

const { ReviewScreen } = await import("./review-screen");


function draft(skill: string, part: number, metadata: Record<string, unknown> = {}): AIImportQuestionDraft {
  return { skill, part, prompt: `<p>${skill} part ${part}</p>`, metadata };
}

const EMPTY_ANSWER_TABLE: AIImportAnswerTable = {
  listening: [],
  reading: [],
  units: {},
  normalized_by: "",
};

const RL_METADATA = {
  groups: [{ type: "gap_fill", items: [{ number: 1, answer_key: ["a"] }, { number: 10, answer_key: ["b"] }] }],
};

function job(overrides: Partial<AIImportJob> = {}): AIImportJob {
  return {
    id: "job-1",
    owner_kind: "partner",
    slug: "cam-19-test-2",
    name: "Cambridge 19 Test 2",
    status: "ready_for_review",
    stage: "qc",
    model: "gpt-5.4",
    source_files: [],
    inventory: [],
    answer_table: EMPTY_ANSWER_TABLE,
    audit: [],
    classification_problems: [],
    result: {
      slug: "cam-19-test-2",
      name: "Cambridge 19 Test 2",
      questions: [
        draft("listening", 1, RL_METADATA),
        draft("reading", 1, RL_METADATA),
        draft("writing", 1),
        draft("speaking", 2),
      ],
      source_markdown: { reading: "# Reading passage one" },
    },
    prompt_tokens: 100,
    completion_tokens: 200,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

function renderScreen(initial: AIImportJob) {
  let served = initial;
  mocks.get.mockImplementation(async () => served);
  // Mirrors the backend: the PATCH response IS the new server copy, and the invalidate-driven
  // GET that follows must return the same thing — a mock that kept serving the pre-save job
  // would hide a screen that re-reads stale QC over the fresh one.
  const serveAfterSave = (next: AIImportJob) => {
    mocks.updateResult.mockImplementation(async () => {
      served = next;
      return next;
    });
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReviewScreen job={initial} />
    </QueryClientProvider>,
  );
  return { serveAfterSave };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReviewScreen", () => {
  it("lists drafts grouped by skill", () => {
    renderScreen(job());
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("Writing")).toBeInTheDocument();
    expect(screen.getByText("Speaking")).toBeInTheDocument();
    expect(screen.getAllByText(/câu 1–10/)).toHaveLength(2);
  });

  it("flags a draft whose skill QC could not recognise, and still lets it be edited", () => {
    const base = job();
    renderScreen({ ...base, result: { ...base.result, questions: [draft("speakng", 1)] } });
    expect(screen.getByText(/Kỹ năng không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByTestId("sw-draft-prompt")).toHaveValue("<p>speakng part 1</p>");
  });

  it("renders an unfinished job with no questions", () => {
    const unfinished = { ...job(), status: "generating" as const };
    unfinished.result = { slug: "", name: "", questions: [], source_markdown: {} };
    renderScreen(unfinished);
    expect(screen.getByText(/Chưa có câu hỏi nháp nào/)).toBeInTheDocument();
    expect(screen.getByTestId("ai-import-confirm")).toBeDisabled();
  });

  // Nothing gates "Tạo đề" any more: the reviewer judges the draft from the previews and decides.
  it("enables 'Tạo đề' for a reviewable job and shows no quality gate", () => {
    renderScreen(job());
    expect(screen.getByTestId("ai-import-confirm")).toBeEnabled();
    expect(screen.queryByTestId("ai-import-gate")).not.toBeInTheDocument();
  });

  it("sends the R/L edit collected in local state with the next save", async () => {
    const user = userEvent.setup();
    const before = job();
    const { serveAfterSave } = renderScreen(before);
    serveAfterSave({ ...before, updated_at: "2026-09-12T01:00:00Z" });

    await user.click(screen.getAllByRole("button", { name: "Sửa" })[0]);
    await user.click(screen.getByTestId("rl-editor-apply"));
    await user.click(screen.getByTestId("ai-import-save"));

    await waitFor(() => expect(mocks.updateResult).toHaveBeenCalledTimes(1));
    const [jobId, body] = mocks.updateResult.mock.calls[0] as [string, UpdateAIImportResultBody];
    expect(jobId).toBe("job-1");
    expect(body.result.questions[0].prompt).toBe("<p>reviewer fixed this</p>");
    expect(body.result.slug).toBe("cam-19-test-2");
  });

  it("re-seeds the draft list from the server copy a save returns", async () => {
    const user = userEvent.setup();
    const before = job();
    const { serveAfterSave } = renderScreen(before);
    const normalized = {
      ...before,
      updated_at: "2026-09-12T01:00:00Z",
      result: { ...before.result, questions: [draft("reading", 3, RL_METADATA)] },
    };
    serveAfterSave(normalized);

    await user.click(screen.getByTestId("ai-import-save"));

    await waitFor(() => expect(screen.getByText(/Part 3 · câu 1–10/)).toBeInTheDocument());
    expect(screen.queryByText("Listening")).not.toBeInTheDocument();
  });

  it("surfaces a save failure instead of pretending the edit landed", async () => {
    const user = userEvent.setup();
    renderScreen(job());
    mocks.updateResult.mockRejectedValue(new Error("Không lưu được bản sửa"));

    await user.click(screen.getByTestId("ai-import-save"));

    await waitFor(() =>
      expect(screen.getByTestId("ai-import-save-error")).toHaveTextContent("Không lưu được bản sửa"),
    );
  });

  it("navigates to /banks after a successful confirm", async () => {
    const user = userEvent.setup();
    renderScreen(job());
    mocks.confirm.mockResolvedValue({ question_set_id: "set-9" });

    await user.click(screen.getByTestId("ai-import-confirm"));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/banks"));
  });

  it("keeps both actions disabled once the job is no longer under review", () => {
    renderScreen(job({ status: "done" }));
    expect(screen.getByTestId("ai-import-save")).toBeDisabled();
    expect(screen.getByTestId("ai-import-confirm")).toBeDisabled();
  });

  it("shows the OCR source on the secondary tab", async () => {
    const user = userEvent.setup();
    renderScreen(job());

    await user.click(screen.getByTestId("ai-import-tab-source"));

    expect(screen.getByText("# Reading passage one")).toBeInTheDocument();
    expect(screen.getByText("Đề Reading — bản OCR")).toBeInTheDocument();
  });
});

describe("ReviewScreen — draft previews", () => {
  it("offers an exam preview for every skill present", () => {
    renderScreen(job());

    for (const skill of ["listening", "reading", "writing", "speaking"]) {
      expect(screen.getByTestId(`ai-import-preview-exam-${skill}`)).toBeInTheDocument();
    }
  });

  it("offers an answer-key preview only where there are answers to grade against", () => {
    renderScreen(job());

    expect(screen.getByTestId("ai-import-preview-result-reading")).toBeInTheDocument();
    expect(screen.getByTestId("ai-import-preview-result-listening")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-import-preview-result-writing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-import-preview-result-speaking")).not.toBeInTheDocument();
  });

  it("opens the exam preview for the skill whose button was pressed", async () => {
    const user = userEvent.setup();
    renderScreen(job());

    await user.click(screen.getByTestId("ai-import-preview-exam-reading"));

    const overlay = screen.getByTestId("preview-overlay");
    expect(overlay).toHaveAttribute("data-mode", "exam");
    expect(overlay).toHaveAttribute("data-skill", "reading");
  });

  it("opens the answer-key preview in result mode", async () => {
    const user = userEvent.setup();
    renderScreen(job());

    await user.click(screen.getByTestId("ai-import-preview-result-listening"));

    const overlay = screen.getByTestId("preview-overlay");
    expect(overlay).toHaveAttribute("data-mode", "result");
    expect(overlay).toHaveAttribute("data-skill", "listening");
  });

  it("keeps previews available after the job has already been imported", async () => {
    const user = userEvent.setup();
    renderScreen(job({ status: "done" }));

    await user.click(screen.getByTestId("ai-import-preview-exam-reading"));

    expect(screen.getByTestId("preview-overlay")).toBeInTheDocument();
  });

  it("shows no overlay until a preview button is pressed", () => {
    renderScreen(job());
    expect(screen.queryByTestId("preview-overlay")).not.toBeInTheDocument();
  });
});

// ─── Classification checkpoint ─────────────────────────────────────────────

const PAPER_REGION: AIImportRegion = {
  role: "reading_paper",
  skill: "reading",
  unit: 1,
  source_key: "k-paper",
  page_from: 1,
  page_to: 4,
  char_from: 0,
  char_to: 0,
  confidence: "high",
  evidence: "Thấy READING PASSAGE 1",
  source: "rubric",
};

const PAPER_FILE: AIImportInventoryFile = {
  key: "k-paper",
  filename: "de-reading.pdf",
  content_type: "application/pdf",
  bytes: 2048,
  sha256: "aa",
  pages: 8,
  has_text_layer: true,
  duration_ms: 0,
  duplicate_of: "",
  regions: [PAPER_REGION],
};

function checkpointJob(): AIImportJob {
  return {
    ...job(),
    status: "awaiting_confirm",
    stage: "classify",
    inventory: [PAPER_FILE],
    answer_table: {
      listening: [],
      reading: [{ number: 1, answer_key: ["true"], accepted_variants: [], explanation: "", source: "parser" }],
      units: { reading: [{ unit: 1, first: 1, last: 13 }] },
      normalized_by: "parser",
    },
    result: { slug: "", name: "", questions: [], source_markdown: {} },
  };
}

describe("ReviewScreen — classification checkpoint", () => {
  it("puts the problems that held the job above the classification table", () => {
    renderScreen({
      ...checkpointJob(),
      classification_problems: [
        {
          code: "classification_no_audio",
          level: "warn",
          skill: "listening",
          question: 0,
          message: "Có đề Listening nhưng chưa thấy file audio.",
        },
      ],
    });

    const problems = screen.getByTestId("ai-import-checkpoint-problems");
    expect(problems).toHaveTextContent("Có đề Listening nhưng chưa thấy file audio.");
    const confirm = screen.getByTestId("ai-import-confirm-classification");
    expect(problems.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still renders the checkpoint for a backend that does not send the problems yet", () => {
    const { classification_problems: _dropped, ...older } = checkpointJob();
    renderScreen(older as AIImportJob);

    expect(screen.getByTestId("ai-import-confirm-classification")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-import-checkpoint-problems")).not.toBeInTheDocument();
  });

  it("shows what was recognised instead of an empty draft editor", () => {
    renderScreen(checkpointJob());

    expect(screen.getByText("de-reading.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("ai-import-answer-table")).toBeInTheDocument();
    expect(screen.getByText("Đọc trực tiếp từ file đáp án", { exact: false })).toBeInTheDocument();
    // The draft actions would be dead controls here — the draft does not exist yet.
    expect(screen.queryByTestId("ai-import-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-import-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-import-tab-questions")).not.toBeInTheDocument();
  });

  it("confirms the classification once, with the regions on screen", async () => {
    const user = userEvent.setup();
    renderScreen(checkpointJob());
    mocks.confirmClassification.mockResolvedValue(undefined);

    await user.click(screen.getByTestId("ai-import-confirm-classification"));

    await waitFor(() => expect(mocks.confirmClassification).toHaveBeenCalledTimes(1));
    const [jobId, regions] = mocks.confirmClassification.mock.calls[0] as [string, AIImportRegion[]];
    expect(jobId).toBe("job-1");
    expect(regions).toEqual([PAPER_REGION]);
  });

  it("surfaces a failed confirm instead of leaving the reviewer waiting", async () => {
    const user = userEvent.setup();
    renderScreen(checkpointJob());
    mocks.confirmClassification.mockRejectedValue(new Error("Job không ở trạng thái chờ xác nhận"));

    await user.click(screen.getByTestId("ai-import-confirm-classification"));

    await waitFor(() =>
      expect(screen.getByTestId("ai-import-classification-error")).toHaveTextContent(
        "Job không ở trạng thái chờ xác nhận",
      ),
    );
  });

  it("puts the machine notes above the draft once the build is done", () => {
    renderScreen({
      ...job(),
      audit: [
        {
          code: "question_count_mismatch",
          level: "warn",
          skill: "reading",
          question: 0,
          message: "Đề có 13 câu nhưng bảng đáp án có 14 câu",
        },
      ],
    });

    expect(screen.getByTestId("ai-import-audit-question_count_mismatch")).toBeInTheDocument();
    // Advisory, not a gate: the reviewer still decides.
    expect(screen.getByTestId("ai-import-confirm")).toBeEnabled();
  });

  it("hides the notes panel when there is nothing to note", () => {
    renderScreen(job());
    expect(screen.queryByTestId("ai-import-audit")).not.toBeInTheDocument();
  });
});
