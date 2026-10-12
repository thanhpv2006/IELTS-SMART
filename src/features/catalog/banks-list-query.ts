import type { CatalogSetKind, CatalogSkill, CatalogStatus } from "./types";
import { SET_KIND_LABELS, SKILL_LABELS } from "./types";

export type BanksListQuery = {
  tab: "mine" | "library";
  kind: "" | CatalogSetKind;
  skill: "" | CatalogSkill;
  status: "" | CatalogStatus;
  page: number;
};

const STATUSES: readonly CatalogStatus[] = ["draft", "published", "archived"];
const LIST_HREF_KEY = "banks:list-href";

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): "" | T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

export function parseBanksListQuery(params: Pick<URLSearchParams, "get">): BanksListQuery {
  const page = Number(params.get("page"));
  return {
    tab: params.get("tab") === "library" ? "library" : "mine",
    kind: oneOf(params.get("kind"), Object.keys(SET_KIND_LABELS) as CatalogSetKind[]),
    skill: oneOf(params.get("skill"), Object.keys(SKILL_LABELS) as CatalogSkill[]),
    status: oneOf(params.get("status"), STATUSES),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function banksListHref(query: BanksListQuery): string {
  const params = new URLSearchParams();
  if (query.tab === "library") params.set("tab", "library");
  if (query.kind) params.set("kind", query.kind);
  if (query.skill) params.set("skill", query.skill);
  if (query.status) params.set("status", query.status);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/banks?${search}` : "/banks";
}

// sessionStorage throws in some private-browsing modes; losing the list position there is acceptable.
export function rememberBanksListHref(href: string): void {
  try {
    sessionStorage.setItem(LIST_HREF_KEY, href);
  } catch {
    return;
  }
}

export function lastBanksListHref(): string {
  try {
    return sessionStorage.getItem(LIST_HREF_KEY) ?? "/banks";
  } catch {
    return "/banks";
  }
}
