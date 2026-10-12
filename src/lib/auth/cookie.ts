import { cookies } from "next/headers";

const COOKIE = "ielts_smart_rt";

type RtPayload = { sid: string; rt: string };

export async function setRtCookie(sid: string, rt: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify({ sid, rt } satisfies RtPayload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 2_592_000, // 30 days
  });
}

export async function readRtCookie(): Promise<RtPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RtPayload;
    if (!parsed?.sid || !parsed?.rt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearRtCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}
