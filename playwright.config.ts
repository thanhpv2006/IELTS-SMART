import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * E2E config for ielts-smart-web (port 3004).
 *
 * Local run (no CI):
 *   1. ./tests/e2e-up.sh            # backend stack: api:8080, pg:55432, minio:9110, fakes
 *   2. pnpm build                   # once, and after any src change (prod build)
 *   3. pnpm test:e2e                # Playwright auto-starts the web via webServer below
 *   4. ./tests/e2e-down.sh          # teardown when done
 * See tests/README.md.
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Auth states are seeded per-test via loginAs() (see tests/setup/auth.ts);
  // global-setup is kept as a connectivity/login smoke check.
  globalSetup: "./tests/setup/global-setup.ts",

  // Playwright manages the web for us: starts `pnpm start` (prod build) if 3004
  // is free, or reuses an already-running server. This keeps the web alive for
  // the whole run (a bare `pnpm start &` dies with its shell → ECONNREFUSED).
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3004/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      INTERNAL_API_BASE: "http://localhost:8080/api/v1",
      NEXT_PUBLIC_API_BASE: "http://localhost:8080/api/v1",
    },
  },

  // Fail fast in CI; retry locally to handle timing jitter
  retries: 0,

  // Serial: tests share ONE real backend + a single seeded pending assignment.
  // Parallel workers contend for the scoring pipeline and mutate shared state.
  fullyParallel: false,
  workers: 1,

  // Reporter
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3004",

    // Default timeout for individual actions (clicks, fills, etc.)
    actionTimeout: 10_000,

    navigationTimeout: 30_000,

    // Capture trace on first retry (useful once retries > 0 in CI)
    trace: "retain-on-failure",

    screenshot: "only-on-failure",
  },

  // Speaking flow involves async scoring queue: fake-ssproxy 200ms + fake-openai
  // stream + River worker tick → allow poll up to 60s.
  // Individual test timeout set per-spec via test.setTimeout().
  timeout: 90_000,

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Fake microphone: getUserMedia returns a silent (but valid) audio track.
        // MediaRecorder will produce a valid webm blob from it.
        // NOTE TK-11: startRecording() in take/[id]/page.tsx lacks try/catch
        // around getUserMedia — fake device makes it succeed so spike is unblocked.
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            // Allow self-signed certs on localhost (MinIO presign)
            "--ignore-certificate-errors",
          ],
        },

        // Per-role storage states (written by global-setup)
        // Spec files override this via test.use({ storageState: ... })
      },
    },
  ],
});

// Convenience re-export of storage state paths so specs can import them
export const AUTH_STATE = {
  student: path.join(__dirname, "tests/setup/.auth/student.json"),
  owner: path.join(__dirname, "tests/setup/.auth/owner.json"),
  teacher: path.join(__dirname, "tests/setup/.auth/teacher.json"),
};
