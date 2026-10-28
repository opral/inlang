import { expect, test, vi } from "vitest";
import type {
	InlangPlugin,
	Bundle,
	MessageImport,
	VariantImport,
} from "@inlang/sdk";
import { tryImportCatalog } from "./tryImportCatalog.js";
import { importFiles } from "./importFiles.js";

type Args = Parameters<NonNullable<InlangPlugin["tryImportCatalog"]>>[0];
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [] };
const file = (locale: string, value: unknown) => ({
	locale,
	content: new TextEncoder().encode(JSON.stringify(value)),
});
function collector() {
	const bundles: Bundle[] = [],
		messages: MessageImport[] = [],
		variants: VariantImport[] = [];
	const byId = new Map<string, Bundle>();
	const addMessage = vi.fn(
		(id: string, locale: string, parts: readonly string[]) => {
			let bundle = byId.get(id);
			if (!bundle) {
				bundle = { id, declarations: [] };
				byId.set(id, bundle);
				bundles.push(bundle);
			}
			const names = new Set(
				bundle.declarations.map((declaration) => declaration.name)
			);
			const pattern: NonNullable<VariantImport["pattern"]> = [];
			for (let index = 0; index < parts.length; index++) {
				const value = parts[index]!;
				if (index % 2) {
					if (!names.has(value)) {
						bundle.declarations.push({ type: "input-variable", name: value });
						names.add(value);
					}
					pattern.push({
						type: "expression",
						arg: { type: "variable-reference", name: value },
					});
				} else if (value !== "") pattern.push({ type: "text", value });
			}
			messages.push({ bundleId: id, selectors: [], locale });
			variants.push({
				messageBundleId: id,
				messageLocale: locale,
				matches: [],
				pattern,
			});
		}
	);
	return { sink: { addMessage }, rows: { bundles, messages, variants } };
}

test("scalar imports preserve ordinary parser rows, input order and text boundaries", async () => {
	const values = Object.fromEntries([
		["$schema", "https://example.test/{schema}"],
		["plain", "hello"],
		["empty", ""],
		["repeated", "{b}{a}{b}"],
		["odd", "{} {user name} {__proto__}"],
		["astral", "😀 {名字}\r\n"],
		["closing", "} before {a} after"],
		["a", "parent"],
		["a.b", "child"],
		["__proto__", "prototype"],
		["2", "numeric"],
	]);
	const files = [
		file("en", values),
		file("de", { repeated: "{c}{a}", plain: "Hallo" }),
	];
	const { sink, rows } = collector();
	expect(await tryImportCatalog({ files, settings, sink })).toBe(true);
	expect(rows).toEqual(await importFiles({ files, settings }));
	expect(sink.addMessage).toHaveBeenCalledWith("empty", "en", [""]);
	expect(sink.addMessage).toHaveBeenCalledWith("repeated", "en", [
		"",
		"b",
		"",
		"a",
		"",
		"b",
		"",
	]);
	expect(
		rows.bundles
			.find((bundle) => bundle.id === "repeated")
			?.declarations.map((value) => value.name)
	).toEqual(["b", "a", "c"]);
});

test.each([
	{ nested: { hello: "world" } },
	{ complex: [{ match: { "*": "x" } }] },
	{ escaped: String.raw`hi \{name\}` },
	{ markup: "{#link}x{/link}" },
	{ annotation: "{n: number}" },
	{ colon: "{user:name}" },
	{ quoted: "{a|b}" },
	{ nested: "{a{b}" },
	{ unclosed: "{name" },
	{ $schema: { nested: "value" } },
	["array"],
	null,
	{ nonstring: 42 },
])(
	"unsupported catalog %j falls back before any message is emitted",
	async (value) => {
		const { sink } = collector();
		expect(
			await tryImportCatalog({
				files: [file("en", { first: "Hi {name}" }), file("de", value)],
				settings,
				sink,
			})
		).toBeUndefined();
		expect(sink.addMessage).not.toHaveBeenCalled();
	}
);

test("mixed entries and repeated locale resources fall back atomically", async () => {
	for (const files of [
		[file("en", { first: "simple", later: [{ match: { "*": "complex" } }] })],
		[file("en", { same: "first" }), file("en", { same: "last" })],
		[file("en", { first: "first" }), file("en", { different: "second" })],
	]) {
		const { sink } = collector();
		expect(await tryImportCatalog({ files, settings, sink })).toBeUndefined();
		expect(sink.addMessage).not.toHaveBeenCalled();
	}
});

test("malformed JSON still rejects without prior sink emissions", async () => {
	const { sink } = collector();
	const args: Args = {
		files: [
			file("en", { first: "hello" }),
			{ locale: "de", content: new TextEncoder().encode("{broken") },
		],
		settings,
		sink,
	};
	await expect(async () => tryImportCatalog(args)).rejects.toThrow(SyntaxError);
	expect(sink.addMessage).not.toHaveBeenCalled();
});

test("empty and schema-only catalogs are handled without creating messages", async () => {
	for (const files of [
		[],
		[file("en", {})],
		[file("en", { $schema: "https://example.test/schema" })],
	]) {
		const { sink, rows } = collector();
		expect(await tryImportCatalog({ files, settings, sink })).toBe(true);
		expect(rows).toEqual(await importFiles({ files, settings }));
		expect(sink.addMessage).not.toHaveBeenCalled();
	}
});

test("sink validation failures propagate instead of invoking the fallback importer", async () => {
	const error = new Error("invalid scalar input");
	const sink = {
		addMessage: vi.fn(() => {
			throw error;
		}),
	};
	await expect(async () =>
		tryImportCatalog({
			files: [file("en", { simple: "Hello" })],
			settings,
			sink,
		})
	).rejects.toBe(error);
	expect(sink.addMessage).toHaveBeenCalledTimes(1);
});
