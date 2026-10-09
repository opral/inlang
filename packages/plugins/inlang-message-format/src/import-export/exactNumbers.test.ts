import { expect, test } from "vitest";
import type { Bundle, Declaration, Message, Variant } from "@inlang/sdk";
import icuPlugin from "@inlang/plugin-icu1";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

// `{count, plural, =0 {…} one {…} other {…}}` as `@inlang/plugin-icu1` imports
// it and editors create it (`addExactNumber`): an un-annotated local alias for
// the exact number before the plural of the same input.
// https://github.com/opral/inlang-fink/issues/83
const exactPluralFile = {
	$schema: "https://inlang.com/schema/inlang-message-format",
	items: [
		{
			declarations: [
				"input count",
				"local countPluralExact = count",
				"local countPlural = count: plural",
			],
			selectors: ["countPluralExact", "countPlural"],
			match: {
				"countPlural=*, countPluralExact=0": "No items",
				"countPlural=one, countPluralExact=*": "One item",
				"countPlural=*, countPluralExact=*": "{count} items",
			},
		},
	],
};

const exactPluralDeclarations: Declaration[] = [
	{ type: "input-variable", name: "count" },
	{
		type: "local-variable",
		name: "countPluralExact",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
	},
	{
		type: "local-variable",
		name: "countPlural",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "plural", options: [] },
		},
	},
];

test("imports an un-annotated local alias and the exact-number + plural pair", async () => {
	const imported = await runImport({ en: exactPluralFile });

	expect(imported.bundles).toStrictEqual([
		{ id: "items", declarations: exactPluralDeclarations },
	]);
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "countPluralExact" },
		{ type: "variable-reference", name: "countPlural" },
	]);
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "catchall-match", key: "countPlural" },
			{ type: "literal-match", key: "countPluralExact", value: "0" },
		],
		[
			{ type: "literal-match", key: "countPlural", value: "one" },
			{ type: "catchall-match", key: "countPluralExact" },
		],
		[
			{ type: "catchall-match", key: "countPlural" },
			{ type: "catchall-match", key: "countPluralExact" },
		],
	]);
});

test("an un-annotated local alias declares the input it reads", async () => {
	const imported = await runImport({
		en: {
			items: [
				{
					declarations: [
						"local countPluralExact = count",
						"local countPlural = count: plural",
					],
					selectors: ["countPluralExact", "countPlural"],
					match: {
						"countPlural=*, countPluralExact=0": "No items",
						"countPlural=*, countPluralExact=*": "{count} items",
					},
				},
			],
		},
	});

	expect(imported.bundles[0]?.declarations).toContainEqual({
		type: "input-variable",
		name: "count",
	});
	expect(imported.bundles[0]?.declarations).toContainEqual(
		exactPluralDeclarations[1]
	);
});

test("exports the exact-number selector directly before its plural", async () => {
	const exported = await runExport({
		bundles: [{ id: "items", declarations: exactPluralDeclarations }],
		messages: [
			{
				id: "items-en",
				bundleId: "items",
				locale: "en",
				selectors: [
					{ type: "variable-reference", name: "countPluralExact" },
					{ type: "variable-reference", name: "countPlural" },
				],
			},
		],
		variants: [
			variant(
				"items-en",
				{ countPluralExact: "0", countPlural: "*" },
				"No items"
			),
			variant(
				"items-en",
				{ countPluralExact: "*", countPlural: "one" },
				"One item"
			),
			variant(
				"items-en",
				{ countPluralExact: "*", countPlural: "*" },
				"Some items"
			),
		],
	});

	expect(exported.en.items).toStrictEqual([
		{
			declarations: [
				"input count",
				"local countPluralExact = count",
				"local countPlural = count: plural",
			],
			// not alphabetical: the exact number must come first, see
			// orderSelectors in exportFiles.ts
			selectors: ["countPluralExact", "countPlural"],
			match: {
				"countPlural=*, countPluralExact=0": "No items",
				"countPlural=one, countPluralExact=*": "One item",
				"countPlural=*, countPluralExact=*": "Some items",
			},
		},
	]);
});

