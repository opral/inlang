import { describe, expect, test } from "vitest";
import type {
	Bundle,
	ExistingFile,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

// Saving a project passes the files on disk to `exportFiles`. The export
// keeps the text of every entry that didn't change, so that only the edited
// entries change in git.

type Rows = { bundles: Bundle[]; messages: Message[]; variants: Variant[] };
type Files = Record<string, string>;

const settings = (
	pathPattern: string | Record<string, string> = "./{locale}.json"
) => ({
	baseLocale: "en",
	locales: ["en", "de", "fr"],
	"plugin.inlang.i18next": { pathPattern },
});

// An English file as people write it by hand: odd whitespace, an unsorted key
// order, `\u` escapes, `{{ name }}` with spaces (the export writes
// `{{name}}`), nested keys and `_zero` before, between, after and apart from
// its plural siblings.
const handWritten = `{
  "zebra": "Zebra",
  "apple" :   "Caf\\u00e9 \\u2013 {{ name }}",
  "item_one": "One item",
  "item_zero": "No items",
  "item_other": "{{count}} items",
  "nested": {
    "deep": {"key": "Deep",   "other": "Other"},
    "b": "B"
  },
  "box_zero": "No boxes",
  "between": "Between",
  "box_one": "One box",
  "box_other": "{{count}} boxes",
  "cat_one": "One cat",
  "cat_other": "{{count}} cats",
  "cat_zero": "No cats",
  "friend": "A friend",
  "friend_male": "A boyfriend"
}
`;

const fixtures: Record<string, string> = {
	"2 spaces": handWritten,
	tabs: handWritten.replace(/^( {2})+/gm, (spaces) =>
		"\t".repeat(spaces.length / 2)
	),
	CRLF: handWritten.replace(/\n/g, "\r\n"),
	"no final newline": handWritten.trimEnd(),
	"one line": JSON.stringify(JSON.parse(handWritten)),
	"byte order mark": "﻿" + handWritten,
};

describe("an export without edits writes the previous files byte for byte", () => {
	test.each(Object.entries(fixtures))("%s", async (_, text) => {
		const files = { "en.json": text };
		const rows = await load(files);
		expect(await save(rows, files)).toStrictEqual(files);
		expect(bytes(await save(rows, files))).toStrictEqual(bytes(files));
		// without the previous file, the export writes the whole file
		expect((await save(rows))["en.json"]).not.toBe(text);
	});

	test("a file of each locale", async () => {
		const files = {
			"en.json": handWritten,
			"de.json": `{
    "zebra" : "Zebra",
    "item_other": "{{count}} Dinge",
  "item_one": "Ein Ding",
      "friend_male": "Ein Freund"
}`,
			"fr.json": `{"item_zero":"Aucun","item_one":"Un","item_other":"{{count}}"}\n`,
		};
		const rows = await load(files);
		expect(await save(rows, files)).toStrictEqual(files);
	});
});

describe("an edit changes only the bytes of the edited entry", () => {
	test.each(Object.entries(fixtures))("%s", async (name, text) => {
		const files = { "en.json": text };
		const rows = await load(files);
		setPattern(rows, "zebra", "en", [{ type: "text", value: "Zèbre" }]);
		const expected = text.replace(/("zebra"\s*:\s*)"Zebra"/, '$1"Zèbre"');
		expect(expected).not.toBe(text);
		expect(await save(rows, files)).toStrictEqual({ "en.json": expected });
		if (name === "byte order mark") {
			expect(bytes(await save(rows, files))["en.json"]!.slice(0, 3)).toEqual([
				0xef, 0xbb, 0xbf,
			]);
		}
	});

	test("a nested entry", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(rows, "nested.deep.other", "en", [
			{ type: "text", value: "Other edited" },
		]);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"other": "Other"',
				'"other": "Other edited"'
			),
		});
	});

	test("an entry with escapes and an interpolation is rewritten as the export writes it", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(rows, "apple", "en", [
			{ type: "text", value: "Café – " },
			variable("name"),
			{ type: "text", value: "!" },
		]);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"apple" :   "Caf\\u00e9 \\u2013 {{ name }}"',
				'"apple" :   "Café – {{name}}!"'
			),
		});
	});

	test("one form of a plural", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(
			rows,
			"box",
			"en",
			[{ type: "text", value: "A single box" }],
			(variant) => hasMatch(variant, "countPlural", "one")
		);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"box_one": "One box"',
				'"box_one": "A single box"'
			),
		});
	});
});

