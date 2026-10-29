import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const script = fileURLToPath(import.meta.url),
	root = path.dirname(script);
const baselinePath =
		process.env.CATALOG_BENCH_BASELINE ??
		fileURLToPath(new URL("./baseline-loader.mjs", import.meta.url)),
	pluginPath = process.env.CATALOG_BENCH_PLUGIN;
if (!pluginPath)
	throw Error(
		"Set CATALOG_BENCH_PLUGIN to the built message-format plugin. CATALOG_BENCH_BASELINE optionally overrides the frozen pre-refactor loader."
	);
const logical = (bundles) =>
	bundles
		.map((b) => [
			b.id,
			b.declarations,
			b.messages.map((m) => [
				m.locale,
				m.selectors,
				m.variants.map((v) => [v.matches, v.pattern]),
			]),
		])
		.sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
if (process.argv[2] === "--worker") {
	const [backend, sizeText, mode] = process.argv.slice(3),
		size = Number(sizeText),
		locales = ["en", "de", "fr"];
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-loader-api-")),
		project = path.join(dir, "project.inlang");
	try {
		fs.mkdirSync(project);
		fs.mkdirSync(path.join(dir, "messages"));
		fs.copyFileSync(pluginPath, path.join(dir, "plugin.mjs"));
		fs.writeFileSync(
			path.join(project, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales,
				modules: ["./plugin.mjs"],
				"plugin.inlang.messageFormat": {
					pathPattern: "./messages/{locale}.json",
				},
			})
		);
		const messages = Object.fromEntries(
			locales.map((locale) => [
				locale,
				Object.fromEntries(
					Array.from({ length: size }, (_, i) => [
						"message_" + i,
						`${locale} Message ${i}: Hello {username}!`,
					])
				),
			])
		);
		const save = (locale, pretty = false) =>
			fs.writeFileSync(
				path.join(dir, "messages", locale + ".json"),
				JSON.stringify(messages[locale], null, pretty ? 2 : undefined)
			);
		locales.forEach((locale) => save(locale));
		const { loadProjectCatalog: baseline } = await import(
			pathToFileURL(baselinePath).href
		);
		const { createCatalogLoader } = await import(
			new URL("../../../dist/project/createCatalogLoader.js", import.meta.url)
				.href
		);
		const loader = createCatalogLoader({ path: project, fs });
		let snapshot = new Map();
		const rows = [];
		async function run(scenario) {
			const start = performance.now();
			const result =
				backend === "baseline"
					? await baseline({ path: project, fs })
					: await loader.load();
			const ms = performance.now() - start;
			if (backend === "baseline" || result.type === "reset")
				snapshot = new Map(result.bundles.map((b) => [b.id, b]));
			else {
				for (const id of result.removedBundleIds) snapshot.delete(id);
				for (const b of result.bundles) snapshot.set(b.id, b);
			}
			rows.push({
				scenario,
				ms,
				type: result.type ?? "snapshot",
				bundles: result.bundles.length,
				removed: result.removedBundleIds?.length ?? 0,
			});
			if (mode === "validate")
				assert.deepEqual(
					logical([...snapshot.values()]),
					logical((await baseline({ path: project, fs })).bundles),
					scenario
				);
		}
		await run("first-load");
		await run("noop");
		messages.de.message_0 = "Edited {username}!";
		save("de");
		await run("translation");
		messages.de.message_1 = "Edited {username} {extra}!";
		save("de");
		await run("input");
		for (const locale of locales) {
			messages[locale].added = `${locale} Added {username}!`;
			save(locale);
		}
		await run("add");
		for (const locale of locales) {
			delete messages[locale].added;
			save(locale);
		}
		await run("delete");
		save("de", true);
		await run("format-only");
		// Full AST, nested keys, and deletions of namespaces use the ordinary importer.
		if (mode === "validate") {
			const plural = {
				declarations: ["input count", "local plural=count: plural"],
				selectors: ["plural"],
				match: { "plural=one": "One item", "plural=*": "{count} items" },
			};
			for (const locale of locales) {
				messages[locale].message_2 = [plural];
				messages[locale].nested = { child: "Nested {username}!" };
				save(locale);
			}
			await run("complex-and-nested");
			for (const locale of locales) {
				delete messages[locale].nested;
				save(locale);
			}
			await run("remove-namespace");
		}
		assert.deepEqual(
			logical([...snapshot.values()]),
			logical((await baseline({ path: project, fs })).bundles)
		);
		console.log(
			JSON.stringify({
				backend,
				size,
				node: process.version,
				verified: true,
				rows,
			})
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	process.exit(0);
}
const output = process.env.CATALOG_BENCH_OUTPUT ?? root;
fs.mkdirSync(output, { recursive: true });
const results = [];
for (let round = 0; round < 5; round++)
	for (const size of [6400, 13300])
		for (const backend of round % 2
			? ["stateful", "baseline"]
			: ["baseline", "stateful"]) {
			const child = spawnSync(
				process.execPath,
				[script, "--worker", backend, String(size), "measure"],
				{ encoding: "utf8", maxBuffer: 1024 * 1024 }
			);
			if (child.status !== 0) throw Error(child.stderr || child.stdout);
			const result = JSON.parse(child.stdout.trim());
			results.push({ ...result, round });
			console.log(
				`${round + 1} ${size} ${backend}: ${result.rows.find((r) => r.scenario === "noop").ms.toFixed(2)} ms noop`
			);
		}
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)],
	summary = [];
for (const size of [6400, 13300])
	for (const backend of ["baseline", "stateful"])
		for (const scenario of results[0].rows.map((r) => r.scenario)) {
			const rows = results
				.filter((r) => r.size === size && r.backend === backend)
				.flatMap((r) => r.rows.filter((r) => r.scenario === scenario));
			summary.push({
				size,
				backend,
				scenario,
				medianMs: median(rows.map((r) => r.ms)),
				minMs: Math.min(...rows.map((r) => r.ms)),
				maxMs: Math.max(...rows.map((r) => r.ms)),
				returnedBundles: rows.map((r) => r.bundles),
				removed: rows.map((r) => r.removed),
			});
		}
fs.writeFileSync(
	path.join(output, "results.json"),
	JSON.stringify(results, null, 2)
);
fs.writeFileSync(
	path.join(output, "summary.json"),
	JSON.stringify(summary, null, 2)
);
fs.writeFileSync(
	path.join(output, "metadata.json"),
	JSON.stringify(
		{
			node: process.version,
			locales: ["en", "de", "fr"],
			rounds: 5,
			baselineSourceSha256: createHash("sha256")
				.update(fs.readFileSync(baselinePath))
				.digest("hex"),
			pluginSha256: createHash("sha256")
				.update(fs.readFileSync(pluginPath))
				.digest("hex"),
			scope:
				"SDK loader wall time only, imports/setup excluded; serial rotated fresh processes; final full AST equality verified; existing full importFiles on changed sources; not an incremental compiler or Grai comparison",
		},
		null,
		2
	)
);
