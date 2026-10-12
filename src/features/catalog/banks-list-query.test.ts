import { afterEach, describe, expect, it, vi } from "vitest";
import {
  banksListHref,
  lastBanksListHref,
  parseBanksListQuery,
  rememberBanksListHref,
} from "./banks-list-query";

describe("parseBanksListQuery", () => {
  it("reads tab, filters and page from the URL", () => {
    const q = parseBanksListQuery(new URLSearchParams("kind=practice&skill=reading&status=draft&page=10"));
    expect(q).toEqual({ tab: "mine", kind: "practice", skill: "reading", status: "draft", page: 10 });
    expect(parseBanksListQuery(new URLSearchParams("tab=library")).tab).toBe("library");
  });

  it("falls back to defaults for missing or unknown values", () => {
    const q = parseBanksListQuery(new URLSearchParams("kind=bogus&skill=math&status=x&page=-3"));
    expect(q).toEqual({ tab: "mine", kind: "", skill: "", status: "", page: 1 });
    expect(parseBanksListQuery(new URLSearchParams("page=abc")).page).toBe(1);
  });
});

describe("banksListHref", () => {
  it("omits defaults so the first page of the mine tab is plain /banks", () => {
    expect(banksListHref({ tab: "mine", kind: "", skill: "", status: "", page: 1 })).toBe("/banks");
  });

  it("round-trips through parseBanksListQuery", () => {
    const q = { tab: "mine", kind: "practice", skill: "reading", status: "draft", page: 10 } as const;
    const href = banksListHref(q);
    expect(href).toBe("/banks?kind=practice&skill=reading&status=draft&page=10");
    expect(parseBanksListQuery(new URLSearchParams(href.split("?")[1]))).toEqual(q);
  });
});

describe("remembered list href", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns the last remembered list URL, or /banks when none", () => {
    expect(lastBanksListHref()).toBe("/banks");
    rememberBanksListHref("/banks?page=10");
    expect(lastBanksListHref()).toBe("/banks?page=10");
  });

  it("falls back to /banks when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberBanksListHref("/banks?page=2")).not.toThrow();
    expect(lastBanksListHref()).toBe("/banks");
  });
});
