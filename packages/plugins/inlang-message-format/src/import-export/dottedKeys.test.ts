import { describe, expect, test } from "vitest";
import type { Bundle, Message, Variant } from "@inlang/sdk";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

/**
 * Keys with dots are nested on export and flattened on import. The
 * published plugin (4.4.5) nested them with `unflatten` of the `flat`
 * package, which also made arrays of number segments (`steps.0` ->
 * `"steps": ["…"]`) and split the keys of `match` at dots (`count=1.5` ->
 * `"count=1": [null, …, "…"]`). It couldn't read either back.
 */

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (content: Uint8Array) => new TextDecoder().decode(content);

type Imported = Awaited<ReturnType<typeof importFiles>>;
type Texts = Record<string, string>;

const toText = (json: unknown) =>
	typeof json === "string" ? json : JSON.stringify(json, undefined, "\t");

async function importTexts(texts: Record<string, unknown>) {
	return importFiles({
		settings: {} as any,
		files: Object.entries(texts).map(([locale, text]) => ({
			locale,
			content: encode(toText(text)),
		})),
	});
}

/** Rows with ids, like the SDK stores an import. */
function rowsOf(imported: Imported) {
	const bundles = new Map<string, Bundle>();
	for (const bundle of imported.bundles) {
		bundles.set(bundle.id!, bundle as Bundle);
	}
	const messages = new Map<string, Message>();
	for (const message of imported.messages) {
		const id = `${message.bundleId}/${message.locale}`;
		messages.set(id, { ...(message as Message), id });
	}
	const variants = imported.variants.map(
		(variant, index) =>
			({
				id: `variant_${index}`,
				messageId: `${variant.messageBundleId}/${variant.messageLocale}`,
				matches: variant.matches ?? [],
				pattern: variant.pattern ?? [],
			}) as Variant
	);
	return {
		bundles: [...bundles.values()],
		messages: [...messages.values()],
		variants,
	};
}

/** The messages of an import without ids, to compare two imports. */
function contentOf(imported: Imported) {
	const sort = <T>(items: T[]) =>
		items
			.map((item) => JSON.stringify(item))
			.sort()
			.map((item) => JSON.parse(item));
	return {
		bundles: sort(imported.bundles.map((b) => [b.id, b.declarations])),
		messages: sort(
			imported.messages.map((m) => [m.bundleId, m.locale, m.selectors])
		),
		variants: sort(
			imported.variants.map((v) => [
				v.messageBundleId,
				v.messageLocale,
				v.matches,
				v.pattern,
			])
		),
	};
}

async function exportTexts(
	rows: ReturnType<typeof rowsOf>,
	options: { files?: Texts; settings?: Record<string, unknown> } = {}
): Promise<Texts> {
	const files = await exportFiles({
		...rows,
		settings: (options.settings ?? {}) as any,
		files:
			options.files &&
			Object.entries(options.files).map(([locale, content]) => ({
				path: `./messages/${locale}.json`,
				locale,
				content: encode(content),
			})),
	});
	return Object.fromEntries(
		files.map((file) => [file.locale, decode(file.content)])
	);
}

/** The text of every variant of a message, by its matches. */
function textsOf(imported: Imported, bundleId: string, locale = "en") {
	return Object.fromEntries(
		imported.variants
			.filter(
				(variant) =>
					variant.messageBundleId === bundleId &&
					variant.messageLocale === locale
			)
			.map((variant) => [
				variant
					.matches!.map((match) =>
						match.type === "literal-match"
							? `${match.key}=${match.value}`
							: `${match.key}=*`
					)
					.join(", "),
				variant
					.pattern!.map((part) =>
						part.type === "text"
							? part.value
							: part.type === "expression" &&
								  part.arg.type === "variable-reference"
								? `{${part.arg.name}}`
								: "?"
					)
					.join(""),
			])
	);
}

/**
 * What the published plugin (4.4.5) wrote for the messages `hello`,
 * `onboarding.title`, `onboarding.steps.0`, `onboarding.steps.1`, `tip.0`
 * and the variants `rating=4.5` and `channel=v1.beta`.
 */
