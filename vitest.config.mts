import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    resolve: {
      alias: {
        "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
      },
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov"],
        include: ["lib/recipe-image.ts", "lib/maintenance.ts", "lib/my-recipes.ts", "lib/recipe-editor.ts"],
        reportsDirectory: "coverage",
        thresholds: {
          statements: 75,
          branches: 60,
          functions: 90,
          lines: 90,
        },
      },
    },
  };
});