test("other selectors stay alphabetical around an exact-number pair", async () => {
	const exported = await runExport({
		bundles: [
			{
				id: "items",
				declarations: [
					{ type: "input-variable", name: "gender" },
					...exactPluralDeclarations,
				],
			},
		],
		messages: [
			{
				id: "items-en",
				bundleId: "items",
				locale: "en",
				selectors: [
					{ type: "variable-reference", name: "gender" },
					{ type: "variable-reference", name: "countPluralExact" },
					{ type: "variable-reference", name: "countPlural" },
				],
			},
		],
		variants: [
			variant(
				"items-en",
				{ gender: "*", countPluralExact: "*", countPlural: "*" },
				"Items"
			),
		],
	});

	expect(exported.en.items[0].selectors).toStrictEqual([
		"countPluralExact",
		"countPlural",
		"gender",
	]);
});

test("repairs a plural written before its exact number (sorted by earlier versions)", async () => {
	const imported = await runImport({
		en: {
			items: [
				{
					...exactPluralFile.items[0]!,
					selectors: ["countPlural", "countPluralExact"],
				},
			],
		},
	});
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "countPluralExact" },
		{ type: "variable-reference", name: "countPlural" },
	]);

	const exported = await runExport({
		bundles: [{ id: "items", declarations: exactPluralDeclarations }],
		messages: [
			{
				id: "items-en",
				bundleId: "items",
				locale: "en",
				selectors: [
					{ type: "variable-reference", name: "countPlural" },
					{ type: "variable-reference", name: "countPluralExact" },
				],
			},
		],
		variants: [
			variant("items-en", { countPluralExact: "*", countPlural: "*" }, "Items"),
		],
	});
	expect(exported.en.items[0].selectors).toStrictEqual([
		"countPluralExact",
		"countPlural",
	]);
});

test("an exact number already before its plural keeps its place on import", async () => {
	const exported = await runExport({
		bundles: [
			{
				id: "items",
				declarations: [
					{ type: "input-variable", name: "gender" },
					...exactPluralDeclarations,
				],
			},
		],
		messages: [
			{
				id: "items-en",
				bundleId: "items",
				locale: "en",
				selectors: [
					{ type: "variable-reference", name: "countPluralExact" },
					{ type: "variable-reference", name: "gender" },
					{ type: "variable-reference", name: "countPlural" },
				],
			},
		],
		variants: [
			variant(
				"items-en",
				{ gender: "*", countPluralExact: "*", countPlural: "*" },
				"Items"
			),
		],
	});
	// export: alphabetical, with the exact number moved before its plural
	expect(exported.en.items[0].selectors).toStrictEqual([
		"countPluralExact",
		"countPlural",
		"gender",
	]);
	// import: a file that already has the exact number first stays as is
	const reimported = await runImport({
		en: {
			items: [
				{
					...exported.en.items[0],
					selectors: ["countPluralExact", "gender", "countPlural"],
				},
			],
		},
	});
	expect(
		reimported.messages[0]?.selectors?.map((selector) => selector.name)
	).toStrictEqual(["countPluralExact", "gender", "countPlural"]);
});

test("two plurals on the same input each get their own exact number", async () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "count" },
		...["countPlural", "countPlural1"].flatMap((plural): Declaration[] => [
			{
				type: "local-variable",
				name: `${plural}Exact`,
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
				},
			},
			{
				type: "local-variable",
				name: plural,
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
		]),
	];
	const exported = await runExport({
		bundles: [{ id: "things", declarations }],
		messages: [
			{
				id: "things-fr",
				bundleId: "things",
				locale: "fr",
				selectors: [
					"countPluralExact",
					"countPlural",
					"countPlural1Exact",
					"countPlural1",
				].map((name) => ({ type: "variable-reference", name })),
			},
		],
		variants: [
			variant(
				"things-fr",
				{
					countPluralExact: "*",
					countPlural: "*",
					countPlural1Exact: "*",
					countPlural1: "*",
				},
				"{count} choses"
			),
		],
	});
	// alphabetical would be countPlural, countPlural1, countPlural1Exact,
	// countPluralExact; each exact number moves before its own plural
	expect(exported.fr.things[0].selectors).toStrictEqual([
		"countPluralExact",
		"countPlural",
		"countPlural1Exact",
		"countPlural1",
	]);
	const reimported = await runImport(exported);
	expect(
		reimported.messages[0]?.selectors?.map((selector) => selector.name)
	).toStrictEqual([
		"countPluralExact",
		"countPlural",
		"countPlural1Exact",
		"countPlural1",
	]);
});