const writtenByPublishedPlugin = `{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"hello": "Hello",
	"onboarding": {
		"title": "Welcome",
		"steps": [
			"Create an account",
			"Verify your email"
		]
	},
	"tip": [
		"Only tip"
	],
	"rating": [
		{
			"declarations": [
				"input rating"
			],
			"selectors": [
				"rating"
			],
			"match": {
				"rating=4": [
					null,
					null,
					null,
					null,
					null,
					"Great"
				],
				"rating=*": "{rating} stars"
			}
		}
	],
	"release": [
		{
			"declarations": [
				"input channel"
			],
			"selectors": [
				"channel"
			],
			"match": {
				"channel=v1": {
					"beta": "Beta release"
				},
				"channel=*": "Stable release"
			}
		}
	]
}`;

describe("import of arrays and match objects the published plugin wrote", () => {
	test("an array of strings is the messages of number keys", async () => {
		const imported = await importTexts({ en: writtenByPublishedPlugin });
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
			"hello",
			"onboarding.title",
			"onboarding.steps.0",
			"onboarding.steps.1",
			"tip.0",
			"rating",
			"release",
		]);
		expect(textsOf(imported, "onboarding.steps.0")).toEqual({
			"": "Create an account",
		});
		expect(textsOf(imported, "onboarding.steps.1")).toEqual({
			"": "Verify your email",
		});
		expect(textsOf(imported, "tip.0")).toEqual({ "": "Only tip" });
	});

	test("an array is read like an object with number keys: holes are no messages, objects and arrays in it are nested", async () => {
		const imported = await importTexts({
			en: {
				sparse: [null, "Second"],
				items: [{ title: "First title", body: "First body" }],
				matrix: [["Zero zero"], [null, "One one"]],
				mixed: [
					"Plain",
					[
						{
							declarations: [
								"input count",
								"local countPlural = count: plural",
							],
							selectors: ["countPlural"],
							match: { "countPlural=one": "One", "countPlural=*": "Many" },
						},
					],
				],
			},
		});
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
			"sparse.1",
			"items.0.title",
			"items.0.body",
			"matrix.0.0",
			"matrix.1.1",
			"mixed.0",
			"mixed.1",
		]);
		expect(textsOf(imported, "items.0.body")).toEqual({ "": "First body" });
		expect(textsOf(imported, "matrix.1.1")).toEqual({ "": "One one" });
		expect(textsOf(imported, "mixed.1")).toEqual({
			"countPlural=one": "One",
			"countPlural=*": "Many",
		});
	});

	test("an object in an array with a key named like a part of a complex message is no complex message", async () => {
		// `items.0.match`, `items.0.title` and `steps.0.selectors`
		const imported = await importTexts({
			en: {
				items: [{ match: "Match!", title: "Title" }],
				steps: [{ selectors: "Selectors" }],
			},
		});
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
			"items.0.match",
			"items.0.title",
			"steps.0.selectors",
		]);
		expect(textsOf(imported, "items.0.match")).toEqual({ "": "Match!" });
		expect(textsOf(imported, "steps.0.selectors")).toEqual({
			"": "Selectors",
		});
	});

	test("a complex message, an array with one object, is one message as before", async () => {
		const imported = await importTexts({
			en: {
				count: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: { "countPlural=one": "One", "countPlural=*": "Many" },
					},
				],
				legacy: [{ selectors: [], match: ["Legacy text"] }],
			},
		});
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
			"count",
			"legacy",
		]);
		expect(textsOf(imported, "count")).toEqual({
			"countPlural=one": "One",
			"countPlural=*": "Many",
		});
		expect(textsOf(imported, "legacy")).toEqual({ "": "Legacy text" });
	});

	test("a variant that was split at a dot of its match is read with the dot", async () => {
		const imported = await importTexts({ en: writtenByPublishedPlugin });
		expect(textsOf(imported, "rating")).toEqual({
			"rating=4.5": "Great",
			"rating=*": "{rating} stars",
		});
		expect(textsOf(imported, "release")).toEqual({
			"channel=v1.beta": "Beta release",
			"channel=*": "Stable release",
		});
	});

	test("the file stays byte-identical when it is exported with it", async () => {
		const files = { en: writtenByPublishedPlugin };
		const rows = rowsOf(await importTexts(files));
		// the full export writes objects and the keys of the variants
		const whole = await exportTexts(rows);
		expect(whole.en).not.toBe(files.en);
		expect(await exportTexts(rows, { files })).toEqual(files);
	});

	test("an edit rewrites only the edited entry", async () => {
		const files = { en: writtenByPublishedPlugin };
		const rows = rowsOf(await importTexts(files));
		const variant = rows.variants.find(
			(variant) => variant.messageId === "onboarding.steps.1/en"
		)!;
		variant.pattern = [{ type: "text", value: "Check your inbox" }];
		const exported = await exportTexts(rows, { files });
		expect(exported.en).toBe(
			files.en.replace(
				`"steps": [
			"Create an account",
			"Verify your email"
		]`,
				`"steps": {
			"0": "Create an account",
			"1": "Check your inbox"
		}`
			)
		);
	});

	test("an edited variant rewrites its message with the dot in the key", async () => {
		const files = { en: writtenByPublishedPlugin };
		const rows = rowsOf(await importTexts(files));
		const variant = rows.variants.find(
			(variant) =>
				variant.messageId === "rating/en" &&
				variant.matches[0]?.type === "catchall-match"
		)!;
		variant.pattern = [{ type: "text", value: "Rated" }];
		const exported = JSON.parse((await exportTexts(rows, { files })).en!);
		expect(exported.rating[0].match).toEqual({
			"rating=4.5": "Great",
			"rating=*": "Rated",
		});
		expect(exported.onboarding.steps).toEqual([
			"Create an account",
			"Verify your email",
		]);
	});
});