describe("data changes are detected", () => {
	test("only the match of a plural form changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		const variant = variantsOf(rows, "cat", "en").find((variant) =>
			hasMatch(variant, "countPlural", "one")
		)!;
		variant.matches = variant.matches.map((match) =>
			match.key === "countPlural"
				? { type: "literal-match", key: "countPlural", value: "two" }
				: match
		);
		// `cat_two` is a new key. It comes first of the keys of `cat` in the
		// export, right after `between`.
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten
				.replace('  "cat_one": "One cat",\n', "")
				.replace(
					'  "between": "Between",\n',
					'  "between": "Between",\n  "cat_two": "One cat",\n'
				),
		});
	});

	test("only the match of a context changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		const variant = variantsOf(rows, "friend", "en").find((variant) =>
			hasMatch(variant, "context", "male")
		)!;
		variant.matches = variant.matches.map((match) =>
			match.key === "context"
				? { type: "literal-match", key: "context", value: "female" }
				: match
		);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"friend_male": "A boyfriend"',
				'"friend_female": "A boyfriend"'
			),
		});
	});

	// English `_zero` imports as the exact form `count = 0` and as the plural
	// category "zero" with the same text. i18next shows the exact form.
	test("only the exact 0 form of `_zero` changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		const forms = variantsOf(rows, "item", "en").filter((variant) =>
			textOf(variant).includes("No items")
		);
		expect(forms).toHaveLength(2);
		const exact = forms.find((variant) => hasMatch(variant, "count", "0"))!;
		exact.pattern = [{ type: "text", value: "Nothing" }];
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"item_zero": "No items"',
				'"item_zero": "Nothing"'
			),
		});
	});

	test("only the zero category form of `_zero` changed: as without the previous file, i18next doesn't show it in English", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		const category = variantsOf(rows, "item", "en").find((variant) =>
			hasMatch(variant, "countPlural", "zero")
		)!;
		category.pattern = [{ type: "text", value: "Category edit" }];
		expect(await save(rows, files)).toStrictEqual(files);
		expect(await save(rows)).toStrictEqual(await save(await load(files)));
	});

	test("only whitespace inside a pattern changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(rows, "zebra", "en", [{ type: "text", value: "Zebra " }]);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace('"zebra": "Zebra"', '"zebra": "Zebra "'),
		});
	});

	test("only the variable of an interpolation changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(
			rows,
			"item",
			"en",
			[variable("n"), { type: "text", value: " items" }],
			(variant) => hasMatch(variant, "countPlural", "other")
		);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"item_other": "{{count}} items"',
				'"item_other": "{{n}} items"'
			),
		});
	});

	test("only the format of an interpolation changed", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		setPattern(
			rows,
			"item",
			"en",
			[
				{
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
				{ type: "text", value: " items" },
			],
			(variant) => hasMatch(variant, "countPlural", "other")
		);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"item_other": "{{count}} items"',
				'"item_other": "{{count, number}} items"'
			),
		});
	});

	test("only the spaces of `{{ name }}` would change: the previous text is kept", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		// the export writes `{{name}}`, which i18next reads like `{{ name }}`
		expect(JSON.parse((await save(rows))["en.json"]!).apple).toBe(
			"Café – {{name}}"
		);
		expect((await save(rows, files))["en.json"]).toContain(
			'"apple" :   "Caf\\u00e9 \\u2013 {{ name }}"'
		);
	});
});

