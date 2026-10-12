/**
 * Landing page per role once authenticated.
 * Role không hợp lệ / không xác định → "/login" (AUTH-04: role lạ không vào được app).
 *
 * Shared by the root redirect (app/page.tsx) and the post-login path (auth/hooks.ts)
 * so the two never drift apart.
 */
export function routeForRole(role: string | null | undefined): string {
  switch (role) {
    case "partner_owner":
      return "/dashboard";
    case "teacher":
      return "/my-dashboard";
    case "student":
      return "/student/assignments";
    default:
      return "/login";
  }
}
