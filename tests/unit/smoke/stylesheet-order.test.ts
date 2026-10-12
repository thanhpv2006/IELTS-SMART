/**
 * The exam engine ships its own full Tailwind build, so its unprefixed `.flex` / `.hidden` /
 * `.block` land in the same `@layer utilities` at the same 0,1,0 specificity as this app's — and a
 * media query adds none. Whichever sheet loads last therefore wins BOTH ways: engine-last froze
 * `hidden sm:block` / `flex lg:hidden` here (the desktop hamburger, the missing breadcrumb icon),
 * app-last froze the engine's own `lg:` split-pane layout into the stacked mobile one.
 *
 * Engine >= 2.17.0 scopes its utilities to `.ee-scope`, which settles it for good and makes the
 * order below moot; the assertion stays as a cheap pin. The single-importer rule still matters —
 * a second import re-injects the engine chunk after the app chunk.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ENGINE_CSS = '@novaforge-team/ielts-exam-engine/styles.css';
const layout = readFileSync("src/app/layout.tsx", "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("stylesheet order — the engine sheet must not override app utilities", () => {
  it("imports the engine stylesheet before globals.css in the root layout", () => {
    const engineAt = layout.indexOf(ENGINE_CSS);
    const globalsAt = layout.indexOf('"./globals.css"');
    expect(engineAt).toBeGreaterThan(-1);
    expect(globalsAt).toBeGreaterThan(-1);
    expect(engineAt).toBeLessThan(globalsAt);
  });

  it("imports the engine stylesheet from exactly one module", () => {
    const importers = sourceFiles("src").filter((f) => readFileSync(f, "utf8").includes(ENGINE_CSS));
    expect(importers).toEqual(["src/app/layout.tsx"]);
  });
});
