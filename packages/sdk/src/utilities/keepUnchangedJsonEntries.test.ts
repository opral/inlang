import { describe, expect, test } from "vitest";
import {
	jsonEquals,
	keepUnchangedJsonEntries,
	rowsFromImport,
	stringifyJsonKeepingEntries,
} from "./keepUnchangedJsonEntries.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ExportFile } from "../project/api.js";

const keep = (previous: string, next: unknown, previousCanonical?: unknown) =>
	stringifyJsonKeepingEntries({ previous, next, previousCanonical });

describe("stringifyJsonKeepingEntries", () => {
	test("returns the previous text byte for byte if nothing changed", () => {
		const previous =
			'{\n  "b":   "B",\n\t"a" : "caf\\u00e9 \\/ \\"x\\"",\n  "c": ["x",  "y"],  "n": 1.0\n}\n';
		expect(keep(previous, JSON.parse(previous))).toBe(previous);
		// key order of `next` doesn't matter for existing keys
		expect(
			keep(previous, { n: 1, c: ["x", "y"], a: 'café / "x"', b: "B" })
		).toBe(previous);
	});

	test("only the changed entry is written", () => {
		const previous =
			'{\n  "a": "caf\\u00e9",\n  "b": "B",\n  "c": "\\ud83d\\ude00"\n}';
		expect(keep(previous, { a: "café", b: "changed 😀", c: "😀" })).toBe(
			'{\n  "a": "caf\\u00e9",\n  "b": "changed 😀",\n  "c": "\\ud83d\\ude00"\n}'
		);
	});

	test("escapes changed and new entries like JSON.stringify", () => {
		const previous = '{\n\t"a": "A"\n}\n';
		expect(
			keep(previous, {
				a: 'quote " backslash \\ newline \n tab \t',
				'new "key"': "\u2028 ü \u0001",
			})
		).toBe(
			'{\n\t"a": "quote \\" backslash \\\\ newline \\n tab \\t",\n\t"new \\"key\\"": "\u2028 ü \\u0001"\n}\n'
		);
	});

	test("keeps the order of existing keys and inserts new keys after the key that precedes them in next", () => {
		const previous = '{\n  "c": "C",\n  "a": "A"\n}\n';
		expect(keep(previous, { a: "A", b: "B", c: "C", d: "D" })).toBe(
			'{\n  "c": "C",\n  "d": "D",\n  "a": "A",\n  "b": "B"\n}\n'
		);
		// a key that comes first in next is inserted first
		expect(keep(previous, { $schema: "x", c: "C", a: "A" })).toBe(
			'{\n  "$schema": "x",\n  "c": "C",\n  "a": "A"\n}\n'
		);
	});

	test("inserts new keys in sorted position if next is sorted", () => {
		const previous = '{\n\t"a": "A",\n\t"c": "C",\n\t"e": "E"\n}';
		expect(
			keep(previous, { a: "A", b: "B", c: "C", d: "D", e: "E", f: "F" })
		).toBe(
			'{\n\t"a": "A",\n\t"b": "B",\n\t"c": "C",\n\t"d": "D",\n\t"e": "E",\n\t"f": "F"\n}'
		);
	});

	test("drops removed keys, including the first and the last", () => {
		const previous = '{\n  "a": "A",\n  "b": "B",\n  "c": "C"\n}\n';
		expect(keep(previous, { b: "B" }, { a: "A", b: "B", c: "C" })).toBe(
			'{\n  "b": "B"\n}\n'
		);
		expect(keep(previous, {}, { a: "A", b: "B", c: "C" })).toBe("{}\n");
	});

	test("keeps keys that the plugin neither imports nor writes, and drops removed ones", () => {
		const previous =
			'{\n  "$comment": "keep me",\n  "a": "A",\n  "b": "B"\n}\n';
		expect(keep(previous, { a: "A2" }, { a: "A", b: "B" })).toBe(
			'{\n  "$comment": "keep me",\n  "a": "A2"\n}\n'
		);
		// without the canonical value, unknown keys can't be told apart from
		// removed messages and are dropped
		expect(keep(previous, { a: "A2" })).toBe('{\n  "a": "A2"\n}\n');
	});

	test("flat keys of a plugin that writes them nested", () => {
		const previous =
			'{\n\t"nav.home": "Home",\n\t"nav": {\n\t\t"about": "About"\n\t},\n\t"x.y": "X"\n}\n';
		const canonical = {
			nav: { home: "Home", about: "About" },
			x: { y: "X" },
		};
		const splitKey = (key: string) => key.split(".");
		const run = (next: unknown) =>
			stringifyJsonKeepingEntries({
				previous,
				previousCanonical: canonical,
				next,
				splitKey,
			});
		expect(run(canonical)).toBe(previous);
		expect(
			run({
				nav: { home: "Start", about: "About", contact: "Contact" },
				x: { y: "X" },
			})
		).toBe(
			'{\n\t"nav.home": "Start",\n\t"nav": {\n\t\t"about": "About",\n\t\t"contact": "Contact"\n\t},\n\t"x.y": "X"\n}\n'
		);
		// removed
		expect(run({ nav: { about: "About" } })).toBe(
			'{\n\t"nav": {\n\t\t"about": "About"\n\t}\n}\n'
		);
		// another separator
		expect(
			stringifyJsonKeepingEntries({
				previous: '{\n\t"nav:home": "Home"\n}',
				previousCanonical: { nav: { home: "Home" } },
				next: { nav: { home: "Start" } },
				splitKey: (key) => key.split(":"),
			})
		).toBe('{\n\t"nav:home": "Start"\n}');
	});

	test("a removed object keeps the keys that the plugin doesn't import", () => {
		const previous =
			'{\n  "nav": {\n    "home": "Home",\n    "order": 3\n  },\n  "x": "X"\n}';
		expect(keep(previous, { x: "X" }, { nav: { home: "Home" }, x: "X" })).toBe(
			'{\n  "nav": {\n    "order": 3\n  },\n  "x": "X"\n}'
		);
	});

	test("a flat key whose value is an object is walked like the nested object", () => {
		const previous =
			'{\n\t"nav.menu": {\n\t\t"home": "Home",\n\t\t"about": "About"\n\t},\n\t"x": "X"\n}';
		const canonical = {
			nav: { menu: { home: "Home", about: "About" } },
			x: "X",
		};
		expect(keep(previous, { ...canonical, x: "X2" }, canonical)).toBe(
			previous.replace('"x": "X"', '"x": "X2"')
		);
		expect(
			keep(
				previous,
				{ nav: { menu: { home: "Start", about: "About" } }, x: "X" },
				canonical
			)
		).toBe(previous.replace('"home": "Home"', '"home": "Start"'));
	});

	test("a flat key that the plugin writes flat itself is not mapped to the nested path", () => {
		// e.g. the json plugin: "a.b" and a: { b } are two messages
		const previous = '{\n\t"a.b": "F",\n\t"a": {\n\t\t"b": "N"\n\t}\n}';
		const canonical = { "a.b": "F", a: { b: "N" } };
		expect(keep(previous, { a: { b: "N" } }, canonical)).toBe(
			'{\n\t"a": {\n\t\t"b": "N"\n\t}\n}'
		);
	});

	test("isEntry writes an object in full if anything in it changed", () => {
		const previous =
			'{\n  "a" : {\n    "state" : "needs_review",\n    "value" : "Hallo"\n  }\n}';
		const next = { a: { state: "translated", value: "Hallo!" } };
		const canonical = { a: { state: "translated", value: "Hallo" } };
		// walked key by key, the old state stays
		expect(keep(previous, next, canonical)).toContain('"needs_review"');
		expect(
			stringifyJsonKeepingEntries({
				previous,
				previousCanonical: canonical,
				next,
				isEntry: (path) => path.length === 1,
			})
		).toBe(
			'{\n  "a" : {\n    "state" : "translated",\n    "value" : "Hallo!"\n  }\n}'
		);
		// unchanged, the entry is kept as it is
		expect(
			stringifyJsonKeepingEntries({
				previous,
				previousCanonical: canonical,
				next: canonical,
				isEntry: (path) => path.length === 1,
			})
		).toBe(previous);
	});

	test("the order of objects in arrays is part of the value", () => {
		const previous =
			'{\n\t"a": [{ "match": { "x=1": "one", "x=*": "other" } }]\n}';
		// a reordered variant is a change
		expect(
			keep(previous, { a: [{ match: { "x=*": "other", "x=1": "one" } }] })
		).toBe(
			'{\n\t"a": [\n\t\t{\n\t\t\t"match": {\n\t\t\t\t"x=*": "other",\n\t\t\t\t"x=1": "one"\n\t\t\t}\n\t\t}\n\t]\n}'
		);
		expect(
			keep(previous, { a: [{ match: { "x=1": "one", "x=*": "other" } }] })
		).toBe(previous);
	});

	test("a new key after a removed key goes to the removed key's place", () => {
		const previous = '{\n  "a": "A",\n  "b": "B",\n  "c": "C"\n}';
		expect(
			keep(previous, { a: "A", b2: "B2", c: "C" }, { a: "A", b: "B", c: "C" })
		).toBe('{\n  "a": "A",\n  "b2": "B2",\n  "c": "C"\n}');
	});

	test("the indentation of new complex values comes from the first member on its own line", () => {
		const previous = '{ "a": "x",\n  "b": "y"\n}';
		expect(keep(previous, { a: "x", b: "y", c: ["z"] })).toBe(
			'{ "a": "x",\n  "b": "y",\n  "c": [\n    "z"\n  ]\n}'
		);
	});

	test("keeps a legacy shape if the plugin writes the same value for it", () => {
		const previous = '{\n\t"a": ["Hello"],\n\t"b": ["Bye"]\n}\n';
		expect(
			keep(previous, { a: "Hello", b: "Bye!" }, { a: "Hello", b: "Bye" })
		).toBe('{\n\t"a": ["Hello"],\n\t"b": "Bye!"\n}\n');
	});

	test("doesn't add a key the plugin writes for the previous file too", () => {
		const previous = '{\n\t"a": "A"\n}\n';
		expect(
			keep(
				previous,
				{ $schema: "https://example.com", a: "A2" },
				{ $schema: "https://example.com", a: "A" }
			)
		).toBe('{\n\t"a": "A2"\n}\n');
	});

	test("an entry is changed if its value differs from both the previous and the canonical value", () => {
		const previous = '{\n\t"a": ["Hello"]\n}\n';
		// e.g. only whitespace inside the pattern changed
		expect(keep(previous, { a: "Hello " }, { a: "Hello" })).toBe(
			'{\n\t"a": "Hello "\n}\n'
		);
	});

	test("nested objects keep their entries, order and formatting; new keys are formatted like the key before them", () => {
		const previous =
			'{\n  "nav": {\n    "home": "Home",\n    "about":"About"\n  },\n  "x": "X"\n}\n';
		expect(
			keep(previous, {
				nav: { home: "Start", about: "About", contact: "Contact" },
				x: "X",
			})
		).toBe(
			'{\n  "nav": {\n    "home": "Start",\n    "about":"About",\n    "contact":"Contact"\n  },\n  "x": "X"\n}\n'
		);
	});

	test("writes changed complex values with the indentation of the file", () => {
		const previous = '{\n    "a": "A",\n    "b": [{"match": {"x": "1"}}]\n}\n';
		expect(
			keep(previous, { a: "A", b: [{ match: { x: "2" } }], c: { d: ["e"] } })
		).toBe(
			'{\n    "a": "A",\n    "b": [\n        {\n            "match": {\n                "x": "2"\n            }\n        }\n    ],\n    "c": {\n        "d": [\n            "e"\n        ]\n    }\n}\n'
		);
	});

	test("keeps CRLF line endings", () => {
		const previous = '{\r\n\t"a": "A",\r\n\t"b": "B"\r\n}\r\n';
		expect(keep(previous, { a: "A", b: ["x"], c: "C" })).toBe(
			'{\r\n\t"a": "A",\r\n\t"b": [\r\n\t\t"x"\r\n\t],\r\n\t"c": "C"\r\n}\r\n'
		);
	});

	test("keeps a byte order mark and surrounding whitespace", () => {
		const previous = '\uFEFF\n{ "a": "A" }  \n\n';
		expect(keep(previous, { a: "B" })).toBe('\uFEFF\n{ "a": "B" }  \n\n');
	});

	test("writes into minified files without indentation", () => {
		expect(keep('{"a":"A","b":"B"}', { a: "A", b: "B2", c: [1] })).toBe(
			'{"a":"A","b":"B2","c":[1]}'
		);
	});

	test("Xcode's ` : ` separator is used for new keys too, also inside new values", () => {
		const previous = '{\n  "a" : "A",\n  "n" : {\n    "x" : 1\n  }\n}';
		expect(
			keep(previous, { a: "A", n: { x: 1, y: [{ z: 2 }, []] }, b: { c: {} } })
		).toBe(
			'{\n  "a" : "A",\n  "n" : {\n    "x" : 1,\n    "y" : [\n      {\n        "z" : 2\n      },\n      []\n    ]\n  },\n  "b" : {\n    "c" : {}\n  }\n}'
		);
	});

	test("new values are written like JSON.stringify", () => {
		const value = {
			s: 'quote " \u2028 \u0001 😀',
			n: [1, 1.5, 1e21, null, true],
			o: { "": "empty key", nested: { a: [] } },
		};
		for (const indent of ["\t", "  ", ""]) {
			const previous = indent === "" ? '{"a":1}' : `{\n${indent}"a": 1\n}`;
			const result = keep(previous, { a: 1, value })!;
			expect(JSON.parse(result)).toEqual({ a: 1, value });
			expect(result).toContain(
				JSON.stringify(value, undefined, indent).replace(/\n/g, `\n${indent}`)
			);
		}
	});

	test("an empty previous object uses the default indentation", () => {
		expect(keep("{}\n", { a: "A" })).toBe('{\n\t"a": "A"\n}\n');
		expect(
			stringifyJsonKeepingEntries({ previous: "{ }", next: {}, indent: "  " })
		).toBe("{ }");
	});

	test("unicode in keys is kept as written", () => {
		const previous = '{\n\t"gr\\u00fc\\u00dfe": "Hallo",\n\t"😀": "smile"\n}';
		expect(keep(previous, { grüße: "Hallo", "😀": "Lächeln" })).toBe(
			'{\n\t"gr\\u00fc\\u00dfe": "Hallo",\n\t"😀": "Lächeln"\n}'
		);
	});

	test("returns undefined for invalid JSON, non-objects and duplicate keys", () => {
		expect(keep("{", { a: "A" })).toBeUndefined();
		expect(keep('["a"]', { a: "A" })).toBeUndefined();
		expect(keep('{"a": "A", "a": "B"}', { a: "A" })).toBeUndefined();
	});

	test("a type change of a nested value is written as a new value", () => {
		const previous = '{\n\t"a": {\n\t\t"b": "B"\n\t}\n}';
		expect(keep(previous, { a: "A" })).toBe('{\n\t"a": "A"\n}');
		expect(keep('{\n\t"a": "A"\n}', { a: { b: "B" } })).toBe(
			'{\n\t"a": {\n\t\t"b": "B"\n\t}\n}'
		);
	});
});

