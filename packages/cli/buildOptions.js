/**
 * esbuild options of the CLI bundle, shared by `build.js` and the end-to-end
 * tests, which build into their own directory.
 *
 * @param {{ outdir?: string }} [args]
 * @returns {import("esbuild").BuildOptions}
 */
export function buildOptions(args) {
  return {
    entryPoints: ["./src/main.ts"],
    bundle: true,
    outdir: args?.outdir ?? "./dist",
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
    // @inlang/sdk owns Lix's native and WASM assets. Keep its module URLs
    // relative to the installed SDK instead of rebasing them into dist/main.js.
    external: ["esbuild-wasm", "@inlang/sdk"],
  };
}
