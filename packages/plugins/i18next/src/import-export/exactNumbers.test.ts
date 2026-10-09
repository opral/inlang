import { expect, test } from "vitest";
import i18next from "i18next";
import type { Bundle, Declaration, Message, Variant } from "@inlang/sdk";
import icuPlugin from "@inlang/plugin-icu1";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";
import { zeroCategorySelectsNonZero } from "./zeroCategory.js";

// Exact numbers in the shape `@inlang/plugin-icu1` imports
// `{count, plural, =0 {…} one {…} other {…}}` and editors create them
// (`addExactNumber`): an un-annotated local alias of `count` before the plural.
// https://github.com/opral/inlang-fink/issues/83
const declarations: Declaration[] = [
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

test("exports an exact 0 as `_zero`", async () => {
	const exported = await runExport(
		exactPluralBundle("item", {
			en: [
				[{ countPluralExact: "0", countPlural: "*" }, "No items"],
				[{ countPluralExact: "*", countPlural: "one" }, "One item"],
				[{ countPluralExact: "*", countPlural: "*" }, "{{count}} items"],
			],
			fr: [
				[{ countPluralExact: "0", countPlural: "*" }, "Aucun article"],
				[{ countPluralExact: "*", countPlural: "one" }, "{{count}} article"],
				[{ countPluralExact: "*", countPlural: "*" }, "{{count}} articles"],
			],
		})
	);

	expect(exported).toStrictEqual({
		en: {
			item: "{{count}} items",
			item_one: "One item",
			item_zero: "No items",
		},
		fr: {
			item: "{{count}} articles",
			item_one: "{{count}} article",
			item_zero: "Aucun article",
		},
	});

	// i18next picks `_zero` for count 0 in every language, also where 0 is a
	// plural category of its own: French "one" selects 0 and 1
	const t = await runtime(exported);
	expect(t("item", { lng: "en", count: 0 })).toBe("No items");
	expect(t("item", { lng: "en", count: 1 })).toBe("One item");
	expect(t("item", { lng: "en", count: 2 })).toBe("2 items");
	expect(t("item", { lng: "fr", count: 0 })).toBe("Aucun article");
	expect(t("item", { lng: "fr", count: 1 })).toBe("1 article");
	expect(t("item", { lng: "fr", count: 2 })).toBe("2 articles");
});

test("an exact-number selector without forms exports the plural only", async () => {
	// e.g. a translation that does not have the reference's `=0` form yet
	const exported = await runExport(
		exactPluralBundle("item", {
			de: [
				[{ countPluralExact: "*", countPlural: "one" }, "Ein Artikel"],
				[{ countPluralExact: "*", countPlural: "*" }, "{{count}} Artikel"],
			],
		})
	);

	expect(exported).toStrictEqual({
		de: { item: "{{count}} Artikel", item_one: "Ein Artikel" },
	});
});

test("`_zero` keeps importing as an exact count = 0 that exports back to `_zero`", async () => {
	const file = {
		item: "{{count}} items",
		item_one: "One item",
		item_zero: "No items",
	};
	const imported = await runImport({ en: file });

	// `count` itself is the exact-number selector next to `countPlural`, which
	// the SDK and editors treat as one choice like `countPluralExact`
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "count" },
		{ type: "variable-reference", name: "countPlural" },
	]);
	expect(
		imported.variants
			.filter((variant) =>
				variant.matches?.some(
					(match) => match.type === "literal-match" && match.key === "count"
				)
			)
			.map((variant) => variant.matches)
	).toStrictEqual([
		[
			{ type: "literal-match", key: "count", value: "0" },
			{ type: "catchall-match", key: "countPlural" },
		],
	]);

	expect(await runExport(withIds(imported))).toStrictEqual({ en: file });
});

test("the ICU-style exact-number shape round-trips through i18next files", async () => {
	const bundle = exactPluralBundle("item", {
		en: [
			[{ countPluralExact: "0", countPlural: "*" }, "No items"],
			[{ countPluralExact: "*", countPlural: "one" }, "One item"],
			[{ countPluralExact: "*", countPlural: "*" }, "{{count}} items"],
		],
	});
	const exported = await runExport(bundle);
	const reexported = await runExport(withIds(await runImport(exported)));
	expect(reexported).toStrictEqual(exported);
});

