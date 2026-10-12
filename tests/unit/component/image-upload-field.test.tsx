/**
 * Component tests for ImageUploadField.
 * Covers CMP-02.
 *
 * Cases:
 *   CMP-02a — Renders URL text input and Upload button.
 *   CMP-02b — Pasting a URL into the input calls onChange with the new URL.
 *   CMP-02c — Upload button becomes "Đang tải..." and disabled while uploading.
 *   CMP-02d — Successful upload calls onChange with the public_url.
 *   CMP-02e — Upload failure shows error message.
 *   CMP-02f — "Xoá" button appears when value is set; clicking it clears value.
 *   CMP-02g — Preview <img> renders when value is a URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageUploadField } from "@/components/ui/image-upload-field";

// mediaApi.presignUpload is called internally — mock the whole api module.
vi.mock("@/features/partner/api", () => ({
  mediaApi: {
    presignUpload: vi.fn(),
  },
}));

import { mediaApi } from "@/features/partner/api";
const mockPresign = mediaApi.presignUpload as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPresign.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CMP-02a — Renders URL input and Upload button", () => {
  it("renders a url text input", () => {
    render(<ImageUploadField onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders Upload button", () => {
    render(<ImageUploadField onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
  });
});

describe("CMP-02b — Typing a URL into the input calls onChange", () => {
  it("calls onChange each time a character is typed into the URL input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // The input is controlled: value prop is passed by the parent. Because this
    // test renders with value=undefined the input stays empty and onChange
    // receives e.target.value || undefined on each keystroke.
    render(<ImageUploadField onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "https");
    // Five characters → onChange called 5 times.
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("calls onChange with undefined when input is cleared (empty string)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Start with a value already set so we can clear it.
    render(<ImageUploadField value="https://cdn.example.com/img.jpg" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    // Select all and delete
    await user.clear(input);
    // onChange("") || undefined → onChange(undefined)
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("CMP-02c — Upload button disabled while uploading", () => {
  it("shows 'Đang tải...' and is disabled during upload", async () => {
    const user = userEvent.setup();
    // Presign resolves only after we control it — keep it hanging.
    let resolvePresign!: (v: unknown) => void;
    mockPresign.mockReturnValue(
      new Promise((r) => { resolvePresign = r; })
    );

    render(<ImageUploadField onChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["img"], "photo.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /đang tải/i })).toBeDisabled()
    );

    // Cleanup: resolve the pending promise.
    resolvePresign({ upload_url: "https://s3.example.com/upload", public_url: "https://cdn.example.com/img.png" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  });
});

describe("CMP-02d — Successful upload calls onChange with public_url", () => {
  it("calls onChange with the returned public_url after upload", async () => {
    const user = userEvent.setup();
    mockPresign.mockResolvedValue({
      upload_url: "https://s3.example.com/put",
      public_url: "https://cdn.example.com/uploaded.png",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const onChange = vi.fn();
    render(<ImageUploadField onChange={onChange} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["img"], "photo.png", { type: "image/png" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://cdn.example.com/uploaded.png")
    );
  });
});

describe("CMP-02e — Upload failure shows error message", () => {
  it("shows error message when presign fails", async () => {
    const user = userEvent.setup();
    mockPresign.mockRejectedValue(new Error("Presign thất bại"));

    render(<ImageUploadField onChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["x"], "bad.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByText(/presign thất bại/i)).toBeInTheDocument()
    );
  });

  it("shows error message when S3 PUT returns non-OK status", async () => {
    const user = userEvent.setup();
    mockPresign.mockResolvedValue({
      upload_url: "https://s3.example.com/put",
      public_url: "https://cdn.example.com/img.png",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));

    render(<ImageUploadField onChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["x"], "img.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByText(/upload thất bại/i)).toBeInTheDocument()
    );
  });
});

describe("CMP-02f — Xoá button clears the value", () => {
  it("Xoá button is present when value is set", () => {
    render(
      <ImageUploadField value="https://cdn.example.com/img.png" onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /xoá/i })).toBeInTheDocument();
  });

  it("Xoá button is absent when no value", () => {
    render(<ImageUploadField onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /xoá/i })).not.toBeInTheDocument();
  });

  it("clicking Xoá calls onChange with undefined", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImageUploadField value="https://cdn.example.com/img.png" onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /xoá/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("CMP-02g — Preview image renders when value is set", () => {
  it("renders an <img> with the correct src", () => {
    render(
      <ImageUploadField value="https://cdn.example.com/preview.png" onChange={vi.fn()} />
    );
    const img = screen.getByRole("img", { name: /stimulus preview/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://cdn.example.com/preview.png");
  });

  it("does not render a preview <img> when no value", () => {
    render(<ImageUploadField onChange={vi.fn()} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
