import { describe, expect, test } from "vitest";
import type { Bundle, Message, Variant } from "@inlang/sdk";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

/**
 * A message can be a plural or select in one locale and a plain string in
 * another. Declarations are shared by the bundle, the form is per locale.
 * Importing and exporting unchanged files must not change a byte.
 */

const file = (messages: Record<string, unknown>) =>
	JSON.stringify(
		{
			$schema: "https://inlang.com/schema/inlang-message-format",
			...messages,
		},
		undefined,
		"\t"
	);

const plural = {
	declarations: ["input count", "local countPlural = count: plural"],
	selectors: ["countPlural"],
	match: {
		"countPlural=one": "One file deleted",
		"countPlural=*": "{count} files deleted",
	},
};

const cases: Array<{ name: string; files: Record<string, string> }> = [
	{
		name: "a plain string with a placeholder next to a plural",
		files: {
			en: file({ hello: "Hello", files_deleted: [plural] }),
			de: file({ hello: "Hallo", files_deleted: "{count} Dateien gelöscht" }),
		},
	},
	{
		name: "a plain string without a placeholder next to a plural",
		files: {
			en: file({ files_deleted: [plural] }),
			ja: file({ files_deleted: "ファイルを削除しました" }),
		},
	},
	{
		name: "a plain string first, the plural in a later file",
		files: {
			de: file({ files_deleted: "{count} Dateien gelöscht" }),
			en: file({ files_deleted: [plural] }),
		},
	},
	{
		name: "two plain strings next to a plural",
		files: {
			en: file({ files_deleted: [plural] }),
			de: file({ files_deleted: "{count} Dateien gelöscht" }),
			fr: file({ files_deleted: "{count} fichiers supprimés" }),
		},
	},
	{
		// as the published 4.4.5 plugin wrote a plain string next to a plural
		name: "the complex form without selectors next to a plural",
		files: {
			en: file({ files_deleted: [plural] }),
			de: file({
				files_deleted: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: [],
						match: { "count=*": "{count} Dateien gelöscht" },
					},
				],
			}),
		},
	},
	{
		// as the published 4.4.5 plugin wrote the form above on the next export
		name: "the complex form with a catch-all selector next to a plural",
		files: {
			en: file({ files_deleted: [plural] }),
			de: file({
				files_deleted: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["count"],
						match: { "count=*": "{count} Dateien gelöscht" },
					},
				],
			}),
		},
	},
	{
		name: "a plain string that uses a local of another locale",
		files: {
			en: file({
				total: [
					{
						declarations: [
							"input amount",
							"local formattedAmount = amount: number style=currency",
						],
						selectors: ["formattedAmount"],
						match: { "formattedAmount=*": "Total: {formattedAmount}" },
					},
				],
			}),
			de: file({ total: "Summe: {formattedAmount}" }),
		},
	},
	{
		name: "plain strings only",
		files: {
			en: file({ greeting: "Hello {name}" }),
			de: file({ greeting: "Hallo {name}" }),
		},
	},
	{
		name: "plurals only, with a plural category only some locales have",
		files: {
			en: file({ files_deleted: [plural] }),
			fr: file({
				files_deleted: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "{count} fichier supprimé",
							"countPlural=many": "{count} de fichiers supprimés",
							"countPlural=*": "{count} fichiers supprimés",
						},
					},
				],
			}),
		},
	},
];

describe("import and export of unchanged files changes no byte", () => {
	test.each(cases)("$name", async ({ files }) => {
		expect(await roundtrip(files)).toStrictEqual(files);
		// and stays so
		expect(await roundtrip(await roundtrip(files))).toStrictEqual(files);
	});
});

test("a plain string doesn't add an input for a placeholder that is a local of another locale", async () => {
	const imported = await runImport({
		de: file({ total: "Summe: {formattedAmount}" }),
		en: file({
			total: [
				{
					declarations: [
						"input amount",
						"local formattedAmount = amount: number style=currency",
					],
					selectors: [],
					match: { "formattedAmount=*": "Total: {formattedAmount}" },
				},
			],
		}),
	});
	expect(
		(imported.bundles[0]!.declarations ?? []).map((d) => `${d.type} ${d.name}`)
	).toStrictEqual(["input-variable amount", "local-variable formattedAmount"]);
});

test("a complex form that lists its selectors doesn't gain a selector that only matches *", async () => {
	const imported = await runImport({
		en: file({
			m: [
				{
					declarations: ["input count"],
					selectors: [],
					match: { "count=*": "{count} files" },
				},
			],
		}),
	});
	expect(imported.messages[0]!.selectors).toStrictEqual([]);
	expect(imported.variants[0]!.matches).toStrictEqual([
		{ type: "catchall-match", key: "count" },
	]);
});

