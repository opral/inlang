import { context } from "esbuild";
import { execFileSync } from "node:child_process";
const isProduction = process.env.NODE_ENV === "production";
const ctx = await context({
  entryPoints: ["./src/index.ts"],
  outdir: "./dist",
  minify: isProduction,
  target: "es2022",
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: false,
});
if (isProduction) {
  await ctx.rebuild();
  await ctx.dispose();
  execFileSync(
    "tsc",
    [
      "--emitDeclarationOnly",
      "--declaration",
      "--declarationMap",
      "false",
      "--outDir",
      "dist",
      "--noEmit",
      "false",
    ],
    { stdio: "inherit" },
  );
} else {
  await ctx.watch();
  console.info("Watching for changes...");
}
