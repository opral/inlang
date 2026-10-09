import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // set by build.js; without a PostHog token, telemetry is off in tests
    ENV_DEFINED_IN_BUILD_STEP: JSON.stringify({ IS_PRODUCTION: false }),
  },
  test: {
    exclude: [...configDefaults.exclude, "**/old-unused/**"],
  },
});