test.each(["1", "5", "-1", "0.5"])(
	"rejects the exact number =%s, which i18next cannot express",
	async (value) => {
		await expect(
			runExport(
				exactPluralBundle("seat", {
					en: [
						[{ countPluralExact: "0", countPlural: "*" }, "No seats"],
						[{ countPluralExact: value, countPlural: "*" }, "Some seats"],
						[{ countPluralExact: "*", countPlural: "*" }, "{{count}} seats"],
					],
				})
			)
		).rejects.toThrow(
			`i18next export cannot represent the exact number =${value} of bundle "seat" (en)`
		);
	}
);

test("rejects an exact number of an ordinal plural", async () => {
	await expect(
		runExport({
			bundles: [
				{
					id: "place",
					declarations: [
						{ type: "input-variable", name: "count" },
						{
							type: "local-variable",
							name: "countOrdinalExact",
							value: {
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
							},
						},
						{
							type: "local-variable",
							name: "countOrdinal",
							value: {
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
								annotation: {
									type: "function-reference",
									name: "plural",
									options: [
										{
											name: "type",
											value: { type: "literal", value: "ordinal" },
										},
									],
								},
							},
						},
					],
				},
			],
			messages: [message("place", "en", ["countOrdinalExact", "countOrdinal"])],
			variants: [
				variant("place-en", { countOrdinalExact: "0", countOrdinal: "*" }, "-"),
				variant("place-en", { countOrdinalExact: "*", countOrdinal: "*" }, "x"),
			],
		})
	).rejects.toThrow(
		'i18next export cannot represent the exact number =0 of the ordinal plural of bundle "place" (en)'
	);
});

test("rejects an exact number of an input other than count", async () => {
	await expect(
		runExport({
			bundles: [
				{
					id: "item",
					declarations: [
						{ type: "input-variable", name: "n" },
						{
							type: "local-variable",
							name: "nPluralExact",
							value: {
								type: "expression",
								arg: { type: "variable-reference", name: "n" },
							},
						},
					],
				},
			],
			messages: [message("item", "en", ["nPluralExact"])],
			variants: [variant("item-en", { nPluralExact: "*" }, "x")],
		})
	).rejects.toThrow('cannot represent selector "nPluralExact"');
});

// cross-format: what `@inlang/plugin-icu1` imports must export correctly
test("ICU exact numbers export to i18next with the same lookups", async () => {
	const icuFiles = {
		en: {
			item: "{count, plural, =0 {No items} one {One item} other {{count} items}}",
			friend:
				"{context, select, male {{count, plural, =0 {No boyfriend} one {A boyfriend} other {{count} boyfriends}}} other {{count, plural, =0 {No friend} one {A friend} other {{count} friends}}}}",
		},
		fr: {
			item: "{count, plural, =0 {Aucun article} one {{count} article} other {{count} articles}}",
		},
	};
	const imported = await icuPlugin.importFiles!({
		files: Object.entries(icuFiles).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
		settings: {} as any,
	});

	const exported = await runExport(withIds(imported as Imported), {
		variableReferencePattern: ["{", "}"],
	});
	expect(exported).toStrictEqual({
		en: {
			item: "{count} items",
			item_one: "One item",
			item_zero: "No items",
			friend: "{count} friends",
			friend_one: "A friend",
			friend_zero: "No friend",
			friend_male: "{count} boyfriends",
			friend_male_one: "A boyfriend",
			friend_male_zero: "No boyfriend",
		},
		fr: {
			item: "{count} articles",
			item_one: "{count} article",
			item_zero: "Aucun article",
		},
	});

	const t = await runtime(exported, ["{", "}"]);
	const cases: Array<[string, string, Record<string, unknown>, string]> = [
		["item", "en", { count: 0 }, "No items"],
		["item", "en", { count: 1 }, "One item"],
		["item", "en", { count: 3 }, "3 items"],
		["item", "fr", { count: 0 }, "Aucun article"],
		["item", "fr", { count: 1 }, "1 article"],
		["friend", "en", { count: 0 }, "No friend"],
		["friend", "en", { count: 0, context: "male" }, "No boyfriend"],
		["friend", "en", { count: 1, context: "male" }, "A boyfriend"],
		["friend", "en", { count: 4, context: "male" }, "4 boyfriends"],
	];
	for (const [key, lng, options, expected] of cases) {
		expect(t(key, { lng, ...options })).toBe(expected);
	}
});