describe("a complex message next to a key that starts with its key", () => {
	// What the published plugin wrote for `items.title` before the plural
	// `items`: `unflatten` put the complex message into the object of
	// `items.title` under the key "0". In German, a plain string next to the
	// English plural, it is the complex form with `selectors: []`. The
	// published plugin read it as other messages (`items.0.match.…`)
	// without `items`, and failed on `selectors: []`.
	const files = {
		en: `{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"items": {
		"0": {
			"declarations": [
				"input count",
				"local countPlural = count: plural"
			],
			"selectors": [
				"countPlural"
			],
			"match": {
				"countPlural=one": "One item",
				"countPlural=*": "{count} items"
			}
		},
		"title": "Items"
	}
}`,
		de: `{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"items": {
		"0": {
			"declarations": [
				"input count",
				"local countPlural = count: plural"
			],
			"selectors": [],
			"match": [
				"Artikel"
			]
		},
		"title": "Artikel"
	}
}`,
	};

	test("is read as the message of its key", async () => {
		const imported = await importTexts(files);
		expect(
			[...new Set(imported.bundles.map((bundle) => bundle.id))].sort()
		).toEqual(["items", "items.title"]);
		expect(textsOf(imported, "items")).toEqual({
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		});
		expect(textsOf(imported, "items", "de")).toEqual({ "": "Artikel" });
		expect(textsOf(imported, "items.title", "de")).toEqual({
			"": "Artikel",
		});
	});

	test("stays byte-identical when exported with the files, and is written in the current form in full", async () => {
		const rows = rowsOf(await importTexts(files));
		expect(await exportTexts(rows, { files })).toEqual(files);
		const whole = await exportTexts(rows);
		expect(JSON.parse(whole.en!)).toEqual({
			$schema: "https://inlang.com/schema/inlang-message-format",
			items: [
				{
					declarations: ["input count", "local countPlural = count: plural"],
					selectors: ["countPlural"],
					match: {
						"countPlural=one": "One item",
						"countPlural=*": "{count} items",
					},
				},
			],
			"items.title": "Items",
		});
		expect(JSON.parse(whole.de!)).toEqual({
			$schema: "https://inlang.com/schema/inlang-message-format",
			items: "Artikel",
			"items.title": "Artikel",
		});
		expect(contentOf(await importTexts(whole))).toEqual(
			contentOf(await importTexts(files))
		);
	});

	test("an edit is not lost", async () => {
		const rows = rowsOf(await importTexts(files));
		rows.variants.find(
			(variant) => variant.messageId === "items.title/en"
		)!.pattern = [{ type: "text", value: "Products" }];
		rows.variants.find((variant) => variant.messageId === "items/de")!.pattern =
			[{ type: "text", value: "Produkte" }];
		const exported = await exportTexts(rows, { files });
		// the edited files are written in full, the old text is gone
		expect(exported.en).not.toContain('"title"');
		expect(exported.de).not.toContain('"title"');
		expect(exported.de).toContain('"items.title": "Artikel"');
		const reimported = await importTexts(exported);
		expect(textsOf(reimported, "items.title")).toEqual({ "": "Products" });
		expect(textsOf(reimported, "items", "de")).toEqual({ "": "Produkte" });
		expect(textsOf(reimported, "items")).toEqual({
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		});
	});
});

