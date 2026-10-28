import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const required = (name) => {
	const value = process.env[name];
	if (!value || !path.isAbsolute(value) || !fs.existsSync(value))
		throw Error(`${name} must name an existing absolute path`);
	return value;
};
const sdk = required("SDK_ROOT"),
	plugin = required("PLUGIN"),
	results = process.env.RESULTS;
if (!results || !path.isAbsolute(results))
	throw Error("RESULTS must be a new absolute output directory");
if (process.env.PROFILE)
	throw Error("Use run-case.mjs for separate diagnostic profiles");
if (fs.existsSync(results) && fs.readdirSync(results).length)
	throw Error("RESULTS must be new or empty");
fs.mkdirSync(path.join(results, "frozen"), { recursive: true });
const source = fs.readFileSync(
	path.join(sdk, "dist/import-export/catalogRows.js"),
	"utf8"
);
for (const signature of [
	"function jsonColumn(",
	"function text(",
	"function compareIdentity(",
])
	if (!source.includes(signature))
		throw Error(`SDK private benchmark boundary changed: ${signature}`);
fs.writeFileSync(
	path.join(results, "frozen/catalogRows.mjs"),
	source.replaceAll("./variantSemantics.js", "./variantSemantics.mjs") +
		"\nexport {jsonColumn,text,compareIdentity};\n"
);
fs.copyFileSync(
	path.join(sdk, "dist/import-export/variantSemantics.js"),
	path.join(results, "frozen/variantSemantics.mjs")
);
fs.copyFileSync(plugin, path.join(results, "frozen/plugin.mjs"));
const sha = (p) =>
	createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const variants = process.argv[2]
	? process.argv[2].split(",")
	: [
			"v1",
			"v2",
			"shared-scalar",
			"shared-ast-copy",
			"shared-ast-owned",
			"queued-scalar",
			"queued-ast-copy",
		];
const rounds = Number(process.env.ROUNDS ?? 5);
if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds % 2 !== 1)
	throw Error("ROUNDS must be a positive odd integer");
fs.writeFileSync(
	path.join(results, "metadata.json"),
	JSON.stringify(
		{
			node: process.version,
			execPath: process.execPath,
			sdk,
			plugin,
			rounds,
			variants,
			catalogRowsSha256: sha(
				path.join(sdk, "dist/import-export/catalogRows.js")
			),
			variantSemanticsSha256: sha(
				path.join(sdk, "dist/import-export/variantSemantics.js")
			),
			pluginSha256: sha(plugin),
		},
		null,
		2
	) + "\n"
);
for (const size of [6400, 13300])
	for (let round = 0; round < rounds; round++)
		for (let i = 0; i < variants.length; i++) {
			const variant = variants[(i + round) % variants.length];
			const child = spawnSync(
				process.execPath,
				[
					fileURLToPath(new URL("./run-case.mjs", import.meta.url)),
					variant,
					String(size),
					String(round),
				],
				{ env: process.env, encoding: "utf8", maxBuffer: 1024 * 1024 }
			);
			process.stdout.write(child.stdout ?? "");
			process.stderr.write(child.stderr ?? "");
			if (child.error || child.status)
				throw child.error ?? Error(`Case failed: ${variant}/${size}/${round}`);
		}
