import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedZipFolder } from "./zip";
import type { JSONImportRequest } from "./types";

const mocks = vi.hoisted(() => ({
  readZip: vi.fn(),
  validate: vi.fn(),
  importSets: vi.fn(),
  uploadJSONImportMedia: vi.fn(),
}));

vi.mock("./zip", () => ({ readZip: mocks.readZip }));
vi.mock("./api", () => ({
  jsonImportApi: { validate: mocks.validate, importSets: mocks.importSets },
  uploadJSONImportMedia: mocks.uploadJSONImportMedia,
}));

const { JSONZipImportDialog } = await import("./json-zip-import-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function listeningFolder(name: string): LoadedZipFolder {
  return {
    key: `de/${name}`,
    name,
    picked: [{ file: new File(["{}"], "listening.json"), skill: "listening", content: { audio_url: "a.mp3" }, parseError: null }],
    media: [new File(["x"], "a.mp3", { type: "audio/mpeg" })],
    ignored: ["de/" + name + "/Listening.pdf"],
    skillError: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readZip.mockResolvedValue({ folders: [listeningFolder("C17 - Listening 1"), listeningFolder("C17 - Listening 2")], ignored: [] });
  mocks.validate.mockImplementation(async (body: JSONImportRequest) => ({
    plan: [{ title: body.name, kind: "practice", skill: "listening", part: 1, question_count: 1 }],
    problems: body.name.endsWith("2") ? [{ file: "listening.json", path: "", message: "Listening phải có đủ câu 1–40." }] : [],
    media_refs: [{ file: "listening.json", pointer: "/audio_url", value: "a.mp3", local: true }],
    drafts: [],
  }));
  mocks.uploadJSONImportMedia.mockResolvedValue("https://cdn/a.mp3");
  mocks.importSets.mockImplementation(async (body: JSONImportRequest) => ({
    sets: [{ id: "s1", title: body.name, kind: "practice", skill: "listening", question_count: 1 }],
  }));
});

describe("JSONZipImportDialog", () => {
  it("checks every folder, preselects only the valid one and imports it", async () => {
    const user = userEvent.setup();
    render(<JSONZipImportDialog open onClose={() => {}} />, { wrapper });

    await user.upload(screen.getByTestId("zip-import-file"), new File(["zip"], "de.zip", { type: "application/zip" }));

    await waitFor(() => expect(screen.getByTestId("zip-import-submit")).toHaveTextContent("Nhập 1 đề đã chọn"));
    expect(screen.getByTestId("zip-folder-check-0")).toBeChecked();
    expect(screen.getByTestId("zip-folder-check-1")).toBeDisabled();
    expect(screen.getByTestId("zip-folder-1")).toHaveTextContent("1 lỗi");

    await user.click(screen.getByTestId("zip-import-submit"));

    await waitFor(() => expect(screen.getByTestId("zip-created-s1")).toHaveAttribute("href", "/banks/s1"));
    expect(mocks.importSets).toHaveBeenCalledTimes(1);
    const [body] = mocks.importSets.mock.calls[0] as [JSONImportRequest];
    expect(body.name).toBe("C17 - Listening 1");
    expect((body.files[0].content as { audio_url: string }).audio_url).toBe("https://cdn/a.mp3");
  });

  it("stops after a folder fails and warns about possible duplicates", async () => {
    const user = userEvent.setup();
    mocks.validate.mockImplementation(async (body: JSONImportRequest) => ({
      plan: [{ title: body.name, kind: "practice", skill: "listening", part: 1, question_count: 1 }],
      problems: [],
      media_refs: [{ file: "listening.json", pointer: "/audio_url", value: "a.mp3", local: true }],
      drafts: [],
    }));
    mocks.importSets.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<JSONZipImportDialog open onClose={() => {}} />, { wrapper });

    await user.upload(screen.getByTestId("zip-import-file"), new File(["zip"], "de.zip"));
    await waitFor(() => expect(screen.getByTestId("zip-import-submit")).toHaveTextContent("Nhập 2 đề đã chọn"));
    await user.click(screen.getByTestId("zip-import-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("zip-folder-error-0")).toHaveTextContent("kiểm tra danh sách bộ đề trước khi nhập lại"),
    );
    expect(mocks.importSets).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("zip-folder-1")).toHaveTextContent("Chưa nhập");
  });

  it("shows why the zip could not be read", async () => {
    const user = userEvent.setup();
    mocks.readZip.mockRejectedValue(new Error("Không đọc được file zip: End of central directory not found"));
    render(<JSONZipImportDialog open onClose={() => {}} />, { wrapper });

    await user.upload(screen.getByTestId("zip-import-file"), new File(["x"], "bad.zip"));

    expect(await screen.findByTestId("zip-import-read-error")).toHaveTextContent("Không đọc được file zip");
  });
});