test("a key that selects a value is a selector, also if the file doesn't list it", async () => {
	const imported = await runImport({
		en: file({
			m: [
				{
					declarations: ["input gender"],
					selectors: [],
					match: { "gender=female": "She", "gender=*": "They" },
				},
			],
		}),
	});
	expect(imported.messages[0]!.selectors).toStrictEqual([
		{ type: "variable-reference", name: "gender" },
	]);
});

test("without a selectors list, every key of the match is a selector as before", async () => {
	const imported = await runImport({
		en: file({
			m: [
				{
					declarations: ["input amount", "local formatted = amount: number"],
					match: { "formatted=*": "{formatted}" },
				},
			],
		}),
	});
	expect(imported.messages[0]!.selectors).toStrictEqual([
		{ type: "variable-reference", name: "formatted" },
	]);
});

test("the complex form without selectors and placeholders, which the published plugin wrote for a plain string next to a plural, is written as the plain string", async () => {
	const files = {
		en: file({ files_deleted: [plural] }),
		ja: file({
			files_deleted: [
				{
					declarations: ["input count", "local countPlural = count: plural"],
					selectors: [],
					match: ["ファイルを削除しました"],
				},
			],
		}),
	};
	expect(await roundtrip(files)).toStrictEqual({
		...files,
		ja: file({ files_deleted: "ファイルを削除しました" }),
	});
});

test("a message without selectors keeps the complex form if no locale has a plural or select to carry the local declarations", async () => {
	const files = {
		en: file({
			price: [
				{
					declarations: [
						"input amount",
						"local formattedAmount = amount: number style=currency",
					],
					selectors: [],
					match: { "formattedAmount=*": "Total: {formattedAmount}" },
				},
			],
		}),
		de: file({
			price: [
				{
					declarations: [
						"input amount",
						"local formattedAmount = amount: number style=currency",
					],
					selectors: [],
					match: { "formattedAmount=*": "Summe: {formattedAmount}" },
				},
			],
		}),
	};
	expect(await roundtrip(files)).toStrictEqual(files);

	// also if the database has no matches, e.g. created by an editor
	const imported = await runImport(files);
	for (const variant of imported.variants) variant.matches = [];
	for (const message of imported.messages) message.selectors = [];
	expect(await runExport(imported)).toStrictEqual(files);
});

test("a plain string of a database message next to a plural is written as a plain string", async () => {
	const bundle: Bundle = {
		id: "files_deleted",
		declarations: [
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
		],
	};
	const messages: Message[] = [
		{
			id: "en",
			bundleId: bundle.id,
			locale: "en",
			selectors: [{ type: "variable-reference", name: "countPlural" }],
		},
		{ id: "de", bundleId: bundle.id, locale: "de", selectors: [] },
	];
	const variants: Variant[] = [
		{
			id: "en-one",
			messageId: "en",
			matches: [{ type: "literal-match", key: "countPlural", value: "one" }],
			pattern: [{ type: "text", value: "One file deleted" }],
		},
		{
			id: "en-other",
			messageId: "en",
			matches: [{ type: "catchall-match", key: "countPlural" }],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
				},
				{ type: "text", value: " files deleted" },
			],
		},
		{
			id: "de",
			messageId: "de",
			matches: [],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
				},
				{ type: "text", value: " Dateien gelöscht" },
			],
		},
	];
	const exported = await exportFiles({
		settings: {} as any,
		bundles: [bundle],
		messages,
		variants,
	});
	const de = exported.find((f) => f.locale === "de")!;
	expect(new TextDecoder().decode(de.content)).toBe(
		file({ files_deleted: "{count} Dateien gelöscht" })
	);
});

type Imported = Awaited<ReturnType<typeof importFiles>>;

function runImport(files: Record<string, string>) {
	return importFiles({
		settings: {} as any,
		files: Object.entries(files).map(([locale, content]) => ({
			locale,
			content: new TextEncoder().encode(content),
		})),
	});
}

async function runExport(imported: Imported): Promise<Record<string, string>> {
	const messages = imported.messages.map((message) => ({
		...message,
		id: `${message.bundleId}/${message.locale}`,
	})) as Message[];
	const variants = imported.variants.map((variant, index) => ({
		...variant,
		id: `variant-${index}`,
		messageId: `${variant.messageBundleId}/${variant.messageLocale}`,
	})) as unknown as Variant[];
	const exported = await exportFiles({
		settings: {} as any,
		bundles: imported.bundles as Bundle[],
		messages,
		variants,
	});
	return Object.fromEntries(
		exported.map((f) => [f.locale, new TextDecoder().decode(f.content)])
	);
}

async function roundtrip(files: Record<string, string>) {
	return runExport(await runImport(files));
}
