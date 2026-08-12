import { context } from "esbuild";
import { execFileSync } from "node:child_process";

// eslint-disable-next-line no-undef
const isProduction = process.env.NODE_ENV === "production";

const ctx = await context({
	entryPoints: ["./src/index.ts"],
	outdir: "./dist",
	minify: isProduction,
	// ----------------------------------
	// allow top level await
	// https://caniuse.com/mdn-javascript_operators_await_top_level
	target: "es2022",
	// inlang does not support import maps
	bundle: true,
	// esm to work in the browser
	format: "esm",
	platform: "browser",
	// sourcemaps are unused at the moment
	sourcemap: false,
});

if (isProduction === false) {
	await ctx.watch();
	// eslint-disable-next-line no-undef
	console.info("Watching for changes...");
} else {
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
		{ stdio: "inherit" }
	);
}
