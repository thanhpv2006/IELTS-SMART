import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiFetch: mocks.apiFetch }));

import { catalogApi } from "./api";

type Query = { limit?: number; offset?: number; status?: string };

const BACKEND_DEFAULT_LIMIT = 50;

function serveSets(total: number) {
  mocks.apiFetch.mockImplementation(async (_path: string, opts: { query?: Query }) => {
    const limit = opts.query?.limit ?? BACKEND_DEFAULT_LIMIT;
    const offset = opts.query?.offset ?? 0;
    const count = Math.max(0, Math.min(limit, total - offset));
    const items = Array.from({ length: count }, (_, i) => ({ id: `set-${offset + i}`, kind: "practice" }));
    return { items, total };
  });
}

describe("catalogApi.listSets", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
  });

  it("walks every page so a picker sees sets past the first page", async () => {
    serveSets(250);

    const sets = await catalogApi.listSets({ status: "published" });

    expect(sets).toHaveLength(250);
    expect(new Set(sets.map((s) => s.id)).size).toBe(250);
    const queries = mocks.apiFetch.mock.calls.map(([, opts]) => (opts as { query?: Query }).query);
    expect(queries.map((q) => q?.offset ?? 0).sort((a, b) => a - b)).toEqual([0, 200]);
    expect(queries.every((q) => q?.status === "published")).toBe(true);
  });

  it("stops after one request when everything fits on the first page", async () => {
    serveSets(30);

    const sets = await catalogApi.listSets();

    expect(sets).toHaveLength(30);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("catalogApi set lifecycle", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
  });

  it("archiveSet posts status archived", async () => {
    await catalogApi.archiveSet("s1");

    expect(mocks.apiFetch).toHaveBeenCalledWith("/smart/catalog/question-sets/s1/status", {
      method: "POST",
      body: { status: "archived" },
    });
  });

  it("restoreSet posts status draft", async () => {
    await catalogApi.restoreSet("s1");

    expect(mocks.apiFetch).toHaveBeenCalledWith("/smart/catalog/question-sets/s1/status", {
      method: "POST",
      body: { status: "draft" },
    });
  });

  it("deleteSet sends a DELETE request", async () => {
    await catalogApi.deleteSet("s1");

    expect(mocks.apiFetch).toHaveBeenCalledWith("/smart/catalog/question-sets/s1", {
      method: "DELETE",
    });
  });
});
