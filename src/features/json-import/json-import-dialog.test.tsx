import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { JSONImportFileInput } from "./types";

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  importSets: vi.fn(),
  uploadJSONImportMedia: vi.fn(),
}));

vi.mock("./api", () => ({
  jsonImportApi: { validate: mocks.validate, importSets: mocks.importSets },
  uploadJSONImportMedia: mocks.uploadJSONImportMedia,
}));

vi.mock("@/features/preview/skill-preview-overlay", () => ({
  SkillPreviewOverlay: ({ skill }: { skill: string }) => <div data-testid={`preview-overlay-${skill}`} />,
}));

const { JSONImportDialog } = await import("./json-import-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function open(onClose: () => void = () => {}) {
  return render(<JSONImportDialog open onClose={onClose} />, { wrapper });
}

const CLEAN_REPORT = {
  plan: [{ title: "T — Listening", kind: "practice" as const, skill: "listening", part: null, question_count: 1 }],
  problems: [],
  media_refs: [{ file: "listening.json", pointer: "/audio_url", value: "a.mp3", local: true }],
  drafts: [{ file: "listening.json", label: "", skill: "listening", part: 1, prompt: "<p>x</p>", metadata: {} }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validate.mockResolvedValue(CLEAN_REPORT);
  mocks.uploadJSONImportMedia.mockResolvedValue("https://cdn/a.mp3");
  mocks.importSets.mockResolvedValue({
    sets: [{ id: "s1", title: "T — Listening", kind: "practice", skill: "listening", question_count: 1 }],
  });
});

async function uploadJSONAndMedia(user: ReturnType<typeof userEvent.setup>) {
  const jsonFile = new File(
    [JSON.stringify({ audio_url: "a.mp3", groups: [] })],
    "listening.json",
    { type: "application/json" },
  );
  const mediaFile = new File(["x"], "a.mp3", { type: "audio/mpeg" });
  await user.upload(screen.getByTestId("json-import-files"), [jsonFile, mediaFile]);
}

describe("JSONImportDialog", () => {
  it("validates, uploads matched media, imports, and links to the created set", async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByTestId("json-import-name"), "T");
    await uploadJSONAndMedia(user);

    await waitFor(() =>
      expect(screen.getByTestId("json-import-skill-listening.json")).toHaveValue("listening"),
    );

    expect(screen.getByTestId("json-import-submit")).toBeDisabled();

    await user.click(screen.getByTestId("json-import-validate"));
    await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByTestId("json-import-submit")).toBeEnabled());
    await user.click(screen.getByTestId("json-import-submit"));

    await waitFor(() => expect(mocks.importSets).toHaveBeenCalledTimes(1));
    const [{ files }] = mocks.importSets.mock.calls[0] as [{ files: JSONImportFileInput[] }];
    expect((files[0].content as { audio_url: string }).audio_url).toBe("https://cdn/a.mp3");

    expect(await screen.findByTestId("json-import-created-s1")).toHaveAttribute("href", "/banks/s1");
  });

  it("locks Nhập đề again once the name changes after Kiểm tra", async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByTestId("json-import-name"), "T");
    await uploadJSONAndMedia(user);
    await waitFor(() =>
      expect(screen.getByTestId("json-import-skill-listening.json")).toHaveValue("listening"),
    );

    await user.click(screen.getByTestId("json-import-validate"));
    await waitFor(() => expect(screen.getByTestId("json-import-submit")).toBeEnabled());

    await user.type(screen.getByTestId("json-import-name"), "2");

    expect(screen.getByTestId("json-import-submit")).toBeDisabled();
  });

  it.each([
    {
      label: "a partial-import 500",
      error: new ApiError(500, { code: "json_import_partial", message: "Nhập dở dang: đã tạo 1/2 bộ đề." }),
      text: "Nhập dở dang: đã tạo 1/2 bộ đề.",
    },
    {
      label: "a network failure",
      error: new TypeError("Failed to fetch"),
      text: "Một số bộ đề có thể đã được tạo — kiểm tra danh sách bộ đề trước khi nhập lại để tránh trùng.",
    },
  ])("locks Nhập đề until the next Kiểm tra after $label", async ({ error, text }) => {
    const user = userEvent.setup();
    mocks.importSets.mockRejectedValue(error);
    open();

    await user.type(screen.getByTestId("json-import-name"), "T");
    await uploadJSONAndMedia(user);
    await waitFor(() =>
      expect(screen.getByTestId("json-import-skill-listening.json")).toHaveValue("listening"),
    );

    await user.click(screen.getByTestId("json-import-validate"));
    await waitFor(() => expect(screen.getByTestId("json-import-submit")).toBeEnabled());
    await user.click(screen.getByTestId("json-import-submit"));

    await waitFor(() => expect(screen.getByTestId("json-import-submit")).toBeDisabled());
    expect(screen.getByTestId("json-import-error")).toHaveTextContent(text);
  });

  it("keeps Nhập đề available when only the media upload fails", async () => {
    const user = userEvent.setup();
    mocks.uploadJSONImportMedia.mockRejectedValue(new Error("Upload thất bại: a.mp3"));
    open();

    await user.type(screen.getByTestId("json-import-name"), "T");
    await uploadJSONAndMedia(user);
    await waitFor(() =>
      expect(screen.getByTestId("json-import-skill-listening.json")).toHaveValue("listening"),
    );

    await user.click(screen.getByTestId("json-import-validate"));
    await waitFor(() => expect(screen.getByTestId("json-import-submit")).toBeEnabled());
    await user.click(screen.getByTestId("json-import-submit"));

    await waitFor(() => expect(screen.getByTestId("json-import-error")).toHaveTextContent("Upload thất bại: a.mp3"));
    expect(screen.getByTestId("json-import-error")).not.toHaveTextContent("Một số bộ đề");
    expect(mocks.importSets).not.toHaveBeenCalled();
    expect(screen.getByTestId("json-import-submit")).toBeEnabled();
  });

  it("closes only the preview, not the import dialog, on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    open(onClose);

    await user.type(screen.getByTestId("json-import-name"), "T");
    await uploadJSONAndMedia(user);
    await waitFor(() =>
      expect(screen.getByTestId("json-import-skill-listening.json")).toHaveValue("listening"),
    );
    await user.click(screen.getByTestId("json-import-validate"));
    await user.click(await screen.findByTestId("json-import-preview-listening"));
    expect(screen.getByTestId("preview-overlay-listening")).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("preview-overlay-listening")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("json-import-name")).toHaveValue("T");
  });
});
