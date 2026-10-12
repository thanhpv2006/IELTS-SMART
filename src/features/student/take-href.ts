// Mock (full_test) assignments go to their own exam page, unlike single-skill
// practice. Shared by the assignments page and the student dashboard.
export const takeHref = (a: { id: string; purpose?: "practice" | "mock" }) =>
  a.purpose === "mock" ? `/student/mock/${a.id}` : `/student/take/${a.id}`;