describe("jsonEquals", () => {
	test("ignores key order but not array order", () => {
		expect(jsonEquals({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
		expect(jsonEquals({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
		expect(jsonEquals({ a: 1 }, { a: 1, b: undefined })).toBe(false);
		expect(jsonEquals(["a"], "a")).toBe(false);
		expect(jsonEquals(null, {})).toBe(false);
	});
});

describe("rowsFromImport", () => {
	test("links variants to messages by bundle and locale and merges duplicates like the SDK", () => {
		const rows = rowsFromImport({
			bundles: [
				{ id: "a", declarations: [] },
				{ id: "a", declarations: [{ type: "input-variable", name: "x" }] },
			],
			messages: [{ bundleId: "a", locale: "en", selectors: [] }],
			variants: [
				{
					messageBundleId: "a",
					messageLocale: "en",
					matches: [],
					pattern: [{ type: "text", value: "1" }],
				},
				{
					messageBundleId: "a",
					messageLocale: "en",
					matches: [],
					pattern: [{ type: "text", value: "2" }],
				},
				{
					messageBundleId: "b",
					messageLocale: "de",
					matches: [],
					pattern: [{ type: "text", value: "3" }],
				},
			],
		});
		expect(rows.bundles).toEqual([
			{ id: "a", declarations: [{ type: "input-variable", name: "x" }] },
			{ id: "b", declarations: [] },
		]);
		expect(rows.messages.map((m) => [m.bundleId, m.locale])).toEqual([
			["a", "en"],
			["b", "de"],
		]);
		expect(
			rows.variants.map((v) => [
				rows.messages.find((m) => m.id === v.messageId)!.bundleId,
				v.pattern,
			])
		).toEqual([
			["a", [{ type: "text", value: "2" }]],
			["b", [{ type: "text", value: "3" }]],
		]);
	});
});

describe("keepUnchangedJsonEntries", () => {
	// A plugin for `{ "key": "text" }` files that also reads `"key": ["text"]`.
	const importFiles = async ({
		files,
	}: {
		files: Array<{ locale: string; content: Uint8Array }>;
	}) => {
		const result: Awaited<
			ReturnType<NonNullable<InlangPlugin["importFiles"]>>
		> = { bundles: [], messages: [], variants: [] };
		for (const file of files) {
			const json = JSON.parse(new TextDecoder().decode(file.content));
			for (const [key, value] of Object.entries(json)) {
				if (key === "$schema") continue;
				const text = Array.isArray(value) ? value[0] : value;
				result.bundles.push({ id: key, declarations: [] });
				result.messages.push({
					bundleId: key,
					locale: file.locale,
					selectors: [],
				});
				result.variants.push({
					messageBundleId: key,
					messageLocale: file.locale,
					matches: [],
					pattern: [{ type: "text", value: text as string }],
				});
			}
		}
		return result;
	};
	const exportFiles = async ({
		messages,
		variants,
	}: Parameters<NonNullable<InlangPlugin["exportFiles"]>>[0]) => {
		const files: Record<string, Record<string, string>> = {};
		for (const message of messages) {
			const variant = variants.find((v) => v.messageId === message.id)!;
			files[message.locale] ??= { $schema: "schema" };
			files[message.locale]![message.bundleId] = variant.pattern
				.map((part) => (part.type === "text" ? part.value : ""))
				.join("");
		}
		return Object.entries(files).map(
			([locale, json]): ExportFile => ({
				locale,
				name: `${locale}.json`,
				content: new TextEncoder().encode(
					JSON.stringify(json, undefined, "\t")
				),
			})
		);
	};
	const encode = (text: string) => new TextEncoder().encode(text);
	const decode = (content: Uint8Array) => new TextDecoder().decode(content);

	async function run(
		previous: Record<string, string>,
		next: Record<string, Record<string, string>>
	) {
		const rows = rowsFromImport(
			await importFiles({
				files: Object.entries(next).map(([locale, json]) => ({
					locale,
					content: encode(JSON.stringify(json)),
				})),
			})
		);
		const settings = { locales: Object.keys(next) } as any;
		const exported = await exportFiles({ ...rows, settings: settings as any });
		const files = await keepUnchangedJsonEntries({
			exported,
			files: Object.entries(previous).map(([locale, text]) => ({
				path: `./${locale}.json`,
				locale,
				content: encode(text),
			})),
			settings,
			importFiles,
			exportFiles,
		});
		return Object.fromEntries(
			files.map((file) => [file.locale, decode(file.content)])
		);
	}

	test("keeps unchanged entries, legacy shapes and formatting per file", async () => {
		const en = '{\n  "b": ["B"],\n  "a": "A"\n}\n';
		const result = await run(
			{ en, de: '{\n  "a": "A-de"\n}' },
			{
				en: { a: "A", b: "B" },
				de: { a: "A-de", c: "C-de" },
				fr: { a: "A-fr" },
			}
		);
		expect(result.en).toBe(en);
		expect(result.de).toBe('{\n  "a": "A-de",\n  "c": "C-de"\n}');
		// no previous file
		expect(result.fr).toBe('{\n\t"$schema": "schema",\n\t"a": "A-fr"\n}');
	});

	test("writes the full export if the previous file is invalid", async () => {
		const result = await run({ en: "{ invalid" }, { en: { a: "A" } });
		expect(result.en).toBe('{\n\t"$schema": "schema",\n\t"a": "A"\n}');
	});

	test("a flat key that the plugin writes nested is kept, and an edit is written in its place", async () => {
		// A plugin that imports nested keys as dotted ids and writes them nested.
		const importNested: typeof importFiles = async ({ files }) =>
			importFiles({
				files: files.map((file) => ({
					...file,
					content: encode(
						JSON.stringify(flatten(JSON.parse(decode(file.content))))
					),
				})),
			});
		const exportNested: typeof exportFiles = async (args) =>
			(await exportFiles(args)).map((file) => ({
				...file,
				content: encode(
					JSON.stringify(
						nest(JSON.parse(decode(file.content))),
						undefined,
						"\t"
					)
				),
			}));
		const previous = '{\n\t"$schema": "schema",\n\t"b.c": "x"\n}';
		const exported = await exportNested({
			...rowsFromImport(
				await importNested({
					files: [{ locale: "en", content: encode(previous) }],
				})
			),
			settings: {} as any,
		});
		const [kept] = await keepUnchangedJsonEntries({
			exported,
			files: [{ path: "./en.json", locale: "en", content: encode(previous) }],
			settings: {} as any,
			importFiles: importNested,
			exportFiles: exportNested,
		});
		expect(decode(kept!.content)).toBe(previous);
		expect(kept!.verbatim).toBe(true);
		const edited = await exportNested({
			...rowsFromImport(
				await importNested({
					files: [{ locale: "en", content: encode('{"b.c": "y"}') }],
				})
			),
			settings: {} as any,
		});
		const [file] = await keepUnchangedJsonEntries({
			exported: edited,
			files: [{ path: "./en.json", locale: "en", content: encode(previous) }],
			settings: {} as any,
			importFiles: importNested,
			exportFiles: exportNested,
		});
		expect(decode(file!.content)).toBe(
			'{\n\t"$schema": "schema",\n\t"b.c": "y"\n}'
		);
	});

	test("writes the full export if the result doesn't import to the new messages", async () => {
		// A plugin that reads keys case-insensitively, the last one wins. `"A"`
		// is unknown to the entry-by-entry comparison and is kept, but it
		// overrides the edited `"a"` when the file is imported.
		const importLowercase: typeof importFiles = async ({ files }) =>
			importFiles({
				files: files.map((file) => ({
					...file,
					content: encode(
						JSON.stringify(
							Object.fromEntries(
								Object.entries(JSON.parse(decode(file.content))).map(
									([key, value]) => [key.toLowerCase(), value]
								)
							)
						)
					),
				})),
			});
		const previous = '{\n\t"a": "1",\n\t"A": "2"\n}';
		const exportOf = async (json: string) =>
			exportFiles({
				...rowsFromImport(
					await importLowercase({
						files: [{ locale: "en", content: encode(json) }],
					})
				),
				settings: {} as any,
			});
		const run = async (exported: ExportFile[]) =>
			(
				await keepUnchangedJsonEntries({
					exported,
					files: [
						{ path: "./en.json", locale: "en", content: encode(previous) },
					],
					settings: {} as any,
					importFiles: importLowercase,
					exportFiles,
				})
			)[0]!;
		// unchanged: kept as it is
		const unchanged = await run(await exportOf(previous));
		expect(decode(unchanged.content)).toBe(previous);
		// edited: the kept "A" would win over the edit, so the full export is
		// written
		const edited = await run(await exportOf('{"a": "3"}'));
		expect(edited.verbatim).toBeUndefined();
		expect(decode(edited.content)).toBe(
			'{\n\t"$schema": "schema",\n\t"a": "3"\n}'
		);
	});

	test("a kept key that the plugin imports into another file can't bring back a deleted message", async () => {
		// Like i18next: `"x:y"` in en.json is message `y` of namespace `x`,
		// which the plugin writes to x-en.json.
		const importRouted: typeof importFiles = async ({ files }) =>
			importFiles({
				files: files.map((file: any) => {
					const namespace = file.toBeImportedFilesMetadata?.namespace;
					const json = JSON.parse(decode(file.content));
					return {
						locale: file.locale,
						content: encode(
							JSON.stringify(
								Object.fromEntries(
									Object.entries(json).map(([key, value]) => [
										namespace ? `${namespace}:${key}` : key,
										value,
									])
								)
							)
						),
					};
				}),
			});
		const exportRouted = async (
			args: Parameters<typeof exportFiles>[0]
		): Promise<ExportFile[]> => {
			const files = new Map<string, ExportFile & { json: any }>();
			for (const file of await exportFiles(args)) {
				const json = JSON.parse(decode(file.content));
				for (const [key, value] of Object.entries(json)) {
					const [namespace, rest] = key.includes(":")
						? key.split(":")
						: [undefined, key];
					const name = namespace
						? `${namespace}-${file.locale}.json`
						: file.name;
					const target = files.get(name) ?? {
						...file,
						name,
						metadata: namespace ? { namespace } : undefined,
						json: {},
					};
					target.json[rest!] = value;
					files.set(name, target);
				}
			}
			return [...files.values()].map(({ json, ...file }) => ({
				...file,
				content: encode(JSON.stringify(json, undefined, "\t")),
			}));
		};
		const previous = '{\n\t"$schema": "schema",\n\t"x:y": "X",\n\t"c": "C"\n}';
		// delete x:y, edit c
		const exported = await exportRouted({
			...rowsFromImport(
				await importRouted({
					files: [{ locale: "en", content: encode('{"c": "C2"}') }],
				})
			),
			settings: {} as any,
		});
		const result = await keepUnchangedJsonEntries({
			exported,
			files: [{ path: "./en.json", locale: "en", content: encode(previous) }],
			settings: {} as any,
			importFiles: importRouted,
			exportFiles: exportRouted,
		});
		expect(result.map((file) => decode(file.content))).toEqual(
			exported.map((file) => decode(file.content))
		);
		expect(result.every((file) => file.verbatim === undefined)).toBe(true);
	});

	test("a locale with several existing files is written in full", async () => {
		const exported = await exportFiles({
			...rowsFromImport(
				await importFiles({
					files: [{ locale: "en", content: encode('{"a": "A"}') }],
				})
			),
			settings: {} as any,
		});
		const [file] = await keepUnchangedJsonEntries({
			exported,
			files: [
				{ path: "./a/en.json", locale: "en", content: encode('{ "a": "A" }') },
				{ path: "./b/en.json", locale: "en", content: encode("{}") },
			],
			settings: {} as any,
			importFiles,
			exportFiles,
		});
		expect(file).toBe(exported[0]);
	});

	test("files without a previous file or without any previous files are returned as is", async () => {
		const exported: ExportFile[] = [
			{ locale: "en", name: "en.json", content: encode("{}") },
		];
		const args = { exported, settings: {} as any, importFiles, exportFiles };
		expect(await keepUnchangedJsonEntries({ ...args, files: undefined })).toBe(
			exported
		);
		expect(await keepUnchangedJsonEntries({ ...args, files: [] })).toBe(
			exported
		);
	});
});

function flatten(
	json: Record<string, unknown>,
	prefix = ""
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(json)) {
		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			Object.assign(
				result,
				flatten(value as Record<string, unknown>, `${prefix}${key}.`)
			);
		} else {
			result[`${prefix}${key}`] = value;
		}
	}
	return result;
}

function nest(json: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, any> = {};
	for (const [key, value] of Object.entries(json)) {
		const path = key === "$schema" ? [key] : key.split(".");
		let cursor = result;
		for (const segment of path.slice(0, -1)) cursor = cursor[segment] ??= {};
		cursor[path[path.length - 1]!] = value;
	}
	return result;
}

test("the module is ASCII, so that plugins that bundle it load in SDK 3", async () => {
	// SDK 3 imports plugin modules from a base64 data URL made with `btoa`,
	// which throws on characters outside Latin-1.
	const { readFileSync } = await import("node:fs");
	const source = readFileSync(
		new URL("./keepUnchangedJsonEntries.ts", import.meta.url),
		"utf8"
	);
	expect(source.match(/[^\x00-\x7F]/g) ?? []).toEqual([]);
});