test("ICU exact numbers other than 0 are reported, not exported as wrong plurals", async () => {
	const imported = await icuPlugin.importFiles!({
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({
						seat: "{count, plural, =0 {No seats} =1 {Last seat} one {# seat} other {# seats}}",
					})
				),
			},
		],
		settings: {} as any,
	});

	await expect(runExport(withIds(imported as Imported))).rejects.toThrow(
		'i18next export cannot represent the exact number =1 of bundle "seat" (en)'
	);
});

// `_zero` imports as the exact 0 form and the "zero" category form, like in
// every earlier version, so that its position among the plural keys survives
// a round trip. Where the category selects nothing but 0 (or does not exist),
// i18next shows the exact text for `_zero`, so export writes the exact form
// also when only it was edited.
test.each([
	[
		"en",
		{
			item_zero: "No items",
			item_one: "One item",
			item_other: "{{count}} items",
		},
	],
	[
		"fr",
		{
			item_zero: "Aucun article",
			item_one: "{{count}} article",
			item_other: "{{count}} articles",
		},
	],
	[
		"ar",
		{
			item_zero: "لا عناصر",
			item_one: "عنصر واحد",
			item_two: "عنصران",
			item_few: "{{count}} عناصر",
			item_many: "{{count}} عنصرًا",
			item_other: "{{count}} عنصر",
		},
	],
])(
	"`_zero` imports as exact 0 and the zero category in %s, and an edit of the exact form exports",
	async (locale, file) => {
		const imported = await runImport({ [locale]: file });
		const zeroForms = imported.variants.filter((variant) =>
			variant.pattern?.some(
				(part) => part.type === "text" && part.value === file.item_zero
			)
		);
		expect(zeroForms.map((variant) => variant.matches)).toStrictEqual([
			[
				{ type: "literal-match", key: "count", value: "0" },
				{ type: "catchall-match", key: "countPlural" },
			],
			[
				{ type: "catchall-match", key: "count" },
				{ type: "literal-match", key: "countPlural", value: "zero" },
			],
		]);
		expect(await runExport(withIds(imported))).toStrictEqual({
			[locale]: file,
		});

		// an edit of only the exact-0 form is exported: the category form is
		// never shown for `_zero` in this language
		zeroForms[0]!.pattern = [{ type: "text", value: "edited" }];
		const edited = await runExport(withIds(imported));
		expect(edited).toStrictEqual({
			[locale]: { ...file, item_zero: "edited" },
		});
		const t = await runtime(edited);
		expect(t("item", { lng: locale, count: 0 })).toBe("edited");
		expect(t("item", { lng: locale, count: 1 })).toBe(
			file.item_one.replace("{{count}}", "1")
		);

		// an edit of only the category form is not exported, as in earlier
		// versions: i18next never shows it for this language
		zeroForms[0]!.pattern = [{ type: "text", value: file.item_zero }];
		zeroForms[1]!.pattern = [{ type: "text", value: "category edit" }];
		expect(await runExport(withIds(imported))).toStrictEqual({
			[locale]: file,
		});
	}
);

// Latvian's "zero" category also selects 10, 11–19, 20, 30, …, and i18next
// uses `_zero` for those counts too. Two forms are needed there: exact 0 and
// the category. They must have the same text.
test("`_zero` imports as exact 0 and the zero category in Latvian", async () => {
	const file = {
		item_zero: "{{count}} vienību",
		item_one: "{{count}} vienība",
		item_other: "{{count}} vienības",
	};
	const imported = await runImport({ lv: file });
	const zeroForms = imported.variants.filter((variant) =>
		variant.pattern?.some(
			(part) => part.type === "text" && part.value === " vienību"
		)
	);
	expect(zeroForms.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "literal-match", key: "count", value: "0" },
			{ type: "catchall-match", key: "countPlural" },
		],
		[
			{ type: "catchall-match", key: "count" },
			{ type: "literal-match", key: "countPlural", value: "zero" },
		],
	]);
	expect(await runExport(withIds(imported))).toStrictEqual({ lv: file });

	const t = await runtime({ lv: file });
	expect(t("item", { lng: "lv", count: 0 })).toBe("0 vienību");
	expect(t("item", { lng: "lv", count: 10 })).toBe("10 vienību");

	// both forms edited alike: exported
	for (const form of zeroForms) {
		form.pattern = [{ type: "text", value: "nav vienību" }];
	}
	expect(await runExport(withIds(imported))).toStrictEqual({
		lv: { ...file, item_zero: "nav vienību" },
	});

	// only one edited: i18next cannot hold both texts, so export fails
	// instead of silently dropping one
	zeroForms[1]!.pattern = [{ type: "text", value: "{{count}} vienību" }];
	await expect(runExport(withIds(imported))).rejects.toThrow(
		'i18next export cannot represent two different texts for "item_zero" of bundle "item" (lv)'
	);
});

