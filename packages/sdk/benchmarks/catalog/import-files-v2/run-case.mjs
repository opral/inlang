import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import inspector from "node:inspector";
const root = process.env.RESULTS;
if (!root || !path.isAbsolute(root))
	throw Error("RESULTS must be an absolute prepared directory");
const plugin = (
	await import(pathToFileURL(path.join(root, "frozen/plugin.mjs")).href)
).default;
const {
	createFreshCatalog,
	createCatalogStream,
	jsonColumn,
	text,
	compareIdentity,
} = await import(pathToFileURL(path.join(root, "frozen/catalogRows.mjs")).href);
const hook = plugin.importFilesV2 ?? plugin.tryImportCatalog;
if (typeof hook !== "function") throw Error("Plugin has no catalog hook");
let session;
const post = (method) =>
	new Promise((resolve, reject) =>
		session.post(method, (error, result) =>
			error ? reject(error) : resolve(result)
		)
	);
const [variant = "v1", sizeText = "6400", roundText = "0"] =
		process.argv.slice(2),
	size = Number(sizeText),
	round = Number(roundText),
	locales = ["en", "de", "fr"];
const settings = { baseLocale: "en", locales, modules: [] };
const files = locales.map((locale) => ({
	locale,
	content: new TextEncoder().encode(
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
	),
}));
if (process.env.PROFILE) {
	session = new inspector.Session();
	session.connect();
	await post("Profiler.enable");
	await post("Profiler.start");
}
const heapBefore = process.memoryUsage().heapUsed,
	start = performance.now();
let bundles, parserMs, normalizationMs;
if (variant === "v1") {
	let t = performance.now();
	const rows = await plugin.importFiles({ files, settings });
	parserMs = performance.now() - t;
	t = performance.now();
	bundles = createFreshCatalog(rows);
	normalizationMs = performance.now() - t;
	assert.ok(bundles);
} else if (variant === "v2") {
	const stream = createCatalogStream();
	assert.equal(await hook({ files, settings, sink: stream.sink }), true);
	bundles = stream.takeBundles();
} else {
	const scalar = variant.includes("scalar"),
		queued = variant.startsWith("queued"),
		owned = variant.includes("owned");
	const stream = scalar ? createCatalogStream() : astSink(!owned);
	if (queued) {
		const queue = [];
		let t = performance.now();
		tokenize(files, (...args) => queue.push(args), scalar);
		parserMs = performance.now() - t;
		t = performance.now();
		for (const args of queue) stream.sink.addMessage(...args);
		bundles = stream.takeBundles();
		normalizationMs = performance.now() - t;
	} else {
		tokenize(files, stream.sink.addMessage, scalar);
		bundles = stream.takeBundles();
	}
}
const totalMs = performance.now() - start,
	heapAfter = process.memoryUsage().heapUsed,
	peakRssKB = process.resourceUsage().maxRSS;
if (session) {
	const { profile } = await post("Profiler.stop");
	session.disconnect();
	fs.writeFileSync(process.env.PROFILE, JSON.stringify(profile));
}
// Verify after timing: exact logical output excluding opaque generated IDs.
const logical = bundles.map((b) => ({
	id: b.id,
	declarations: b.declarations,
	messages: b.messages.map((m) => ({
		locale: m.locale,
		selectors: m.selectors,
		variants: m.variants.map((v) => ({
			matches: v.matches,
			pattern: v.pattern,
		})),
	})),
}));
assert.equal(logical.length, size);
assert.equal(
	logical.reduce((n, b) => n + b.messages.length, 0),
	size * 3
);
for (const b of logical)
	for (const m of b.messages) {
		assert.deepEqual(b.declarations, [
			{ name: "username", type: "input-variable" },
		]);
		const p = m.variants[0].pattern;
		assert.equal(
			p.map((x) => (x.type === "text" ? x.value : "Ada")).join(""),
			`${m.locale} Message ${Number(b.id.slice(8))}: Hello Ada!`
		);
	}
const canonical = (value) =>
	JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort()
						.map((key) => [key, item[key]])
				)
			: item
	);
const logicalHash = createHash("sha256")
	.update(canonical(logical))
	.digest("hex");
