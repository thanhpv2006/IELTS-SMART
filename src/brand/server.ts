import { cache } from "react";
import { headers } from "next/headers";

import { parseDomainOverrides, resolveBrand, type Brand } from "@/brand";

// Read once at boot, not per request. Deliberately NOT a NEXT_PUBLIC_ name: Next inlines those
// at build time, which would put us back on the build-time branding this replaced.
const { map: DOMAIN_OVERRIDES, invalid } = parseDomainOverrides(process.env.BRAND_DOMAINS);

if (invalid.length > 0) {
  // Warn instead of throwing: a mistyped slug must cost one domain, not every tenant.
  console.warn(`BRAND_DOMAINS: ignoring unparsable entries: ${invalid.join(", ")}`);
}

// x-forwarded-host is what the edge proxy attests the client asked for. Traefik passes Host
// through unchanged too (src/lib/auth/csrf.ts relies on that), so the two agree today.
export const getBrand = cache(async (): Promise<Brand> => {
  const h = await headers();
  return resolveBrand(h.get("x-forwarded-host") || h.get("host"), DOMAIN_OVERRIDES);
});