describe("adding and removing messages", () => {
	test("a new message is inserted after the key that precedes it in the export", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		// a new message comes last in the project, as in the database
		addMessage(rows, "banana", "en", "Banana");
		addMessage(rows, "nested.c", "en", "C");
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten
				.replace('    "b": "B"\n', '    "b": "B",\n    "c": "C"\n')
				.replace(
					'"friend_male": "A boyfriend"\n',
					'"friend_male": "A boyfriend",\n  "banana": "Banana"\n'
				),
		});
	});

	test("a new message in a file with tabs and CRLF is indented like its neighbors", async () => {
		const text = fixtures["tabs"]!.replace(/\n/g, "\r\n");
		const files = { "en.json": text };
		const rows = await load(files);
		addMessage(rows, "banana", "en", "Banana");
		expect(await save(rows, files)).toStrictEqual({
			"en.json": text.replace(
				'"friend_male": "A boyfriend"\r\n',
				'"friend_male": "A boyfriend",\r\n\t"banana": "Banana"\r\n'
			),
		});
	});

	test("a removed message is dropped", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		removeBundle(rows, "between");
		removeBundle(rows, "zebra");
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten
				.replace('  "between": "Between",\n', "")
				.replace('  "zebra": "Zebra",\n', ""),
		});
	});

	test("a removed last entry", async () => {
		const files = { "en.json": handWritten };
		const rows = await load(files);
		const male = variantsOf(rows, "friend", "en").find((variant) =>
			hasMatch(variant, "context", "male")
		)!;
		rows.variants = rows.variants.filter((variant) => variant !== male);
		expect(await save(rows, files)).toStrictEqual({
			"en.json": handWritten.replace(
				'"friend": "A friend",\n  "friend_male": "A boyfriend"\n',
				'"friend": "A friend"\n'
			),
		});
	});
});

describe("namespaces", () => {
	const pathPattern = {
		common: "./locales/{locale}/common.json",
		app: "./locales/{locale}/app.json",
	};
	const namespaced = {
		"common/en": `{
    "hello": "Hello",
    "bye":   "Bye",
    "menu": { "open": "Open", "close": "Close" }
}
`,
		"app/en": `{\r\n  "title": "My app",\r\n  "count_zero": "None",\r\n  "count_other": "{{count}}"\r\n}`,
		"common/de": `{
\t"bye": "Tschüss",
\t"hello": "Hallo"
}`,
	};

	test("an export without edits writes the previous files byte for byte", async () => {
		const rows = await load(namespaced, pathPattern);
		expect(await save(rows, namespaced, pathPattern)).toStrictEqual(namespaced);
	});

	test("an edit changes only the edited entry of its namespace", async () => {
		const rows = await load(namespaced, pathPattern);
		setPattern(rows, "common:menu.close", "en", [
			{ type: "text", value: "Shut" },
		]);
		expect(await save(rows, namespaced, pathPattern)).toStrictEqual({
			...namespaced,
			"common/en": namespaced["common/en"].replace(
				'"close": "Close"',
				'"close": "Shut"'
			),
		});
	});

	test("a message moved to another namespace", async () => {
		const rows = await load(namespaced, pathPattern);
		renameBundle(rows, "common:bye", "app:bye");
		expect(await save(rows, namespaced, pathPattern)).toStrictEqual({
			"common/en": namespaced["common/en"].replace('    "bye":   "Bye",\n', ""),
			// the moved message comes first in the export of the namespace
			"app/en": namespaced["app/en"].replace(
				"{\r\n",
				'{\r\n  "bye": "Bye",\r\n'
			),
			"common/de": namespaced["common/de"].replace('\t"bye": "Tschüss",\n', ""),
			// a new file
			"app/de": '{\n\t"bye": "Tschüss"\n}\n',
		});
	});
});

