export type Brand = {
  slug: string;
  domains: string[];
  name: string;
  title: string;
  description: string;
  loginTagline: string;
  logo: string;
  icon: string;
  palette: Record<string, string>;
};

export const DEFAULT_SLUG = "ieltssmart";

export const BRANDS = {
  ieltssmart: {
    slug: "ieltssmart",
    domains: ["app.ieltssmart.vn", "appdev.ieltssmart.vn", "localhost", "127.0.0.1"],
    name: "IELTS Smart Center",
    title: "Ielts Smart",
    description: "Nền tảng chấm thi IELTS Speaking/Writing cho giáo viên và học viên.",
    loginTagline: "Dành cho giáo viên và học viên Ielts Smart.",
    logo: "/brands/ieltssmart/logo.png",
    icon: "/brands/ieltssmart/icon.png",
    palette: {
      "--brand-50": "#eff4ff",
      "--brand-100": "#dce7ff",
      "--brand-200": "#b2ccff",
      "--brand-300": "#84adff",
      "--brand-400": "#528bff",
      "--brand-500": "#155eef",
      "--brand-600": "#004eeb",
      "--brand-700": "#0040c1",
      "--brand-800": "#00359e",
      "--brand-900": "#002c84",
      // Kept named "blue" across every brand because 29 call sites on the "Bài tập" screen
      // spell the utility `hw-blue`; only the value is brand-dependent.
      "--hw-blue": "#2563eb",
      "--hw-blue-hover": "#1d4ed8",
      "--hw-blue-border": "#bfd3f8",
      "--hw-blue-bg": "#e8f0fe",
      "--hw-blue-sel": "#f0f5ff",
      "--hw-blue-row": "#f8faff",
    },
  },
  classeng: {
    slug: "classeng",
    domains: ["classeng.ieltssmart.vn", "classeng.localhost"],
    name: "CLASSENG",
    title: "CLASSENG",
    description: "Nền tảng luyện thi IELTS cho học viên CLASSENG.",
    loginTagline: "Dành cho giáo viên và học viên CLASSENG.",
    logo: "/brands/classeng/logo.png",
    icon: "/brands/classeng/icon.png",
    // Ramp sampled from the logo file itself (hue 1°). #E71F1C clears WCAG AA against white
    // text at 4.55:1; the brighter reds that look closer to the logo on screen do not.
    palette: {
      "--brand-50": "#fef1f1",
      "--brand-100": "#fde3e3",
      "--brand-200": "#fabebd",
      "--brand-300": "#f38d8c",
      "--brand-400": "#ed5754",
      "--brand-500": "#e71f1c",
      "--brand-600": "#c21714",
      "--brand-700": "#9d1310",
      "--brand-800": "#810f0e",
      "--brand-900": "#6a0d0b",
      "--hw-blue": "#e71f1c",
      "--hw-blue-hover": "#c21714",
      "--hw-blue-border": "#f8c0bf",
      "--hw-blue-bg": "#fee8e8",
      "--hw-blue-sel": "#fff0f0",
      "--hw-blue-row": "#fff8f8",
    },
  },
} satisfies Record<string, Brand>;

export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  const host = raw.split(",")[0].trim().toLowerCase();
  // Cut from the last ":" only if the suffix is all digits, so an IPv6
  // literal like "[::1]" survives while "[::1]:3004" loses its port.
  const lastColon = host.lastIndexOf(":");
  const withoutPort =
    lastColon !== -1 && /^\d+$/.test(host.slice(lastColon + 1))
      ? host.slice(0, lastColon)
      : host;
  return withoutPort.endsWith(".") ? withoutPort.slice(0, -1) : withoutPort;
}

const DOMAIN_TO_BRAND = new Map<string, Brand>();
for (const b of Object.values(BRANDS)) {
  for (const domain of b.domains) {
    DOMAIN_TO_BRAND.set(domain, b);
  }
}

export type DomainOverrides = { map: ReadonlyMap<string, Brand>; invalid: string[] };

// Parses the BRAND_DOMAINS env value ("host=slug,host2=slug2"). A bad entry is collected in
// `invalid` rather than thrown: one mistyped slug must cost one domain, not every tenant.
export function parseDomainOverrides(raw: string | null | undefined): DomainOverrides {
  const map = new Map<string, Brand>();
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const entry = part.trim();
    if (entry === "") continue;
    const sep = entry.indexOf("=");
    const host = sep === -1 ? "" : normalizeHost(entry.slice(0, sep));
    const slug = sep === -1 ? "" : entry.slice(sep + 1).trim();
    const brand = BRANDS[slug as keyof typeof BRANDS];
    if (host === "" || !brand) {
      invalid.push(entry);
      continue;
    }
    map.set(host, brand);
  }
  return { map, invalid };
}

export function resolveBrand(
  host: string | null | undefined,
  overrides?: ReadonlyMap<string, Brand>,
): Brand {
  const h = normalizeHost(host);
  return overrides?.get(h) ?? DOMAIN_TO_BRAND.get(h) ?? BRANDS[DEFAULT_SLUG];
}
