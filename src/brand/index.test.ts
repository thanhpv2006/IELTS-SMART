import { describe, expect, it } from "vitest";
import { BRANDS, normalizeHost, parseDomainOverrides, resolveBrand } from "./index";

describe("normalizeHost", () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["CLASSENG.IELTSSMART.VN:3004", "classeng.ieltssmart.vn"],
    ["classeng.ieltssmart.vn.", "classeng.ieltssmart.vn"],
    ["a.com, b.com", "a.com"],
    ["[::1]", "[::1]"],
    ["[::1]:3004", "[::1]"],
    [null, ""],
    [undefined, ""],
  ];

  it.each(cases)("normalizeHost(%j) -> %j", (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });
});

describe("resolveBrand", () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["classeng.ieltssmart.vn", BRANDS.classeng.slug],
    ["classeng.localhost", BRANDS.classeng.slug],
    ["app.ieltssmart.vn", BRANDS.ieltssmart.slug],
    ["khong-ton-tai.example.com", BRANDS.ieltssmart.slug],
    [null, BRANDS.ieltssmart.slug],
    ["", BRANDS.ieltssmart.slug],
  ];

  it.each(cases)("resolveBrand(%j) -> %s", (input, expectedSlug) => {
    expect(resolveBrand(input).slug).toBe(expectedSlug);
  });

  it.each(cases)("resolveBrand(%j) with empty overrides -> %s", (input, expectedSlug) => {
    expect(resolveBrand(input, new Map()).slug).toBe(expectedSlug);
  });

  it("lets an override win over a host declared in the registry", () => {
    const { map } = parseDomainOverrides("classeng.ieltssmart.vn=ieltssmart");
    expect(resolveBrand("classeng.ieltssmart.vn", map).slug).toBe("ieltssmart");
  });

  it("resolves a host that exists only in the overrides", () => {
    const { map } = parseDomainOverrides("lms.abc.edu.vn=classeng");
    expect(resolveBrand("lms.abc.edu.vn", map).slug).toBe("classeng");
  });

  it("falls back to the registry for a host the overrides do not mention", () => {
    const { map } = parseDomainOverrides("lms.abc.edu.vn=classeng");
    expect(resolveBrand("classeng.ieltssmart.vn", map).slug).toBe("classeng");
    expect(resolveBrand("app.ieltssmart.vn", map).slug).toBe("ieltssmart");
  });
});

describe("parseDomainOverrides", () => {
  it("maps a host to the named brand", () => {
    const { map, invalid } = parseDomainOverrides("lms.abc.edu.vn=classeng");
    expect(map.get("lms.abc.edu.vn")).toBe(BRANDS.classeng);
    expect(invalid).toEqual([]);
  });

  it("normalizes the configured host the same way as a request host", () => {
    const { map } = parseDomainOverrides("LMS.ABC.EDU.VN:443=classeng");
    expect([...map.keys()]).toEqual(["lms.abc.edu.vn"]);
  });

  it("drops an entry naming an unknown slug and reports it", () => {
    const { map, invalid } = parseDomainOverrides("a.vn=khong-ton-tai,b.vn=classeng");
    expect([...map.keys()]).toEqual(["b.vn"]);
    expect(invalid).toEqual(["a.vn=khong-ton-tai"]);
  });

  it("drops an entry with no separator and reports it", () => {
    const { map, invalid } = parseDomainOverrides("a.vn,b.vn=classeng");
    expect([...map.keys()]).toEqual(["b.vn"]);
    expect(invalid).toEqual(["a.vn"]);
  });

  it("ignores stray commas without reporting them as invalid", () => {
    const { map, invalid } = parseDomainOverrides("a.vn=classeng,,b.vn=ieltssmart");
    expect([...map.keys()]).toEqual(["a.vn", "b.vn"]);
    expect(invalid).toEqual([]);
  });

  it("trims whitespace around host and slug", () => {
    const { map, invalid } = parseDomainOverrides("  a.vn = classeng ");
    expect(map.get("a.vn")).toBe(BRANDS.classeng);
    expect(invalid).toEqual([]);
  });

  it("keeps the last entry when a host is configured twice", () => {
    const { map } = parseDomainOverrides("a.vn=classeng,a.vn=ieltssmart");
    expect(map.get("a.vn")).toBe(BRANDS.ieltssmart);
  });

  it.each([null, undefined, "", ";;;===,,,"])("survives junk input %j", (raw) => {
    expect(() => parseDomainOverrides(raw)).not.toThrow();
    expect(parseDomainOverrides(raw).map.size).toBe(0);
  });

  it("reports junk entries rather than swallowing them", () => {
    expect(parseDomainOverrides(";;;===").invalid).toEqual([";;;==="]);
  });
});
