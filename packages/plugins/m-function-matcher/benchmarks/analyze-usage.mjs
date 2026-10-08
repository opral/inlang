/** ESM/TSX/Svelte source-volume profile, independent of database costs. */
import { performance } from "node:perf_hooks";
import plugin from "../dist/index.js";
const format = process.argv[2] ?? "tsx";
if (!["tsx", "svelte"].includes(format))
	throw new Error("Expected tsx or svelte");
const settings = { baseLocale: "en", locales: ["en"], modules: [] };
for (const size of [100, 1000, 10000]) {
	const files = Array.from({ length: size }, (_, i) => ({
		path: `src/component_${i}.${format}`,
		content:
			format === "svelte"
				? `<script lang="ts">import { m } from '@/generated/paraglide/messages'; let user: string = "";\n${Array.from({ length: 20 }, (_, j) => `const label_${j} = m.key_${i}();`).join("\n")}\n</script><section title={user}>${Array.from({ length: 20 }, () => `{m.key_${i}()}`).join("")}</section>`
				: `import { m } from '@/generated/paraglide/messages';\nexport function Component(props: { user: string }) {\n${Array.from({ length: 40 }, (_, j) => `const label_${j} = m.key_${i}();`).join("\n")}\nreturn <section title={props.user}>{label_0}</section>;\n}`,
	}));
	const durations = [];
	let result;
	for (let i = 0; i < 3; i++) {
		const start = performance.now();
		result = await plugin.analyzeUsage({ files, settings });
		durations.push(performance.now() - start);
	}
	globalThis.gc?.();
	console.log(
		JSON.stringify({
			format,
			files: size,
			sourceMiB: +(
				files.reduce((size, file) => size + file.content.length, 0) /
				1024 ** 2
			).toFixed(2),
			medianMs: +durations.sort((a, b) => a - b)[1].toFixed(2),
			maxMs: +Math.max(...durations).toFixed(2),
			status: result.status,
			usedIds: result.usedBundleIds.length,
			heapMiB: +(process.memoryUsage().heapUsed / 1024 ** 2).toFixed(1),
		})
	);
}