test("an exact 0 and a different zero-category text: the exact text where the category selects only 0", async () => {
	// Arabic "zero" selects only 0, where the exact form wins
	expect(
		await runExport(
			exactPluralBundle("item", {
				ar: [
					[{ countPluralExact: "0", countPlural: "*" }, "No items"],
					[{ countPluralExact: "*", countPlural: "zero" }, "Zero items"],
					[{ countPluralExact: "*", countPlural: "*" }, "{{count}} items"],
				],
			})
		)
	).toStrictEqual({
		ar: { item_zero: "No items", item: "{{count}} items" },
	});
	// Latvian "zero" also selects 10, 11–19, …: i18next can't hold both texts
	await expect(
		runExport(
			exactPluralBundle("item", {
				lv: [
					[{ countPluralExact: "0", countPlural: "*" }, "No items"],
					[{ countPluralExact: "*", countPlural: "zero" }, "Zero items"],
					[{ countPluralExact: "*", countPlural: "*" }, "{{count}} items"],
				],
			})
		)
	).rejects.toThrow(
		'i18next export cannot represent two different texts for "item_zero" of bundle "item" (lv)'
	);
});

// Files keep their key order on import and export, also where `_zero` comes
// after the other plural keys.
test.each([
	["zero first", ["item_zero", "item_one", "item_other"]],
	["zero last", ["item_one", "item_other", "item_zero"]],
	["zero between", ["item_one", "item_zero", "item_other"]],
])("`_zero` keeps its position among the plural keys (%s)", async (_, keys) => {
	const texts: Record<string, string> = {
		item_zero: "No items",
		item_one: "One item",
		item_other: "{{count}} items",
	};
	const content =
		JSON.stringify(
			Object.fromEntries(keys.map((key) => [key, texts[key]])),
			undefined,
			"\t"
		) + "\n";
	for (const locale of ["en", "lv"]) {
		const imported = await importFiles({
			settings: {} as any,
			files: [{ locale, content: new TextEncoder().encode(content) }],
		});
		const [file] = await exportFiles({
			settings: {
				baseLocale: "en",
				locales: [locale],
				"plugin.inlang.i18next": { pathPattern: "./{locale}.json" },
			},
			...withIds(imported),
		});
		expect(new TextDecoder().decode(file!.content)).toBe(content);
	}
});

// In Latvian, i18next uses `_zero` for every count of the "zero" category
// (0, 10, 11–19, 20, …). An ICU `=0` alone would show its text for 10 too.
test("rejects a Latvian exact 0 without a zero-category form", async () => {
	const imported = await icuImport({
		lv: {
			item: "{count, plural, =0 {nav} one {{count} vienība} other {{count} vienības}}",
		},
	});
	await expect(runExport(withIds(imported))).rejects.toThrow(
		'i18next export cannot represent the exact number =0 of bundle "item" (lv) as "item_zero"'
	);
});

test("a Latvian exact 0 with the same zero-category text exports with matching lookups", async () => {
	const imported = await icuImport({
		lv: {
			item: "{count, plural, =0 {{count} vienību} zero {{count} vienību} one {{count} vienība} other {{count} vienības}}",
			friend:
				"{context, select, male {{count, plural, =0 {nav} one {draugs} other {draugi}}} other {{count, plural, =0 {{count} draugu} zero {{count} draugu} one {draugs} other {draugi}}}}",
		},
	});
	// the male exact 0 has no zero form
	await expect(runExport(withIds(imported))).rejects.toThrow(
		'(lv) as "friend_male_zero"'
	);

	imported.bundles = imported.bundles.filter((bundle) => bundle.id === "item");
	imported.messages = imported.messages.filter((m) => m.bundleId === "item");
	imported.variants = imported.variants.filter(
		(v) => v.messageBundleId === "item"
	);
	const exported = await runExport(withIds(imported), {
		variableReferencePattern: ["{", "}"],
	});
	expect(exported).toStrictEqual({
		lv: {
			item: "{count} vienības",
			item_one: "{count} vienība",
			item_zero: "{count} vienību",
		},
	});
	const t = await runtime(exported, ["{", "}"]);
	expect(t("item", { lng: "lv", count: 0 })).toBe("0 vienību");
	expect(t("item", { lng: "lv", count: 10 })).toBe("10 vienību");
	expect(t("item", { lng: "lv", count: 1 })).toBe("1 vienība");
	expect(t("item", { lng: "lv", count: 2 })).toBe("2 vienības");
});

