import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { readRtCookie, clearRtCookie } from "@/lib/auth/cookie";

export const runtime = "nodejs";

const INTERNAL_API =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8080/api/v1";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof Response) return e;
  }

  const payload = await readRtCookie();
  if (payload) {
    // Best-effort: inform backend to invalidate session; swallow errors
    try {
      await fetch(`${INTERNAL_API}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ session_id: payload.sid }),
        cache: "no-store",
      });
    } catch {
      // ignore — cookie will be cleared regardless
    }
  }

  await clearRtCookie();

  return new NextResponse(null, { status: 204 });
}
