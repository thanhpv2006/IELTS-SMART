import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // Give jsdom a base URL so that relative fetch("/api/...") calls
        // resolve to http://localhost/api/... and MSW can intercept them.
        url: "http://localhost",
      },
    },
    globals: true,
    setupFiles: ["tests/unit/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    exclude: ["tests/e2e/**", "tests/fakes/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
