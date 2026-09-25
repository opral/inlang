import { context } from "esbuild";

// eslint-disable-next-line no-undef
const isProduction = process.env.NODE_ENV === "production";

const ctx = await context({
  entryPoints: ["./src/main.ts"],
  bundle: true,
  outdir: "./dist",
  platform: "node",
  format: "esm",
  target: "node16",
  // for easier debugging production issues, don't minify. KB size is not a concern for a node CLI
  minify: false,
  // https://github.com/evanw/esbuild/issues/1921#issuecomment-1403107887
  banner: {
    js: `
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);

// ----- polyfilling for module build command -----

import pathPolyfill123 from "node:path"
import { fileURLToPath as fileURLToPathPolyfill123 } from "node:url"
const __filename = fileURLToPathPolyfill123(import.meta.url)
const __dirname = pathPolyfill123.dirname(__filename)

// -------------------------------------------------
`,
  },
  define: {
    // eslint-disable-next-line no-undef
    ENV_DEFINED_IN_BUILD_STEP: JSON.stringify({
      IS_PRODUCTION: isProduction,
      // eslint-disable-next-line no-undef
      PUBLIC_POSTHOG_TOKEN: process.env.PUBLIC_POSTHOG_TOKEN,
    }),
  },
  // @inlang/sdk owns Lix's native and WASM assets. Keep its module URLs
  // relative to the installed SDK instead of rebasing them into dist/main.js.
  external: ["esbuild-wasm", "@inlang/sdk"],
});

if (isProduction === false) {
  await ctx.watch();
  // eslint-disable-next-line no-undef
  console.info("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
