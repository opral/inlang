import { context } from "esbuild";
import { buildOptions } from "./buildOptions.js";

// eslint-disable-next-line no-undef
const isProduction = process.env.NODE_ENV === "production";

const ctx = await context(
  buildOptions({
    isProduction,
    // eslint-disable-next-line no-undef
    publicPosthogToken: process.env.PUBLIC_POSTHOG_TOKEN,
  }),
);

if (isProduction === false) {
  await ctx.watch();
  // eslint-disable-next-line no-undef
  console.info("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