describe("keys after a complex message that start with its key", () => {
	const plural = {
		declarations: ["input count", "local countPlural = count: plural"],
		selectors: ["countPlural"],
		match: {
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		},
	};
	// as the published plugin wrote them (`JSON.stringify` with tabs)
	const file = (items: unknown) =>
		JSON.stringify(
			{ $schema: "https://inlang.com/schema/inlang-message-format", items },
			undefined,
			"\t"
		);

	test.each([
		[
			// `items.title`, the plural `items`, `items.0.note`
			"in the object of a key before it",
			file({ "0": { ...plural, note: "Note" }, title: "Title" }),
			["items", "items.0.note", "items.title"],
		],
		[
			// the plural `items`, `items.0.note`, `items.1.note`
			"in the array of the complex message",
			file([{ ...plural, note: "Note" }, { note: "Second" }]),
			["items", "items.0.note", "items.1.note"],
		],
	])("%s are read as their messages", async (_, en, ids) => {
		const files = { en };
		const imported = await importTexts(files);
		expect(imported.bundles.map((bundle) => bundle.id).sort()).toEqual(ids);
		expect(textsOf(imported, "items")).toEqual({
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		});
		expect(textsOf(imported, "items.0.note")).toEqual({ "": "Note" });
		// byte-identical with the files
		const rows = rowsOf(imported);
		expect(await exportTexts(rows, { files })).toEqual(files);
		// an edit is written, and nothing is lost
		rows.variants.find(
			(variant) => variant.messageId === "items.0.note/en"
		)!.pattern = [{ type: "text", value: "Edited" }];
		const exported = await exportTexts(rows, { files });
		const reimported = await importTexts(exported);
		expect(contentOf(reimported).bundles).toEqual(contentOf(imported).bundles);
		expect(textsOf(reimported, "items.0.note")).toEqual({ "": "Edited" });
		expect(textsOf(reimported, "items")).toEqual(textsOf(imported, "items"));
		expect(exported.en).not.toContain('"Note"');
	});

	const nPlural = {
		declarations: ["input n"],
		selectors: ["n"],
		match: { "n=1": "one", "n=*": "many" },
	};
	test.each([
		// the plural `items`, the plural `items.0`
		[
			"in the object of the complex message",
			file([{ "0": nPlural, ...plural }]),
			["items", "items.0"],
		],
		// `items.title`, the plural `items`, the plural `items.0`
		[
			"in the object of the complex message in the object of a key before it",
			file({ "0": { "0": nPlural, ...plural }, title: "T" }),
			["items", "items.0", "items.title"],
		],
	])("a complex message %s is read as its message", async (_, en, ids) => {
		const files = { en };
		const imported = await importTexts(files);
		expect(imported.bundles.map((bundle) => bundle.id).sort()).toEqual(ids);
		expect(textsOf(imported, "items")).toEqual({
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		});
		expect(textsOf(imported, "items.0")).toEqual({
			"n=1": "one",
			"n=*": "many",
		});
		expect(await exportTexts(rowsOf(imported), { files })).toEqual(files);
	});

	test.each([
		["description", "A description"],
		["$comment", "A comment"],
		["deprecated", true],
		["maxLength", 40],
		["description", null],
		["meta", {}],
		["meta", { owner: "team" }],
		["tags", []],
		["tags", ["a", "b"]],
	])(
		"other keys in a complex message are ignored as before: %s: %j",
		async (key, value) => {
			const files = { en: file([{ ...plural, [key]: value }]) };
			const imported = await importTexts(files);
			expect(contentOf(imported)).toEqual(
				contentOf(await importTexts({ en: file([plural]) }))
			);
			expect(await exportTexts(rowsOf(imported), { files })).toEqual(files);
		}
	);

	test("in the shapes the published plugin wrote, keys that are no message are ignored", async () => {
		const files = {
			en: file({
				"0": { ...plural, note: "Note", deprecated: true, meta: {}, tags: [] },
				title: "Title",
			}),
		};
		const imported = await importTexts(files);
		expect(imported.bundles.map((bundle) => bundle.id).sort()).toEqual([
			"items",
			"items.0.note",
			"items.title",
		]);
		expect(await exportTexts(rowsOf(imported), { files })).toEqual(files);
	});

	test("a second complex message object in the array is ignored as before", async () => {
		const imported = await importTexts({
			en: {
				items: [plural, { ...plural, match: { "countPlural=*": "Other" } }],
			},
		});
		expect(imported.bundles.map((bundle) => bundle.id)).toEqual(["items"]);
		expect(textsOf(imported, "items")).toEqual({
			"countPlural=one": "One item",
			"countPlural=*": "{count} items",
		});
	});
});

