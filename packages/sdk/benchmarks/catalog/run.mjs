import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const plugin = process.env.CATALOG_BENCH_PLUGIN;
if (!plugin)
	throw Error(
		"Set CATALOG_BENCH_PLUGIN to the built message-format plugin entry point"
	);
if (process.argv[2] === "--worker") {
	const [backend, sizeText, roundText] = process.argv.slice(3),
		size = Number(sizeText),
		round = Number(roundText),
		locales = ["en", "de", "fr"];
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-catalog-bench-")),
		projectPath = path.join(dir, "project.inlang");
	try {
		fs.mkdirSync(projectPath);
		fs.mkdirSync(path.join(dir, "messages"));
		fs.copyFileSync(plugin, path.join(dir, "plugin.js"));
		for (const locale of locales)
			fs.writeFileSync(
				path.join(dir, "messages", `${locale}.json`),
				JSON.stringify(
					Object.fromEntries(
						Array.from({ length: size }, (_, i) => [
							`message_${i}`,
							`${locale} Message ${i}: Hello {username}!`,
						])
					),
					null,
					"\t"
				) + "\n"
			);
		fs.writeFileSync(
			path.join(projectPath, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales,
				modules: ["./plugin.js"],
				"plugin.inlang.messageFormat": {
					pathPattern: "./messages/{locale}.json",
				},
			})
		);
		const sdkVersion = JSON.parse(
			fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")
		).version;
		for (const [name, value] of Object.entries({
			".meta.json": JSON.stringify({ highestSdkVersion: sdkVersion }),
			"README.md": "readme",
			".gitignore": "ignore",
		}))
			fs.writeFileSync(path.join(projectPath, name), value);
		const importStart = performance.now(),
			sdk = await import(new URL("../../dist/index.js", import.meta.url)),
			importMs = performance.now() - importStart;
		const start = performance.now();
		let project, catalog;
		if (backend === "catalog")
			catalog = await sdk.createCatalogLoader({ path: projectPath, fs }).load();
		else {
			project = await sdk.loadProjectFromDirectory({ path: projectPath, fs });
			catalog = {
				settings: await project.settings.get(),
				bundles: await sdk.selectBundleNested(project.db).execute(),
			};
		}
		const catalogReadyMs = performance.now() - start,
			closeStart = performance.now();
		await project?.close();
		const closeMs = performance.now() - closeStart;
		const canonical = (value) =>
			Array.isArray(value)
				? value.map(canonical)
				: value && typeof value === "object"
					? Object.fromEntries(
							Object.keys(value)
								.sort()
								.map((k) => [k, canonical(value[k])])
						)
					: value;
		const logical = catalog.bundles.map((b) => ({
			id: b.id,
			declarations: b.declarations,
			messages: b.messages
				.map((m) => ({
					locale: m.locale,
					selectors: m.selectors,
					variants: m.variants.map((v) => ({
						matches: v.matches,
						pattern: v.pattern,
					})),
				}))
				.sort((a, b) =>
					a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0
				),
		}));
		if (
			catalog.bundles.length !== size ||
			catalog.bundles.some((b) => b.messages.length !== 3)
		)
			throw Error("Incomplete catalog");
		const hash = createHash("sha256")
			.update(JSON.stringify(canonical(logical)))
			.digest("hex");
		console.log(
			JSON.stringify({
				backend,
				size,
				round,
				node: process.version,
				sdkVersion,
				importMs,
				catalogReadyMs,
				closeMs,
				hash,
				bundles: catalog.bundles.length,
				messages: catalog.bundles.reduce((n, b) => n + b.messages.length, 0),
			})
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
} else {
	for (const size of [6400, 13300])
		for (let round = 0; round < 3; round++)
			for (const backend of round % 2
				? ["catalog", "project"]
				: ["project", "catalog"]) {
				const child = spawnSync(
					process.execPath,
					[script, "--worker", backend, String(size), String(round)],
					{ encoding: "utf8", maxBuffer: 1024 * 1024 }
				);
				process.stdout.write(child.stdout);
				process.stderr.write(child.stderr);
				if (child.status) process.exit(child.status);
			}
}
