import { describe, it, expect } from "vitest";
import { routeForRole } from "@/features/auth/routing";

// Single source of truth for role-based redirects (used by app/page.tsx and auth/hooks.ts).
// AUTH-01/02/03: role hợp lệ → trang chủ đúng. AUTH-04: role lạ → /login.
describe("routeForRole", () => {
  it("AUTH-01: partner_owner → /dashboard", () => {
    expect(routeForRole("partner_owner")).toBe("/dashboard");
  });

  it("AUTH-02: teacher → /my-dashboard", () => {
    expect(routeForRole("teacher")).toBe("/my-dashboard");
  });

  it("AUTH-03: student → /student/assignments", () => {
    expect(routeForRole("student")).toBe("/student/assignments");
  });

  it("AUTH-04: role lạ (admin) → /login", () => {
    expect(routeForRole("admin")).toBe("/login");
  });

  it("AUTH-04: role rỗng/null/undefined → /login", () => {
    expect(routeForRole("")).toBe("/login");
    expect(routeForRole(null)).toBe("/login");
    expect(routeForRole(undefined)).toBe("/login");
  });

  it("AUTH-04: role không xác định khác → /login", () => {
    for (const r of ["owner", "Teacher", "STUDENT", "superuser", "guest"]) {
      expect(routeForRole(r)).toBe("/login");
    }
  });
});
