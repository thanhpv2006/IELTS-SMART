import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveSet: vi.fn(),
  restoreSet: vi.fn(),
  deleteSet: vi.fn(),
}));

vi.mock("@/features/catalog/api", () => ({ catalogApi: mocks }));

const { lifecycleMessage, useSetLifecycle } = await import("./use-set-lifecycle");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetLifecycle(), { wrapper });
  return { client, result };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.archiveSet.mockResolvedValue(undefined);
  mocks.restoreSet.mockResolvedValue(undefined);
  mocks.deleteSet.mockResolvedValue(undefined);
});

describe("lifecycleMessage", () => {
  it("reports a full success", () => {
    expect(lifecycleMessage("archive", 2, [])).toEqual({ text: "Đã lưu trữ 2 đề.", tone: "success" });
  });

  it("reports partial failure with deduped reasons", () => {
    expect(lifecycleMessage("delete", 3, ["Không tìm thấy", "Không tìm thấy"])).toEqual({
      text: "Đã xoá 1/3 đề. Không xoá được 2 đề: Không tìm thấy",
      tone: "error",
    });
  });
});

describe("useSetLifecycle", () => {
  it("splits succeeded and failed ids", async () => {
    mocks.deleteSet.mockImplementation((id: string) =>
      id === "b" ? Promise.reject(new Error("Không tìm thấy")) : Promise.resolve(),
    );
    const { result } = setup();

    let outcome: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      outcome = await result.current.run("delete", ["a", "b"]);
    });

    expect(mocks.deleteSet).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ succeeded: ["a"], failed: ["b"] });
    expect(result.current.message).toEqual({
      text: "Đã xoá 1/2 đề. Không xoá được 1 đề: Không tìm thấy",
      tone: "error",
    });
    expect(result.current.pending).toBe(false);
  });

  it("restores through the restore endpoint", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.run("restore", ["a"]);
    });

    expect(mocks.restoreSet).toHaveBeenCalledWith("a");
    expect(result.current.message).toEqual({ text: "Đã khôi phục 1 đề.", tone: "success" });
  });

  it("drops a deleted set's detail cache and invalidates an archived one", async () => {
    const { client, result } = setup();
    client.setQueryData(["catalog-set", "a"], { id: "a" });
    client.setQueryData(["catalog-set", "b"], { id: "b" });

    await act(async () => {
      await result.current.run("delete", ["a"]);
      await result.current.run("archive", ["b"]);
    });

    expect(client.getQueryData(["catalog-set", "a"])).toBeUndefined();
    expect(client.getQueryState(["catalog-set", "b"])?.isInvalidated).toBe(true);
  });

  it("ignores a second run while the first is still in flight", async () => {
    let release: () => void = () => {};
    mocks.archiveSet.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const { result } = setup();

    let second: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      const first = result.current.run("archive", ["a"]);
      second = await result.current.run("archive", ["b"]);
      release();
      await first;
    });

    expect(second).toEqual({ succeeded: [], failed: [] });
    expect(mocks.archiveSet).toHaveBeenCalledTimes(1);
    expect(mocks.archiveSet).toHaveBeenCalledWith("a");
  });

  it("does nothing for an empty selection", async () => {
    const { result } = setup();

    let outcome: Awaited<ReturnType<typeof result.current.run>> | undefined;
    await act(async () => {
      outcome = await result.current.run("archive", []);
    });

    expect(outcome).toEqual({ succeeded: [], failed: [] });
    expect(mocks.archiveSet).not.toHaveBeenCalled();
    expect(result.current.message).toBeNull();
  });
});
