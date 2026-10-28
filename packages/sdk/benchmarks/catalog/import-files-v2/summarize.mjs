import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.env.RESULTS ?? new URL("./", import.meta.url).pathname;
const matchedPath = path.join(root, "matched-results.jsonl");
const rows = fs
	.readFileSync(path.join(root, "results.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map(JSON.parse);
assert.ok(rows.every((r) => !r.diagnosticProfile));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const cohorts = fs.existsSync(matchedPath)
	? [
			["original-exploratory", rows],
			[
				"matched-safety",
				fs.readFileSync(matchedPath, "utf8").trim().split("\n").map(JSON.parse),
			],
		]
	: [["fresh", rows]];
const groups = [];
for (const [cohort, rows] of cohorts) {
	for (const size of [6400, 13300]) {
		const selected = rows.filter((r) => r.size === size);
		assert.equal(
			new Set(selected.map((r) => r.logicalHash)).size,
			1,
			"Logical AST outputs must agree across all variants"
		);
		for (const variant of [...new Set(selected.map((r) => r.variant))]) {
			const g = selected.filter((r) => r.variant === variant);
			assert.equal(new Set(g.map((r) => r.round)).size, g.length);
			groups.push({
				cohort,
				size,
				variant,
				trials: g.length,
				medianMs: median(g.map((r) => r.totalMs)),
				minMs: Math.min(...g.map((r) => r.totalMs)),
				maxMs: Math.max(...g.map((r) => r.totalMs)),
				parserMs:
					g[0].parserMs === undefined
						? undefined
						: median(g.map((r) => r.parserMs)),
				normalizationMs:
					g[0].normalizationMs === undefined
						? undefined
						: median(g.map((r) => r.normalizationMs)),
				heapDeltaBytes: median(g.map((r) => r.heapDeltaBytes)),
				peakRssKB: median(g.map((r) => r.peakRssKB)),
				logicalHash: g[0].logicalHash,
			});
		}
	}
}
fs.writeFileSync(
	path.join(root, "summary.json"),
	JSON.stringify(groups, null, 2) + "\n"
);
console.log(JSON.stringify(groups, null, 2));
