import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(new URL("../run.mjs", import.meta.url));
const frozen = process.env.CATALOG_BENCH_PLUGIN;
const optimized = process.env.CATALOG_BENCH_OPTIMIZED_PLUGIN;
if (!frozen) throw Error("Set CATALOG_BENCH_PLUGIN to the frozen plugin");
const variants = [
	["project", frozen, "project"],
	["catalog", frozen, "catalog"],
	...(optimized ? [["catalog", optimized, "catalog-optimized"]] : []),
];
for (const size of [6400, 13300])
	for (let round = 0; round < 3; round++)
		for (let i = 0; i < variants.length; i++) {
			const [backend, plugin, tag] = variants[(i + round) % variants.length];
			const child = spawnSync(
				process.execPath,
				[runner, "--worker", backend, String(size), String(round)],
				{
					encoding: "utf8",
					env: { ...process.env, CATALOG_BENCH_PLUGIN: plugin },
					maxBuffer: 1024 * 1024,
				}
			);
			if (child.status) {
				process.stderr.write(child.stderr);
				process.stderr.write(child.stdout);
				process.exit(child.status ?? 1);
			}
			const row = JSON.parse(child.stdout.trim());
			row.backend = tag;
			process.stdout.write(JSON.stringify(row) + "\n");
		}
