import { expect, test } from "vitest";
import i18next from "i18next";
import type { Bundle, Declaration, Message, Variant } from "@inlang/sdk";
import icuPlugin from "@inlang/plugin-icu1";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

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
			locales: ["en", "fr", "de"],
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