test("the input itself pairs with its plural as exact-number selector", async () => {
	const exported = await runExport({
		bundles: [
			{
				id: "items",
				declarations: [
					{ type: "input-variable", name: "count" },
					exactPluralDeclarations[2]!,
				],
			},
		],
		messages: [
			{
				id: "items-en",
				bundleId: "items",
				locale: "en",
				selectors: [
					{ type: "variable-reference", name: "countPlural" },
					{ type: "variable-reference", name: "count" },
				],
			},
		],
		variants: [
			variant("items-en", { count: "0", countPlural: "*" }, "No items"),
			variant("items-en", { count: "*", countPlural: "*" }, "Items"),
		],
	});
	expect(exported.en.items[0].selectors).toStrictEqual([
		"count",
		"countPlural",
	]);
});

test("the exact-number + plural pair round-trips losslessly", async () => {
	const files = {
		en: exactPluralFile,
		fr: {
			$schema: "https://inlang.com/schema/inlang-message-format",
			items: [
				{
					...exactPluralFile.items[0]!,
					match: {
						"countPlural=*, countPluralExact=0": "Aucun article",
						"countPlural=one, countPluralExact=*": "{count} article",
						"countPlural=*, countPluralExact=*": "{count} articles",
					},
				},
			],
		},
	};

	const imported = await runImport(files);
	const exported = await runExport(withIds(imported));
	expect(exported).toStrictEqual(files);

	const reimported = await runImport(exported);
	expect(reimported).toStrictEqual(imported);
});

test("literal local declarations round-trip", async () => {
	const file = {
		$schema: "https://inlang.com/schema/inlang-message-format",
		greeting: [
			{
				declarations: [
					'local salutation = "Dear \\"friend\\" \\\\o/"',
					"local salutationAlias = salutation",
				],
				selectors: [],
				match: { "": "{salutationAlias}" },
			},
		],
	};

	const imported = await runImport({ en: file });
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{
			type: "local-variable",
			name: "salutation",
			value: {
				type: "expression",
				arg: { type: "literal", value: 'Dear "friend" \\o/' },
			},
		},
		{
			type: "local-variable",
			name: "salutationAlias",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "salutation" },
			},
		},
	]);
	const exported = await runExport(withIds(imported));
	expect(exported.en.greeting[0].declarations).toStrictEqual(
		file.greeting[0]!.declarations
	);
});

test("rejects a local declaration it cannot parse instead of crashing", async () => {
	await expect(
		runImport({
			en: {
				items: [
					{
						declarations: ["local = count"],
						selectors: [],
						match: { "": "x" },
					},
				],
			},
		})
	).rejects.toThrow('Unsupported local declaration: "local = count"');
});