test("a value that is no message is an error that names its key", async () => {
	await expect(importTexts({ en: { a: { b: [] } } })).rejects.toThrow(/"a\.b"/);
	await expect(importTexts({ en: { a: 5 } })).rejects.toThrow(/"a"/);
});

describe("export of keys with dots", () => {
	test("number segments are object keys, not arrays", async () => {
		const imported = await importTexts({ en: writtenByPublishedPlugin });
		const exported = JSON.parse((await exportTexts(rowsOf(imported))).en!);
		expect(exported.onboarding).toEqual({
			title: "Welcome",
			steps: { "0": "Create an account", "1": "Verify your email" },
		});
		expect(exported.tip).toEqual({ "0": "Only tip" });
	});

	test("the keys of variants are not split at dots", async () => {
		const imported = await importTexts({ en: writtenByPublishedPlugin });
		const exported = JSON.parse((await exportTexts(rowsOf(imported))).en!);
		expect(exported.rating[0].match).toEqual({
			"rating=4.5": "Great",
			"rating=*": "{rating} stars",
		});
		expect(exported.release[0].match).toEqual({
			"channel=v1.beta": "Beta release",
			"channel=*": "Stable release",
		});
	});

	test("keys with dots are nested as before", async () => {
		const imported = await importTexts({
			en: { "nav.home": "Home", "nav.about.title": "About", plain: "Plain" },
		});
		expect(JSON.parse((await exportTexts(rowsOf(imported))).en!)).toEqual({
			$schema: "https://inlang.com/schema/inlang-message-format",
			nav: { home: "Home", about: { title: "About" } },
			plain: "Plain",
		});
	});

	test("a key whose path is another message is written flat, no message is lost", async () => {
		const en = {
			a: "A",
			"a.b": "A B",
			"x.y": "X Y",
			x: "X",
			nav: { home: "Home", "home.title": "Home title" },
			"nav.home.title.short": "Short",
		};
		const imported = await importTexts({ en });
		const exported = (await exportTexts(rowsOf(imported))).en!;
		expect(JSON.parse(exported)).toEqual({
			$schema: "https://inlang.com/schema/inlang-message-format",
			a: "A",
			"a.b": "A B",
			"x.y": "X Y",
			x: "X",
			nav: {
				home: "Home",
				"home.title": "Home title",
				"home.title.short": "Short",
			},
		});
		expect(contentOf(await importTexts({ en: exported }))).toEqual(
			contentOf(imported)
		);
	});

	test("a file with flat keys keeps them, also for a key whose path is another message", async () => {
		const files = {
			en: `{
	"nav.home": "Home",
	"nav.home.title": "Home title",
	"a": "A",
	"a.b": "A B"
}`,
		};
		const rows = rowsOf(await importTexts(files));
		expect(await exportTexts(rows, { files })).toEqual(files);
		rows.variants.find(
			(variant) => variant.messageId === "nav.home.title/en"
		)!.pattern = [{ type: "text", value: "Start" }];
		rows.variants.find((variant) => variant.messageId === "a.b/en")!.pattern = [
			{ type: "text", value: "B" },
		];
		expect(await exportTexts(rows, { files })).toEqual({
			en: files.en.replace('"Home title"', '"Start"').replace('"A B"', '"B"'),
		});
	});

	test("a flat key is kept when another locale writes it differently", async () => {
		// en nests `a.b` (it has no message `a`), de writes it flat
		const files = {
			en: `{
	"a.b": "A B",
	"c": "C"
}`,
			de: `{
	"a": "A",
	"a.b": "A B"
}`,
		};
		const rows = rowsOf(await importTexts(files));
		expect(await exportTexts(rows, { files })).toEqual(files);
		rows.variants.find((variant) => variant.messageId === "a.b/en")!.pattern = [
			{ type: "text", value: "B" },
		];
		expect(await exportTexts(rows, { files })).toEqual({
			...files,
			en: files.en.replace('"A B"', '"B"'),
		});
	});

	test.each([
		["trailing dot", "a."],
		["leading dot", ".a"],
		["two dots", "a..b"],
		["number segments", "list.10.2"],
		["exponent", "list.1e3"],
		["negative number", "list.-1"],
		["__proto__", "__proto__"],
		["__proto__ segment", "x.__proto__.y"],
	])("a key with %s round-trips", async (_, key) => {
		const rows = rowsOf(await importTexts({ en: { other: "Other" } }));
		rows.bundles.push({ id: key, declarations: [] });
		rows.messages.push({
			id: `${key}/en`,
			bundleId: key,
			locale: "en",
			selectors: [],
		});
		rows.variants.push({
			id: "added",
			messageId: `${key}/en`,
			matches: [],
			pattern: [{ type: "text", value: "Value" }],
		});
		const exported = await exportTexts(rows);
		const reimported = await importTexts(exported);
		expect(reimported.bundles.map((bundle) => bundle.id).sort()).toEqual(
			["other", key].sort()
		);
		expect(textsOf(reimported, key)).toEqual({ "": "Value" });
		expect(await exportTexts(rowsOf(reimported))).toEqual(exported);
	});

	test("import -> export -> import is identical, and exports are stable", async () => {
		const en = {
			hello: "Hello",
			"nav.home": "Home",
			"onboarding.steps.0": "Create an account",
			"onboarding.steps.1": "Verify your email",
			a: "A",
			"a.b": "A B",
			rating: [
				{
					declarations: ["input rating"],
					selectors: ["rating"],
					match: {
						"rating=4.5": "Great",
						"rating=1.05": "Bad",
						"rating=*": "{rating} stars",
					},
				},
			],
			release: [
				{
					declarations: ["input channel", "input region"],
					selectors: ["channel", "region"],
					match: {
						"channel=v1.beta, region=eu.west": "Beta in the west",
						"channel=v1.beta, region=*": "Beta",
						"channel=*, region=*": "Stable",
					},
				},
			],
		};
		const imported = await importTexts({ en, de: en });
		const first = await exportTexts(rowsOf(imported));
		const reimported = await importTexts(first);
		expect(contentOf(reimported)).toEqual(contentOf(imported));
		const second = await exportTexts(rowsOf(reimported));
		expect(second).toEqual(first);
		// and exported with the files, nothing changes
		expect(await exportTexts(rowsOf(reimported), { files: first })).toEqual(
			first
		);
	});
});