// Namespaces `a` and `a:b` both have the bundle id `a:b:c`: the key `b:c` of
// `a` and the key `c` of `a:b`. A message is written to the namespace whose
// previous file has it; one that neither has to the longest namespace.
describe.each([
	{ a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" },
	{ "a:b": "./{locale}/a-b.json", a: "./{locale}/a.json" },
])("namespaces %j and the key `b:c` of `a`", (pathPattern) => {
	const files = {
		"a/en": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
		"a:b/en": '{\n  "d": "D"\n}\n',
	};
	const load_ = async () => {
		const rows = await load(files, pathPattern);
		// the order of the messages of a database is arbitrary: `a` first
		rows.messages.sort(
			(a, b) => Number(b.bundleId === "a:x") - Number(a.bundleId === "a:x")
		);
		return rows;
	};

	test("an edit changes only its entry in `a`, the file it was read from", async () => {
		const rows = await load_();
		setPattern(rows, "a:b:c", "en", [{ type: "text", value: "C edited" }]);
		expect(await save(rows, files, pathPattern)).toStrictEqual({
			...files,
			"a/en": files["a/en"].replace('"C"', '"C edited"'),
		});
	});

	test("removing it removes only its entry from `a`", async () => {
		const rows = await load_();
		removeBundle(rows, "a:b:c");
		expect(await save(rows, files, pathPattern)).toStrictEqual({
			...files,
			"a/en": '{\n  "x": "X"\n}\n',
		});
	});

	test("a new message that no file has is written to `a:b`", async () => {
		const rows = await load_();
		addMessage(rows, "a:b:new", "en", "New");
		expect(await save(rows, files, pathPattern)).toStrictEqual({
			...files,
			"a:b/en": '{\n  "d": "D",\n  "new": "New"\n}\n',
		});
	});

	test("without the previous files, it is written to `a:b`", async () => {
		const rows = await load_();
		const saved = await save(rows, undefined, pathPattern);
		expect(JSON.parse(saved["a:b/en"]!)).toStrictEqual({ c: "C", d: "D" });
		expect(JSON.parse(saved["a/en"]!)).toStrictEqual({ x: "X" });
	});
});

describe.each([
	{ a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" },
	{ "a:b": "./{locale}/a-b.json", a: "./{locale}/a.json" },
])("namespaces %j: a message of `a` stays in `a`", (pathPattern) => {
	test("a new translation of it, which the file of its locale doesn't have yet", async () => {
		const files = {
			"a/en": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
			"a/de": '{\n  "x": "X de"\n}\n',
			"a:b/en": '{\n  "d": "D"\n}\n',
		};
		const rows = await load(files, pathPattern);
		addMessage(rows, "a:b:c", "de", "C de");
		expect(await save(rows, files, pathPattern)).toStrictEqual({
			...files,
			"a/de": '{\n  "x": "X de",\n  "b:c": "C de"\n}\n',
		});
	});

	test("a plural changed to a plain message", async () => {
		const files = {
			"a/en": '{\n  "x": "X",\n  "b:c_one": "One",\n  "b:c_other": "Many"\n}\n',
			"a:b/en": '{\n  "d": "D"\n}\n',
		};
		const rows = await load(files, pathPattern);
		const message = rows.messages.find(
			(message) => message.bundleId === "a:b:c"
		)!;
		message.selectors = [];
		rows.variants = [
			...rows.variants.filter((variant) => variant.messageId !== message.id),
			{
				id: "plain",
				messageId: message.id,
				matches: [],
				pattern: [{ type: "text", value: "Plain" }],
			},
		];
		expect(await save(rows, files, pathPattern)).toStrictEqual({
			...files,
			"a/en": '{\n  "x": "X",\n  "b:c": "Plain"\n}\n',
		});
	});

	test("a plain message changed to a plural", async () => {
		const files = {
			"a/en": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
			"a:b/en": '{\n  "d": "D"\n}\n',
		};
		const rows = await load(files, pathPattern);
		const bundle = rows.bundles.find((bundle) => bundle.id === "a:b:c")!;
		bundle.declarations = [
			{ type: "input-variable", name: "count" },
			{
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [],
					},
				},
			},
		];
		const message = rows.messages.find(
			(message) => message.bundleId === "a:b:c"
		)!;
		message.selectors = [{ type: "variable-reference", name: "countPlural" }];
		rows.variants = [
			...rows.variants.filter((variant) => variant.messageId !== message.id),
			...["one", "other"].map((category) => ({
				id: category,
				messageId: message.id,
				matches: [
					{
						type: "literal-match" as const,
						key: "countPlural",
						value: category,
					},
				],
				pattern: [{ type: "text" as const, value: category }],
			})),
		];
		const saved = await save(rows, files, pathPattern);
		expect(saved["a:b/en"]).toBe(files["a:b/en"]);
		expect(JSON.parse(saved["a/en"]!)).toStrictEqual({
			x: "X",
			"b:c_one": "one",
			"b:c_other": "other",
		});
	});
});