const row = {
	variant,
	size,
	round,
	node: process.version,
	diagnosticProfile: Boolean(process.env.PROFILE),
	totalMs,
	parserMs,
	normalizationMs,
	heapDeltaBytes: heapAfter - heapBefore,
	peakRssKB,
	logicalHash,
};
fs.appendFileSync(
	path.join(
		root,
		process.env.PROFILE ? "profile-results.jsonl" : "results.jsonl"
	),
	JSON.stringify(row) + "\n"
);
console.log(JSON.stringify(row));
function tokenize(files, emit, scalar) {
	const parsed = [];
	for (const file of files) {
		const entries = Object.entries(
			JSON.parse(new TextDecoder().decode(file.content))
		);
		for (const [key, value] of entries) {
			assert.equal(typeof value, "string");
			if (key !== "$schema") preflight(value);
		}
		parsed.push({ locale: file.locale, entries });
	}
	for (const { locale, entries } of parsed)
		for (const [key, value] of entries)
			if (key !== "$schema") emit(key, locale, payload(value, scalar));
}
function preflight(value) {
	if (value.includes("\\")) throw Error("Unsupported");
	let c = 0;
	while (c < value.length) {
		const o = value.indexOf("{", c);
		if (o < 0) return;
		const e = value.indexOf("}", o + 1);
		if (e < 0 || value[o + 1] === "#" || value[o + 1] === "/")
			throw Error("Unsupported");
		for (let i = o + 1; i < e; i++)
			if ("{|:".includes(value[i])) throw Error("Unsupported");
		c = e + 1;
	}
}
function payload(value, scalar) {
	const out = [];
	let c = 0;
	while (c < value.length) {
		const o = value.indexOf("{", c);
		if (o < 0) break;
		const e = value.indexOf("}", o + 1),
			literal = value.slice(c, o),
			name = value.slice(o + 1, e);
		if (scalar) out.push(literal, name);
		else {
			if (literal) out.push({ type: "text", value: literal });
			out.push({
				type: "expression",
				arg: { type: "variable-reference", name },
			});
		}
		c = e + 1;
	}
	const tail = value.slice(c);
	if (scalar) out.push(tail);
	else if (tail) out.push({ type: "text", value: tail });
	return out;
}
function astSink(copy) {
	let active = true,
		mi = 0,
		vi = 0;
	const groups = new Map();
	const available = () => {
		if (!active) throw new Error("The catalog sink is closed");
	};
	const sink = Object.freeze({
		addMessage(bundleId, locale, input) {
			available();
			text(bundleId, "bundle.id");
			text(locale, "message.locale");
			if (!Array.isArray(input))
				throw new Error("AST pattern must be an array");
			const pattern = copy ? jsonColumn(input, "variant.pattern") : input;
			if (!copy)
				for (const part of pattern) {
					if (part.type === "expression") text(part.arg.name, "input.name");
					else text(part.value, "pattern.text");
				}
			let group = groups.get(bundleId);
			if (!group) {
				group = {
					bundle: { id: bundleId, declarations: [], messages: [] },
					names: new Set(),
					locales: new Set(),
				};
				groups.set(bundleId, group);
			}
			if (group.locales.has(locale))
				throw new Error("Duplicate catalog message locale");
			group.locales.add(locale);
			for (const part of pattern)
				if (part.type === "expression") {
					const name = part.arg.name;
					if (!group.names.has(name)) {
						group.names.add(name);
						group.bundle.declarations.push({ name, type: "input-variable" });
					}
				}
			const id = `catalog-message-${String(mi++).padStart(12, "0")}`;
			group.bundle.messages.push({
				id,
				bundle_id: bundleId,
				locale,
				selectors: [],
				variants: [
					{
						id: `catalog-variant-${String(vi++).padStart(12, "0")}`,
						message_id: id,
						matches: [],
						pattern,
					},
				],
			});
		},
	});
	return {
		sink,
		takeBundles() {
			available();
			active = false;
			const bundles = [...groups.values()].map((group) => group.bundle);
			groups.clear();
			return bundles.sort((a, b) => compareIdentity(a.id, b.id));
		},
		close() {
			active = false;
			groups.clear();
		},
	};
}
