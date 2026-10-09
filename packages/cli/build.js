import { context } from "esbuild";
import { buildOptions } from "./buildOptions.js";

// eslint-disable-next-line no-undef
const isProduction = process.env.NODE_ENV === "production";

const ctx = await context(buildOptions());

if (isProduction === false) {
  await ctx.watch();
  // eslint-disable-next-line no-undef
  console.info("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
