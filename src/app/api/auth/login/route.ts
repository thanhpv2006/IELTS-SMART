import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { setRtCookie } from "@/lib/auth/cookie";

export const runtime = "nodejs";

const INTERNAL_API =
  process.env.INTERNAL_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8080/api/v1";

type BackendLoginResponse = {
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

  let body: { email: string; password: string };
  try {
    body = (await req.json()) as { email: string; password: string };
  } catch {
    return NextResponse.json(
      { code: "validation_error", message: "Dữ liệu không hợp lệ." },
      { status: 400 },
    );
  }

  const backendRes = await fetch(`${INTERNAL_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: "no-store",
  });

  if (!backendRes.ok) {
    // Forward backend error as-is (message is already in Vietnamese)
    const errBody = await backendRes.json().catch(() => ({
      code: "unknown",
      message: "Đăng nhập thất bại. Vui lòng thử lại.",
    }));
    return NextResponse.json(errBody, { status: backendRes.status });
  }

  const data = (await backendRes.json()) as BackendLoginResponse;

  await setRtCookie(data.session_id, data.refresh_token);

  // Return only the access pair + identity to the client; never expose refresh_token
  return NextResponse.json({
    access_token: data.access_token,
    access_expires_at: data.access_expires_at,
    user_id: data.user_id,
    role: data.role,
  });
}
