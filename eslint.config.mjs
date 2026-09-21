import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", ".vinext/**", ".wrangler/**", "coverage/**", "test-results/**", "supabase/.temp/**", "worker-configuration.d.ts", "next-env.d.ts"]),
]);