test("namespaces `a` and `a:b` that both have `a:b:c`: an edit is written to the file read last, whose text a project load keeps", async () => {
	const pathPattern = { a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" };
	const files = {
		"a/en": '{\n  "b:c": "C of a"\n}\n',
		"a:b/en": '{\n  "c": "C of a:b"\n}\n',
	};
	const rows = await load(files, pathPattern);
	expect(textOf(variantsOf(rows, "a:b:c", "en").at(-1)!)).toBe("C of a:b");
	// one message per bundle and locale, like a database
	rows.variants = [variantsOf(rows, "a:b:c", "en").at(-1)!];
	setPattern(rows, "a:b:c", "en", [{ type: "text", value: "Edited" }]);
	// `a` has no message left to export, so it isn't written
	expect(await save(rows, files, pathPattern)).toStrictEqual({
		"a:b/en": '{\n  "c": "Edited"\n}\n',
	});
});

describe("without a usable previous file, the export writes whole files", () => {
	test("a new locale", async () => {
		const files = {
			"en.json": handWritten,
			"de.json": '{"item_zero": "Keine", "item_other": "{{count}} Dinge"}',
		};
		const rows = await load(files);
		const whole = await save(rows);
		const saved = await save(rows, { "en.json": handWritten });
		expect(saved["en.json"]).toBe(handWritten);
		expect(saved["de.json"]).toBe(whole["de.json"]);
		expect(saved["de.json"]).toBe(
			'{\n\t"item_zero": "Keine",\n\t"item_other": "{{count}} Dinge"\n}\n'
		);
	});

	test("no files and an empty list of files", async () => {
		const rows = await load({ "en.json": handWritten });
		const whole = await save(rows);
		expect(await save(rows, {})).toStrictEqual(whole);
	});

	test.each([
		["invalid JSON", '{\n  "zebra": "Zebra",\n<<<<<<< HEAD\n}'],
		["duplicate keys", '{\n  "zebra": "Zebra",\n  "zebra": "Zebra"\n}'],
		["not an object", '["zebra"]'],
		["empty", ""],
	])("a previous file with %s", async (_, previous) => {
		const rows = await load({ "en.json": handWritten });
		setPattern(rows, "zebra", "en", [{ type: "text", value: "Zèbre" }]);
		expect(await save(rows, { "en.json": previous })).toStrictEqual(
			await save(rows)
		);
	});
});

// ----------------------------------------------------------------------------

/** The inverse of `parseName`. */
function nameOf(locale: string, namespace: string | undefined): string {
	return namespace === undefined ? `${locale}.json` : `${namespace}/${locale}`;
}

/** `{ "en.json": text }` or `{ "<namespace>/<locale>": text }` */
function parseName(name: string): { locale: string; namespace?: string } {
	const namespaced = name.match(/^(.+)\/(.+)$/);
	if (namespaced) return { namespace: namespaced[1]!, locale: namespaced[2]! };
	return { locale: name.replace(/\.json$/, "") };
}

function existingFiles(
	files: Files,
	pathPattern: string | Record<string, string>
): ExistingFile[] {
	return Object.entries(files).map(([name, text]) => {
		const { locale, namespace } = parseName(name);
		return {
			path:
				typeof pathPattern === "string"
					? pathPattern.replace("{locale}", locale)
					: pathPattern[namespace!]!.replace("{locale}", locale),
			locale,
			content: new TextEncoder().encode(text),
			...(namespace === undefined ? {} : { metadata: { namespace } }),
		};
	});
}

async function load(
	files: Files,
	pathPattern: string | Record<string, string> = "./{locale}.json"
): Promise<Rows> {
	const imported = await importFiles({
		settings: settings(pathPattern),
		files: existingFiles(files, pathPattern).map((file) => ({
			locale: file.locale,
			content: file.content,
			toBeImportedFilesMetadata: file.metadata,
		})),
	});
	// one message per bundle and locale, in the order of import, like the
	// database of a project
	const messages = [
		...new Map(
			imported.messages.map((message) => [
				`${message.bundleId}-${message.locale}`,
				{ ...message, id: `${message.bundleId}-${message.locale}` },
			])
		).values(),
	] as Message[];
	const variants = imported.variants.map((variant, index) => ({
		...variant,
		id: `variant-${index}`,
		messageId: messages.find(
			(message) =>
				message.bundleId === variant.messageBundleId &&
				message.locale === variant.messageLocale
		)!.id,
	})) as Variant[];
	return { bundles: imported.bundles as Bundle[], messages, variants };
}

/** Exports `rows`, with `files` as the previous files if given. */
async function save(
	rows: Rows,
	files?: Files,
	pathPattern: string | Record<string, string> = "./{locale}.json"
): Promise<Files> {
	const exported = await exportFiles({
		...structuredClone(rows),
		settings: settings(pathPattern),
		files: files === undefined ? undefined : existingFiles(files, pathPattern),
	});
	return Object.fromEntries(
		exported.map((file) => [
			nameOf(file.locale, file.metadata?.namespace),
			new TextDecoder("utf-8", { ignoreBOM: true }).decode(file.content),
		])
	);
}

function bytes(files: Files): Record<string, number[]> {
	return Object.fromEntries(
		Object.entries(files).map(([name, text]) => [
			name,
			[...new TextEncoder().encode(text)],
		])
	);
}

function variantsOf(rows: Rows, bundleId: string, locale: string): Variant[] {
	const message = rows.messages.find(
		(message) => message.bundleId === bundleId && message.locale === locale
	)!;
	return rows.variants.filter((variant) => variant.messageId === message.id);
}

function hasMatch(variant: Variant, key: string, value: string): boolean {
	return variant.matches.some(
		(match) =>
			match.type === "literal-match" &&
			match.key === key &&
			match.value === value
	);
}

function textOf(variant: Variant): string {
	return variant.pattern
		.map((part) => (part.type === "text" ? part.value : ""))
		.join("");
}

function variable(name: string): Pattern[number] {
	return { type: "expression", arg: { type: "variable-reference", name } };
}

function setPattern(
	rows: Rows,
	bundleId: string,
	locale: string,
	pattern: Pattern,
	which: (variant: Variant) => boolean = () => true
) {
	const variants = variantsOf(rows, bundleId, locale).filter(which);
	expect(variants).toHaveLength(1);
	variants[0]!.pattern = pattern;
}

function addMessage(
	rows: Rows,
	bundleId: string,
	locale: string,
	text: string
) {
	rows.bundles.push({ id: bundleId, declarations: [] });
	rows.messages.push({
		id: `${bundleId}-${locale}`,
		bundleId,
		locale,
		selectors: [],
	});
	rows.variants.push({
		id: `${bundleId}-${locale}-variant`,
		messageId: `${bundleId}-${locale}`,
		matches: [],
		pattern: [{ type: "text", value: text }],
	});
}

function removeBundle(rows: Rows, bundleId: string) {
	const messageIds = new Set(
		rows.messages
			.filter((message) => message.bundleId === bundleId)
			.map((message) => message.id)
	);
	rows.bundles = rows.bundles.filter((bundle) => bundle.id !== bundleId);
	rows.messages = rows.messages.filter(
		(message) => !messageIds.has(message.id)
	);
	rows.variants = rows.variants.filter(
		(variant) => !messageIds.has(variant.messageId)
	);
}

function renameBundle(rows: Rows, from: string, to: string) {
	for (const bundle of rows.bundles) if (bundle.id === from) bundle.id = to;
	for (const message of rows.messages) {
		if (message.bundleId === from) message.bundleId = to;
	}
}
