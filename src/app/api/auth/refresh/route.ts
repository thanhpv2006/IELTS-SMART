import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { readRtCookie, setRtCookie, clearRtCookie } from "@/lib/auth/cookie";

export const runtime = "nodejs";

const INTERNAL_API =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8080/api/v1";

type BackendRefreshResponse = {
  session_id: string;
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  user_id: string;
  role: string;
};

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof Response) return e;
  }

  const payload = await readRtCookie();
  if (!payload) {
    return NextResponse.json(
      { code: "unauthorized", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }

  const backendRes = await fetch(`${INTERNAL_API}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ session_id: payload.sid, refresh_token: payload.rt }),
    cache: "no-store",
  });

  if (!backendRes.ok) {
    await clearRtCookie();
    return NextResponse.json(
      { code: "unauthorized", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }

  const data = (await backendRes.json()) as BackendRefreshResponse;

  await setRtCookie(data.session_id, data.refresh_token);

  return NextResponse.json({
    access_token: data.access_token,
    access_expires_at: data.access_expires_at,
    user_id: data.user_id,
    role: data.role,
  });
}
