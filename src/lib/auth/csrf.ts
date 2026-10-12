/**
 * Lightweight same-origin guard.
 * Compares the `origin` header host against the `host` header.
 * Throws a 403 Response when they differ.
 * Skips check when `origin` is absent — same-origin fetch from Server Components
 * may omit the header, and that is safe.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // no origin header → allow (SSR/same-origin)

  const host = req.headers.get("host");
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Response(
        JSON.stringify({ code: "forbidden", message: "Yêu cầu không hợp lệ." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    if (e instanceof Response) throw e;
    // Malformed origin header — treat as mismatch
    throw new Response(
      JSON.stringify({ code: "forbidden", message: "Yêu cầu không hợp lệ." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}
