/** Reproducible real-Lix profile. Build SDK + matcher, then run node --expose-gc benchmarks/project-checks.mjs. */
import { performance } from "node:perf_hooks";
import { openLix } from "@lix-js/sdk";
import { openProject, checkProject, applyFix } from "../dist/index.js";
import matcher from "../../plugins/m-function-matcher/dist/index.js";

const sizes = process.argv.slice(2).map(Number);
const usedRatio = Number(process.env.CHECKS_USED_RATIO ?? "0.9");
const median = (values) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const chunk = (items, size = 500) =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size)
	);
async function measure(run, repetitions = 5) {
	const durations = [];
	for (let i = 0; i < repetitions; i++) {
		const start = performance.now();
		await run();
		durations.push(performance.now() - start);
	}
	return {
		medianMs: +median(durations).toFixed(2),
		maxMs: +Math.max(...durations).toFixed(2),
	};
}
for (const size of sizes.length ? sizes : [1000, 10000, 25000]) {
	const lix = await openLix();
	let parses = 0;
	const project = await openProject({
		lix,
		settings: { baseLocale: "en", locales: ["en", "de", "fr"], modules: [] },
		providePlugins: [
			{
				...matcher,
				analyzeUsage: async (args) => {
					parses++;
					return matcher.analyzeUsage(args);
				},
			},
		],
	});
	try {
		const fixtureStart = performance.now();
		await project.db.transaction().execute(async (tx) => {
			const bundles = Array.from({ length: size }, (_, i) => ({
				id: `key_${i}`,
			}));
			for (const rows of chunk(bundles))
				await tx.insertInto("inlang_bundle").values(rows).execute();
			const messages = bundles.flatMap((bundle) =>
				["en", "de"].map((locale) => ({
					id: `${bundle.id}_${locale}`,
					bundle_id: bundle.id,
					locale,
				}))
			);
			for (const rows of chunk(messages))
				await tx.insertInto("inlang_message").values(rows).execute();
			for (const rows of chunk(
				messages.map((message) => ({
					id: `${message.id}_v`,
					message_id: message.id,
					pattern: [{ type: "text", value: "A translation ".repeat(10) }],
				}))
			))
				await tx.insertInto("inlang_variant").values(rows).execute();
		});
		const files = chunk(
			Array.from(
				{ length: Math.floor(size * usedRatio) },
				(_, i) => `m.key_${i}();`
			),
			100
		).map((calls, i) => ({
			path: `src/file_${i}.ts`,
			content: `import { m } from './paraglide/messages';\n${calls.join("\n")}`,
		}));
		if (!files.length)
			files.push({ path: "src/app.ts", content: "export const app = 1;" });
		const fixtureMs = performance.now() - fixtureStart;
		globalThis.gc?.();
		const baselineMemory = process.memoryUsage();
		// No source snapshot: missing translations and the translation checks (patterns), as by default.
		const catalog = await measure(() => checkProject({ project }));
		// IDs and locales only.
		const idsOnly = await measure(() =>
			checkProject({ project, checks: ["missing-translation"] })
		);
		const coldStart = performance.now();
		const first = await checkProject({ project, files });
		const coldMs = performance.now() - coldStart;
		const warm = await measure(() => checkProject({ project, files }));
		const scoped = await measure(() =>
			checkProject({ project, files, bundleIds: ["key_0"] })
		);
		const parseCallsBeforeFix = parses;
		const diagnostic = first.diagnostics.find(
			(d) => d.checkId === "unused-message"
		);
		const fix = await measure(async () => {
			if (diagnostic)
				await applyFix({
					project,
					files,
					diagnostic,
					fixId: "delete-unused-message",
				});
		}, 1);
		globalThis.gc?.();
		console.log(
			JSON.stringify({
				bundles: size,
				messages: size * 2,
				variants: size * 2,
				files: files.length,
				fixtureMs: Math.round(fixtureMs),
				usedRatio,
				catalog,
				idsOnly,
				coldMs: +coldMs.toFixed(2),
				warm,
				scoped,
				fix,
				parseCallsBeforeFix,
				diagnostics: first.diagnostics.length,
				baselineHeapMiB: +(baselineMemory.heapUsed / 1024 ** 2).toFixed(1),
				baselineRssMiB: +(baselineMemory.rss / 1024 ** 2).toFixed(1),
				heapMiB: +(process.memoryUsage().heapUsed / 1024 ** 2).toFixed(1),
				rssMiB: +(process.memoryUsage().rss / 1024 ** 2).toFixed(1),
				// peak resident set size of the whole process so far
				maxRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
			})
		);
	} finally {
		await project.close();
		await lix.close();
	}
}