test("locales with underscores resolve their plural rules", async () => {
	expect(zeroCategorySelectsNonZero("pt_BR")).toBe(false);
	expect(zeroCategorySelectsNonZero("lv_LV")).toBe(true);
	expect(zeroCategorySelectsNonZero("lv-LV")).toBe(true);
	// legacy tags and tags Intl has no rules for use the rules Intl resolves,
	// like i18next
	expect(zeroCategorySelectsNonZero("iw")).toBe(false);
	expect(zeroCategorySelectsNonZero("dev")).toBe(false);
	expect(zeroCategorySelectsNonZero("not a tag")).toBe(false);

	// pt_BR has no "zero" category: an edit of only the exact form exports
	const imported = await runImport({
		pt_BR: { item_zero: "Nenhum", item_one: "Um", item_other: "{{count}}" },
	});
	imported.variants.find((variant) =>
		variant.matches?.some(
			(match) => match.type === "literal-match" && match.key === "count"
		)
	)!.pattern = [{ type: "text", value: "Nada" }];
	expect(await runExport(withIds(imported))).toStrictEqual({
		pt_BR: { item_zero: "Nada", item_one: "Um", item_other: "{{count}}" },
	});
});

async function icuImport(files: Record<string, Record<string, string>>) {
	return (await icuPlugin.importFiles!({
		files: Object.entries(files).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
		settings: {} as any,
	})) as Imported;
}

type Imported = Awaited<ReturnType<typeof importFiles>>;
type Exportable = {
	bundles: Bundle[];
	messages: Message[];
	variants: Variant[];
};

function exactPluralBundle(
	id: string,
	forms: Record<string, Array<[Record<string, string>, string]>>
): Exportable {
	return {
		bundles: [{ id, declarations }],
		messages: Object.keys(forms).map((locale) =>
			message(id, locale, ["countPluralExact", "countPlural"])
		),
		variants: Object.entries(forms).flatMap(([locale, entries]) =>
			entries.map(([matches, text]) =>
				variant(`${id}-${locale}`, matches, text)
			)
		),
	};
}

function message(
	bundleId: string,
	locale: string,
	selectors: string[]
): Message {
	return {
		id: `${bundleId}-${locale}`,
		bundleId,
		locale,
		selectors: selectors.map((name) => ({ type: "variable-reference", name })),
	};
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
		pattern: text
			.split(/(\{\{count\}\})/)
			.filter((part) => part !== "")
			.map((part) =>
				part === "{{count}}"
					? {
							type: "expression",
							arg: { type: "variable-reference", name: "count" },
						}
					: { type: "text", value: part }
			),
	};
}

function runImport(files: Record<string, Record<string, string>>) {
	return importFiles({
		settings: {
			baseLocale: Object.keys(files)[0]!,
			locales: Object.keys(files),
			"plugin.inlang.i18next": { pathPattern: "./{locale}.json" },
		},
		files: Object.entries(files).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
	});
}

async function runExport(
	args: Exportable,
	pluginSettings: Record<string, unknown> = {}
): Promise<Record<string, Record<string, string>>> {
	const files = await exportFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "fr", "de", "ar", "lv", "pt_BR"],
			"plugin.inlang.i18next": {
				pathPattern: "./{locale}.json",
				...pluginSettings,
			},
		},
		...args,
	});
	return Object.fromEntries(
		files.map((file) => [
			file.locale,
			JSON.parse(new TextDecoder().decode(file.content)),
		])
	);
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

async function runtime(
	resources: Record<string, Record<string, string>>,
	interpolation: [string, string] = ["{{", "}}"]
) {
	const instance = i18next.createInstance();
	await instance.init({
		lng: Object.keys(resources)[0],
		fallbackLng: false,
		interpolation: { prefix: interpolation[0], suffix: interpolation[1] },
		resources: Object.fromEntries(
			Object.entries(resources).map(([locale, translation]) => [
				locale,
				{ translation },
			])
		),
	});
	return (key: string, options: Record<string, unknown>) =>
		instance.t(key, options as any) as string;
}