// cross-format: what `@inlang/plugin-icu1` imports must survive a
// message-format export and re-import and still export the same ICU messages
test("ICU exact numbers survive message-format export and re-import", async () => {
	const icuFiles = {
		en: {
			items:
				"{count, plural, =0 {No items} one {One item} other {{count} items}}",
			seats:
				"{count, plural, =0 {No seats} =1 {Last seat} =5 {Five seats} one {{count} seat} other {{count} seats}}",
			place:
				"{place, selectordinal, =0 {Not ranked} one {{place}st} two {{place}nd} few {{place}rd} other {{place}th}}",
			guests:
				"{gender, select, female {{count, plural, =0 {She invites nobody} other {She invites {count}}}} other {{count, plural, =0 {They invite nobody} other {They invite {count}}}}}",
		},
		fr: {
			items:
				"{count, plural, =0 {Aucun article} one {{count} article} other {{count} articles}}",
		},
	};
	const icuImported = await icuPlugin.importFiles!({
		files: Object.entries(icuFiles).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
		settings: {} as any,
	});

	const mfExported = await runExport(withIds(structuredClone(icuImported)));
	// declarations keep the order of the import
	expect(mfExported.en.items[0].declarations).toStrictEqual([
		"input count",
		"local countPlural = count: plural",
		"local countPluralExact = count",
	]);
	expect(mfExported.en.items[0].selectors).toStrictEqual([
		"countPluralExact",
		"countPlural",
	]);

	const mfReimported = await runImport(mfExported);
	// the same messages, with the selectors in the order message-format writes
	// them: alphabetical, an exact number directly before its plural
	expect(
		Object.fromEntries(
			mfReimported.messages.map((message) => [
				`${message.bundleId}/${message.locale}`,
				message.selectors?.map((selector) => selector.name),
			])
		)
	).toMatchInlineSnapshot(`
		{
		  "guests/en": [
		    "countPluralExact",
		    "countPlural",
		    "gender",
		  ],
		  "items/en": [
		    "countPluralExact",
		    "countPlural",
		  ],
		  "items/fr": [
		    "countPluralExact",
		    "countPlural",
		  ],
		  "place/en": [
		    "placeOrdinalExact",
		    "placeOrdinal",
		  ],
		  "seats/en": [
		    "countPluralExact",
		    "countPlural",
		  ],
		}
	`);
	expect(normalize(mfReimported, { withoutSelectors: true })).toStrictEqual(
		normalize(icuImported, { withoutSelectors: true })
	);

	const icuExported = await icuPlugin.exportFiles!({
		...(withIds(mfReimported) as any),
		settings: {} as any,
	});
	for (const file of icuExported) {
		const json = JSON.parse(new TextDecoder().decode(file.content));
		expect(json).toStrictEqual({
			...icuFiles[file.locale as keyof typeof icuFiles],
			// message-format writes `count…` before `gender`, so the plural now
			// encloses the select. For this message, that selects the same
			// text for every input.
			...(file.locale === "en"
				? {
						guests:
							"{count, plural, =0 {{gender, select, female {She invites nobody} other {They invite nobody}}} other {{gender, select, female {She invites } other {They invite }}{count}}}",
					}
				: {}),
		});
	}
});

type Imported = Awaited<ReturnType<typeof importFiles>>;
type Exportable = {
	bundles: Bundle[];
	messages: Message[];
	variants: Variant[];
};

function runImport(files: Record<string, unknown>) {
	return importFiles({
		settings: {} as any,
		files: Object.entries(files).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
	});
}

async function runExport(args: Exportable): Promise<Record<string, any>> {
	const files = await exportFiles({ settings: {} as any, ...args });
	return Object.fromEntries(
		files.map((file) => [
			file.locale,
			JSON.parse(new TextDecoder().decode(file.content)),
		])
	);
}

function variant(
	messageId: string,
	matches: Record<string, string>,
	text: string
): Variant {
	return {
		id: `${messageId}-${JSON.stringify(matches)}`,
		messageId,
		matches: Object.entries(matches).map(([key, value]) =>
			value === "*"
				? { type: "catchall-match", key }
				: { type: "literal-match", key, value }
		),
		pattern: [{ type: "text", value: text }],
	};
}

function withIds(imported: Imported): Exportable {
	const messages = imported.messages.map((message) => ({
		...message,
		id: message.id ?? `${message.bundleId}-${message.locale}`,
	})) as Message[];
	const variants = imported.variants.map((variant, index) => ({
		...variant,
		id: variant.id ?? `variant-${index}`,
		messageId:
			variant.messageId ??
			messages.find(
				(message) =>
					message.bundleId === variant.messageBundleId &&
					message.locale === variant.messageLocale
			)!.id,
	})) as Variant[];
	return { bundles: imported.bundles as Bundle[], messages, variants };
}

/**
 * Compares imports independent of the order of declarations, variants and
 * matches, which carry no meaning. Selector order does.
 */
function normalize(
	imported: Imported,
	options: { withoutSelectors?: boolean } = {}
) {
	const sortBy = <T>(items: T[]) =>
		[...items].sort((a, b) =>
			JSON.stringify(a).localeCompare(JSON.stringify(b))
		);
	return {
		bundles: sortBy(
			imported.bundles.map((bundle) => ({
				id: bundle.id,
				declarations: sortBy(bundle.declarations ?? []),
			}))
		),
		messages: sortBy(
			imported.messages.map((message) => ({
				bundleId: message.bundleId,
				locale: message.locale,
				selectors: options.withoutSelectors ? undefined : message.selectors,
			}))
		),
		variants: sortBy(
			imported.variants.map((variant) => ({
				bundleId: variant.messageBundleId,
				locale: variant.messageLocale,
				matches: sortBy(variant.matches ?? []),
				pattern: variant.pattern,
			}))
		),
	};
}
