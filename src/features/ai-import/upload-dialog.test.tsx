import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartAIImportBody } from "./types";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  presign: vi.fn(),
}));

vi.mock("./api", () => ({
  aiImportApi: { start: mocks.start },
  presignAIImportUpload: mocks.presign,
}));

const { UploadDialog, unsupportedFileMessage } = await import("./upload-dialog");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

function renderDialog() {
  const onCreated = vi.fn();
  render(<UploadDialog open onClose={vi.fn()} onCreated={onCreated} />);
  return { onCreated };
}

async function fillMeta(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("ai-import-name"), "Cambridge 19 Test 2");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.presign.mockImplementation(async (_media: string, f: File) => ({
    upload_url: `https://storage.test/put/${f.name}`,
    public_url: `https://cdn.test/${f.name}`,
    key: `ai-import/${f.name}`,
  }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
});

describe("unsupportedFileMessage", () => {
  it("accepts every type the presign whitelist allows", () => {
    for (const type of [
      "application/pdf",
      DOCX_MIME,
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
      "audio/webm",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]) {
      expect(unsupportedFileMessage(type)).toBeNull();
    }
  });

  it("rejects a type the pipeline cannot read", () => {
    expect(unsupportedFileMessage("audio/ogg")).toContain("audio/ogg");
    expect(unsupportedFileMessage("text/plain")).toContain("PDF");
  });

  it("rejects a file the browser could not type at all", () => {
    expect(unsupportedFileMessage("")).toContain("Không nhận diện được");
  });
});

describe("UploadDialog — pool upload", () => {
  it("uploads every file picked in one go, with no classification asked of the customer", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByTestId("ai-import-files"), [
      file("de-reading.pdf", "application/pdf"),
      file("dap-an.docx", DOCX_MIME),
      file("bai-nghe.mp3", "audio/mpeg"),
    ]);

    await waitFor(() => expect(mocks.presign).toHaveBeenCalledTimes(3));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "https://storage.test/put/de-reading.pdf",
      "https://storage.test/put/dap-an.docx",
      "https://storage.test/put/bai-nghe.mp3",
    ]);
    await waitFor(() => expect(screen.getAllByText("Đã tải lên")).toHaveLength(3));
    // The presign media_type is still per-file, derived from the content type, not from a slot.
    expect(mocks.presign.mock.calls.map(([media]) => media)).toEqual(["document", "document", "audio"]);
  });

  it("sends kind:\"unknown\" for every file, leaving the role to the backend", async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.start.mockResolvedValue({ job_id: "job-7" });

    await user.upload(screen.getByTestId("ai-import-files"), [file("tailieu.pdf", "application/pdf")]);
    await waitFor(() => expect(screen.getByText("Đã tải lên")).toBeInTheDocument());
    await fillMeta(user);
    await user.click(screen.getByTestId("ai-import-submit"));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const [body] = mocks.start.mock.calls[0] as [StartAIImportBody];
    expect(body.slug).toBe("cambridge-19-test-2");
    expect(body.files).toEqual([
      {
        kind: "unknown",
        key: "ai-import/tailieu.pdf",
        filename: "tailieu.pdf",
        content_type: "application/pdf",
      },
    ]);
  });

  // The accept attribute filters by extension only, so a file the browser types as something
  // else still reaches the pool — and the presign whitelist would reject it minutes later.
  it("rejects a type outside the whitelist without spending a presign", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByTestId("ai-import-files"), [
      file("dap-an.pdf", "application/octet-stream"),
    ]);

    expect(screen.getByTestId("ai-import-pool-error-dap-an.pdf")).toHaveTextContent(
      "application/octet-stream",
    );
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("applies the same whitelist to a dropped file, which bypasses the accept attribute", () => {
    renderDialog();

    fireEvent.drop(screen.getByText(/Kéo thả file vào đây/), {
      dataTransfer: { files: [file("ghichu.txt", "text/plain")] },
    });

    expect(screen.getByTestId("ai-import-pool-error-ghichu.txt")).toHaveTextContent("text/plain");
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it("uploads a dropped file the whitelist allows", async () => {
    renderDialog();

    fireEvent.drop(screen.getByText(/Kéo thả file vào đây/), {
      dataTransfer: { files: [file("de-reading.pdf", "application/pdf")] },
    });

    await waitFor(() => expect(screen.getByText("Đã tải lên")).toBeInTheDocument());
    expect(mocks.presign).toHaveBeenCalledTimes(1);
  });

  // A silent PUT failure would submit a job pointing at a key storage never received.
  it("marks only the file whose PUT failed, keeping the rest uploaded", async () => {
    const user = userEvent.setup();
    renderDialog();
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith("dap-an.docx") ? new Response(null, { status: 500 }) : new Response(null, { status: 200 }),
    );

    await user.upload(screen.getByTestId("ai-import-files"), [
      file("de-reading.pdf", "application/pdf"),
      file("dap-an.docx", DOCX_MIME),
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("ai-import-pool-error-dap-an.docx")).toHaveTextContent("500"),
    );
    expect(screen.getAllByText("Đã tải lên")).toHaveLength(1);
  });

  it("leaves a failed upload out of the job's file list", async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.start.mockResolvedValue({ job_id: "job-8" });
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith("dap-an.docx") ? new Response(null, { status: 500 }) : new Response(null, { status: 200 }),
    );

    await user.upload(screen.getByTestId("ai-import-files"), [
      file("de-reading.pdf", "application/pdf"),
      file("dap-an.docx", DOCX_MIME),
    ]);
    await waitFor(() => expect(screen.getByTestId("ai-import-pool-error-dap-an.docx")).toBeInTheDocument());
    await fillMeta(user);
    await user.click(screen.getByTestId("ai-import-submit"));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const [body] = mocks.start.mock.calls[0] as [StartAIImportBody];
    expect(body.files.map((f) => f.filename)).toEqual(["de-reading.pdf"]);
  });

  it("refuses to start a run with nothing uploaded", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillMeta(user);
    await user.click(screen.getByTestId("ai-import-submit"));

    expect(screen.getByTestId("ai-import-error")).toHaveTextContent("Chưa có file nào");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("refuses to start a run with no name, before touching the API", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByTestId("ai-import-files"), [file("tailieu.pdf", "application/pdf")]);
    await waitFor(() => expect(screen.getByText("Đã tải lên")).toBeInTheDocument());
    await user.click(screen.getByTestId("ai-import-submit"));

    expect(screen.getByTestId("ai-import-error")).toHaveTextContent("tên đề");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("drops a file from the pool when it is removed", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByTestId("ai-import-files"), [file("tailieu.pdf", "application/pdf")]);
    await waitFor(() => expect(screen.getByText("Đã tải lên")).toBeInTheDocument());
    await user.click(screen.getByTestId("ai-import-pool-remove-tailieu.pdf"));

    expect(screen.queryByTestId("ai-import-pool-item-tailieu.pdf")).not.toBeInTheDocument();
  });
});
