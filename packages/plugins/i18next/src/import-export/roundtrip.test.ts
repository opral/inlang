import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";
import {
	type Bundle,
	type Message,
	type Pattern,
	type Variant,
} from "@inlang/sdk";
import { exportFiles } from "./exportFiles.js";
import type { PluginSettings } from "../settings.js";

test("single key value", async () => {
	const imported = await runImportFiles({
		key: "value",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		key: "value",
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(1);

	expect(imported.bundles[0]?.id).toStrictEqual("key");
	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.messages[0]?.selectors).toStrictEqual([]);
	expect(imported.variants[0]?.matches).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "value" },
	]);
});

test("key deep", async () => {
	const imported = await runImportFiles({
		keyDeep: { inner: "value" },
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyDeep: { inner: "value" },
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(1);

	expect(imported.bundles[0]?.id).toStrictEqual("keyDeep.inner");
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "value" },
	]);
});

test("keyInterpolate", async () => {
	const imported = await runImportFiles({
		keyInterpolate: "replace this {{value}}",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyInterpolate: "replace this {{value}}",
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(1);

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "value" },
	]);

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "replace this " },
		{ type: "expression", arg: { type: "variable-reference", name: "value" } },
	] satisfies Pattern);
});

test("keyInterpolateUnescaped", async () => {
	const imported = await runImportFiles({
		keyInterpolateUnescaped: "replace this {{- value}}",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyInterpolateUnescaped: "replace this {{- value}}",
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyInterpolateUnescaped");
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "- value" },
	]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "replace this " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "- value" },
		},
	] satisfies Pattern);
});

test("keyInterpolateWithFormatting", async () => {
	const imported = await runImportFiles({
		keyInterpolateWithFormatting: "replace this {{value, format}}",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyInterpolateWithFormatting: "replace this {{value, format}}",
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyInterpolateWithFormatting");
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "replace this " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "value" },
			annotation: { type: "function-reference", name: "format", options: [] },
		},
	] satisfies Pattern);
});

test("keyMarkupTransTags", async () => {
	const imported = await runImportFiles({
		keyMarkupTransTags: "Click <link>here</link>.<icon/>",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyMarkupTransTags: "Click <link>here</link>.<icon/>",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Click " },
		{ type: "markup-start", name: "link" },
		{ type: "text", value: "here" },
		{ type: "markup-end", name: "link" },
		{ type: "text", value: "." },
		{ type: "markup-standalone", name: "icon" },
	] satisfies Pattern);
});

test("keyMarkupTransTagsWithInterpolation", async () => {
	const imported = await runImportFiles({
		keyMarkupTransTagsWithInterpolation: "Hello <b>{{name}}</b><icon/>",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyMarkupTransTagsWithInterpolation: "Hello <b>{{name}}</b><icon/>",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "name" },
	]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello " },
		{ type: "markup-start", name: "b" },
		{ type: "expression", arg: { type: "variable-reference", name: "name" } },
		{ type: "markup-end", name: "b" },
		{ type: "markup-standalone", name: "icon" },
	] satisfies Pattern);
});

test("keyMarkupNumericTransTags", async () => {
	const imported = await runImportFiles({
		keyMarkupNumericTransTags: "Click <0>here</0>.<1/>",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyMarkupNumericTransTags: "Click <0>here</0>.<1/>",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Click " },
		{ type: "markup-start", name: "0" },
		{ type: "text", value: "here" },
		{ type: "markup-end", name: "0" },
		{ type: "text", value: "." },
		{ type: "markup-standalone", name: "1" },
	] satisfies Pattern);
});

test("keyMarkupMixedNamedAndNumericTransTags", async () => {
	const imported = await runImportFiles({
		keyMarkupMixedNamedAndNumericTransTags:
			"A <0>nested <b>tag</b></0> <icon/>",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyMarkupMixedNamedAndNumericTransTags:
			"A <0>nested <b>tag</b></0> <icon/>",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "A " },
		{ type: "markup-start", name: "0" },
		{ type: "text", value: "nested " },
		{ type: "markup-start", name: "b" },
		{ type: "text", value: "tag" },
		{ type: "markup-end", name: "b" },
		{ type: "markup-end", name: "0" },
		{ type: "text", value: " " },
		{ type: "markup-standalone", name: "icon" },
	] satisfies Pattern);
});

// context keys, see https://www.i18next.com/translation-function/context
// reproduces https://github.com/opral/inlang/issues/4355
test("keyContext", async () => {
	const imported = await runImportFiles({
		// catch all
		keyContext: "the variant",
		// context: male
		keyContext_male: "the male variant",
		// context: female
		keyContext_female: "the female variant",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyContext: "the variant",
		keyContext_male: "the male variant",
		keyContext_female: "the female variant",
	});

	expect(imported.bundles).lengthOf(1);
	// one message per imported key, see
	// "a key with a single variant should have no matches even if other keys are multi variant"
	expect(imported.messages).lengthOf(3);
	expect(imported.variants).lengthOf(3);

	expect(imported.bundles[0]?.id).toStrictEqual("keyContext");
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "context" },
	]);

	// every message of the bundle declares the same selectors
	for (const message of imported.messages) {
		expect(message.selectors).toStrictEqual([
			{ type: "variable-reference", name: "context" },
		]);
	}

	// variants are ordered most-specific-first so that first-match-wins
	// consumers (e.g. the paraglide compiler) resolve context like i18next.
	// the base key is the fallback, expressed as a catchall match.
	// https://github.com/opral/inlang/issues/4354
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[{ type: "literal-match", key: "context", value: "male" }],
		[{ type: "literal-match", key: "context", value: "female" }],
		[{ type: "catchall-match", key: "context" }],
	]);
	expect(
		imported.variants.map((variant) =>
			variant.pattern?.[0]?.type === "text"
				? variant.pattern[0].value
				: undefined
		)
	).toStrictEqual(["the male variant", "the female variant", "the variant"]);
});

// context combined with plurals, mirrors the example in
// https://www.i18next.com/translation-function/context#combining-with-plurals
// reproduces https://github.com/opral/inlang/issues/4355
test("keyContextCombinedWithPlurals", async () => {
	// the context+plural keys mirror i18next's own test fixture in
	// test/runtime/translator/translator.translate.combination.test.js
	const json = {
		friend_one: "A friend",
		friend_other: "{{count}} friends",
		friend_male_zero: "No boyfriend",
		friend_male_one: "A boyfriend",
		friend_male_other: "{{count}} boyfriends",
		friend_female_zero: "no girlfriend",
		friend_female_one: "a girlfriend",
		friend_female_other: "{{count}} girlfriends",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("friend");
	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "context" },
			{ type: "input-variable", name: "count" },
		])
	);
	// 8 keys -> 10 variants: each `_zero` key imports as an exact
	// `count = 0` match plus the Intl "zero" category fallback (#4357)
	expect(imported.variants).lengthOf(10);
});

// a plural key set can ship a base key as the fallback for calls without a
// count, see https://www.i18next.com/translation-function/plurals
// reproduces https://github.com/opral/inlang/issues/4355
// ("The variant does not have a plural match")
test("keyPluralWithBaseKey", async () => {
	const json = {
		friend: "A friend",
		friend_one: "A friend",
		friend_other: "{{count}} friends",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);
});

// reproduces https://github.com/opral/inlang/issues/4354 — imported variants
// must be ordered most-specific-first with explicit catchall matches so that
// first-match-wins consumers (e.g. the paraglide compiler) resolve a call
// like t("friend", { context: "male", count: 1 }) the way i18next does:
// `friend_male_one` > `friend_male` > `friend_one` > `friend`
// https://www.i18next.com/translation-function/context#combining-with-plurals
test("context and plural sibling keys are ordered most-specific-first with catchall fallbacks", async () => {
	const json = {
		friend: "A friend",
		friend_one: "A friend",
		friend_other: "{{count}} friends",
		friend_male: "A boyfriend",
		friend_male_one: "A boyfriend",
		friend_male_other: "{{count}} boyfriends",
	};
	const imported = await runImportFiles(json);

	// round-trips unchanged
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "context" },
			{ type: "input-variable", name: "count" },
		])
	);

	// every message of the bundle declares the same selectors
	for (const message of imported.messages) {
		expect(message.selectors).toStrictEqual([
			{ type: "variable-reference", name: "context" },
			{ type: "variable-reference", name: "countPlural" },
		]);
	}

	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "literal-match", key: "context", value: "male" },
			{ type: "literal-match", key: "countPlural", value: "one" },
		],
		[
			{ type: "literal-match", key: "context", value: "male" },
			{ type: "literal-match", key: "countPlural", value: "other" },
		],
		[
			{ type: "literal-match", key: "context", value: "male" },
			{ type: "catchall-match", key: "countPlural" },
		],
		[
			{ type: "catchall-match", key: "context" },
			{ type: "literal-match", key: "countPlural", value: "one" },
		],
		[
			{ type: "catchall-match", key: "context" },
			{ type: "literal-match", key: "countPlural", value: "other" },
		],
		[
			{ type: "catchall-match", key: "context" },
			{ type: "catchall-match", key: "countPlural" },
		],
	]);
});

test("keyPluralSimple", async () => {
	const imported = await runImportFiles({
		keyPluralSimple_one: "the singular",
		keyPluralSimple_other: "the plural",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyPluralSimple_one: "the singular",
		keyPluralSimple_other: "the plural",
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyPluralSimple");

	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{
				type: "input-variable",
				name: "count",
			},
			expect.objectContaining({
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: {
						type: "variable-reference",
						name: "count",
					},
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [],
					},
				},
			}),
		])
	);

	expect(imported?.messages[0]?.selectors).toStrictEqual([
		{
			type: "variable-reference",
			name: "countPlural",
		},
	]);

	expect(imported?.variants[0]).toStrictEqual(
		expect.objectContaining({
			matches: [
				{
					type: "literal-match",
					key: "countPlural",
					value: "one",
				},
			],
			pattern: [{ type: "text", value: "the singular" }],
		} satisfies Partial<Variant>)
	);

	expect(imported?.variants[1]).toStrictEqual(
		expect.objectContaining({
			matches: [
				{
					type: "literal-match",
					key: "countPlural",
					value: "other",
				},
			],
			pattern: [{ type: "text", value: "the plural" }],
		} satisfies Partial<Variant>)
	);
});

test("keyPluralMultipleEgArabic", async () => {
	const imported = await runImportFiles({
		keyPluralMultipleEgArabic_zero: "the plural form 0",
		keyPluralMultipleEgArabic_one: "the plural form 1",
		keyPluralMultipleEgArabic_two: "the plural form 2",
		keyPluralMultipleEgArabic_few: "the plural form 3",
		keyPluralMultipleEgArabic_many: "the plural form 4",
		keyPluralMultipleEgArabic_other: "the plural form 5",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyPluralMultipleEgArabic_zero: "the plural form 0",
		keyPluralMultipleEgArabic_one: "the plural form 1",
		keyPluralMultipleEgArabic_two: "the plural form 2",
		keyPluralMultipleEgArabic_few: "the plural form 3",
		keyPluralMultipleEgArabic_many: "the plural form 4",
		keyPluralMultipleEgArabic_other: "the plural form 5",
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyPluralMultipleEgArabic");

	// the `_zero` sibling makes `count` itself a selector ahead of the
	// plural category, see https://github.com/opral/inlang/issues/4357
	expect(imported?.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "count" },
		{ type: "variable-reference", name: "countPlural" },
	]);

	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{
				type: "input-variable",
				name: "count",
			},
			expect.objectContaining({
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: {
						type: "variable-reference",
						name: "count",
					},
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [],
					},
				},
			}),
		])
	);

	// 6 keys -> 7 variants: `_zero` imports as an exact `count = 0` match
	// (i18next prefers `_zero` at count 0 in every language) plus the Intl
	// "zero" category fallback (e.g. Arabic, Latvian)
	expect(
		imported.variants.map((variant) =>
			variant.matches
				?.map((match) =>
					match.type === "literal-match"
						? `${match.key}=${match.value}`
						: `${match.key}=*`
				)
				.join(" ")
		)
	).toStrictEqual([
		"count=0 countPlural=*",
		"count=* countPlural=zero",
		"count=* countPlural=one",
		"count=* countPlural=two",
		"count=* countPlural=few",
		"count=* countPlural=many",
		"count=* countPlural=other",
	]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 0" },
	]);
	expect(imported.variants[1]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 0" },
	]);
	expect(imported.variants[2]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 1" },
	]);
	expect(imported.variants[3]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 2" },
	]);
	expect(imported.variants[4]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 3" },
	]);
	expect(imported.variants[5]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 4" },
	]);
	expect(imported.variants[6]?.pattern).toStrictEqual([
		{ type: "text", value: "the plural form 5" },
	]);
});

// `_zero` is i18next's exact `count === 0` match in every language — not just
// the Intl "zero" plural category, which most languages never select
// (https://www.i18next.com/translation-function/plurals). encoded via `count`
// as a selector ahead of `countPlural`, exactly the mechanism proposed in
// https://github.com/opral/paraglide-js/issues/552.
// reproduces https://github.com/opral/inlang/issues/4357
test("keyPluralWithZero", async () => {
	const json = {
		item_zero: "You have no items. Create your first now.",
		item_one: "You have one item.",
		item_other: "You have {{count}} items.",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "count" },
		{ type: "variable-reference", name: "countPlural" },
	]);

	// the exact `count = 0` variant is the most specific and comes first;
	// the Intl "zero" category fallback keeps languages like Latvian working
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "literal-match", key: "count", value: "0" },
			{ type: "catchall-match", key: "countPlural" },
		],
		[
			{ type: "catchall-match", key: "count" },
			{ type: "literal-match", key: "countPlural", value: "zero" },
		],
		[
			{ type: "catchall-match", key: "count" },
			{ type: "literal-match", key: "countPlural", value: "one" },
		],
		[
			{ type: "catchall-match", key: "count" },
			{ type: "literal-match", key: "countPlural", value: "other" },
		],
	]);
});

// i18next ordinal plurals use the reserved `_ordinal_<category>` suffix and
// resolve with ordinal Intl.PluralRules ("1st", "2nd", ...), see
// https://www.i18next.com/translation-function/plurals#ordinal-plurals
// reproduces https://github.com/opral/inlang/issues/4358 (currently parsed
// as context "ordinal" with cardinal categories)
test("keyOrdinal", async () => {
	const json = {
		place_ordinal_one: "{{count}}st place",
		place_ordinal_two: "{{count}}nd place",
		place_ordinal_few: "{{count}}rd place",
		place_ordinal_other: "{{count}}th place",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("place");

	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "count" },
			expect.objectContaining({
				type: "local-variable",
				name: "countOrdinal",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [
							{ name: "type", value: { type: "literal", value: "ordinal" } },
						],
					},
				},
			}),
		])
	);
	// ordinal keys must not be parsed as context "ordinal"
	expect(
		(imported.bundles[0]?.declarations ?? []).some(
			(declaration) => declaration.name === "context"
		)
	).toBe(false);

	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "countOrdinal" },
	]);

	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[{ type: "literal-match", key: "countOrdinal", value: "one" }],
		[{ type: "literal-match", key: "countOrdinal", value: "two" }],
		[{ type: "literal-match", key: "countOrdinal", value: "few" }],
		[{ type: "literal-match", key: "countOrdinal", value: "other" }],
	]);
});

// context combines with ordinal plurals the same way as with cardinal ones
// (`contextKey + pluralSuffix` in i18next's lookup).
// reproduces https://github.com/opral/inlang/issues/4358 — on main these
// keys lose their context AND ordinal marker on export (`race_one`)
test("keyContextWithOrdinal", async () => {
	const json = {
		race_male_ordinal_one: "his {{count}}st race",
		race_male_ordinal_other: "his {{count}}th race",
		race_female_ordinal_one: "her {{count}}st race",
		race_female_ordinal_other: "her {{count}}th race",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles[0]?.id).toStrictEqual("race");
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "context" },
		{ type: "variable-reference", name: "countOrdinal" },
	]);
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "literal-match", key: "context", value: "male" },
			{ type: "literal-match", key: "countOrdinal", value: "one" },
		],
		[
			{ type: "literal-match", key: "context", value: "male" },
			{ type: "literal-match", key: "countOrdinal", value: "other" },
		],
		[
			{ type: "literal-match", key: "context", value: "female" },
			{ type: "literal-match", key: "countOrdinal", value: "one" },
		],
		[
			{ type: "literal-match", key: "context", value: "female" },
			{ type: "literal-match", key: "countOrdinal", value: "other" },
		],
	]);
});

// Mixed bundles use an explicit string-valued pluralType input. Ordinal
// literals outrank cardinal fallback forms, independently of file order.
test("keyPluralCardinalAndOrdinalMixed", async () => {
	const json = {
		race_one: "{{count}} race",
		race_other: "{{count}} races",
		race_ordinal_one: "{{count}}st race",
		race_ordinal_other: "{{count}}th race",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "pluralType" },
		{ type: "variable-reference", name: "countPlural" },
	]);
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[
			{ type: "literal-match", key: "pluralType", value: "ordinal" },
			{ type: "literal-match", key: "countPlural", value: "one" },
		],
		[
			{ type: "literal-match", key: "pluralType", value: "ordinal" },
			{ type: "literal-match", key: "countPlural", value: "other" },
		],
		[
			{ type: "catchall-match", key: "pluralType" },
			{ type: "literal-match", key: "countPlural", value: "one" },
		],
		[
			{ type: "catchall-match", key: "pluralType" },
			{ type: "literal-match", key: "countPlural", value: "other" },
		],
	]);
});

test("key with separator and context", async () => {
	const json = {
		key_separator_context_male: "male value",
		key_separator_context_female: "female value",
		key_separator_context_1234: "female value",
		key_separator_context_male_one: "male value one",
		key_separator_context_female_one: "female value one",
		key_separator_context_male_other: "male value other",
		key_separator_context_female_other: "female value other",
		key_separator_context_male_ordinal_one: "male value ordinal one",
		key_separator_context_female_ordinal_one: "female value ordinal one",
		key_separator_context_male_ordinal_other: "male value ordinal other",
		key_separator_context_female_ordinal_other: "female value ordinal other",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles[0]?.id).toStrictEqual("key_separator_context");
	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "count" },
			{ type: "input-variable", name: "pluralType" },
			{
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [
							{
								name: "type",
								value: { type: "variable-reference", name: "pluralType" },
							},
						],
					},
				},
			},
		])
	);
	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "context" },
		{ type: "variable-reference", name: "pluralType" },
		{ type: "variable-reference", name: "countPlural" },
	]);
	const matches = (context: string, mode?: string, category?: string) => [
		{ type: "literal-match", key: "context", value: context },
		mode
			? { type: "literal-match", key: "pluralType", value: mode }
			: { type: "catchall-match", key: "pluralType" },
		category
			? { type: "literal-match", key: "countPlural", value: category }
			: { type: "catchall-match", key: "countPlural" },
	];
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		matches("male", "ordinal", "one"),
		matches("female", "ordinal", "one"),
		matches("male", "ordinal", "other"),
		matches("female", "ordinal", "other"),
		matches("male", undefined, "one"),
		matches("female", undefined, "one"),
		matches("male", undefined, "other"),
		matches("female", undefined, "other"),
		matches("male"),
		matches("female"),
		matches("1234"),
	]);
});

test("key with underscore without context", async () => {
	const json = {
		this_is_a_key_without_context: "value",
		this_is_another_key_without_context: "value",
	};
	const imported = await runImportFiles(json);
	expect(await runExportFilesParsed(imported)).toStrictEqual(json);

	expect(imported.bundles).lengthOf(2);
	expect(imported.bundles[0]?.id).toStrictEqual(
		"this_is_a_key_without_context"
	);
	expect(imported.bundles[1]?.id).toStrictEqual(
		"this_is_another_key_without_context"
	);
	expect(imported.messages[0]?.selectors).toStrictEqual([]);
	expect(imported.variants.map((variant) => variant.matches)).toStrictEqual([
		[],
		[],
	]);
});

test("keyWithObjectValue", async () => {
	const imported = await runImportFiles({
		keyWithObjectValue: {
			valueA: "return this with valueB",
			valueB: "more text",
		},
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyWithObjectValue: {
			valueA: "return this with valueB",
			valueB: "more text",
		},
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyWithObjectValue.valueA");
	expect(imported.bundles[1]?.id).toStrictEqual("keyWithObjectValue.valueB");

	expect(
		imported.variants.find(
			(v) => v.messageBundleId === "keyWithObjectValue.valueA"
		)?.pattern
	).toStrictEqual([
		{ type: "text", value: "return this with valueB" },
	] satisfies Pattern);
	expect(
		imported.variants.find(
			(v) => v.messageBundleId === "keyWithObjectValue.valueB"
		)?.pattern
	).toStrictEqual([{ type: "text", value: "more text" }] satisfies Pattern);
});

test("keyWithArrayValue", async () => {
	const imported = await runImportFiles({
		keyWithArrayValue: ["multiple", "things"],
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		keyWithArrayValue: ["multiple", "things"],
	});

	expect(imported.bundles[0]?.id).toStrictEqual("keyWithArrayValue.0");
	expect(imported.bundles[1]?.id).toStrictEqual("keyWithArrayValue.1");

	expect(
		imported.variants.find((v) => v.messageBundleId === "keyWithArrayValue.0")
			?.pattern
	).toStrictEqual([{ type: "text", value: "multiple" }] satisfies Pattern);
	expect(
		imported.variants.find((v) => v.messageBundleId === "keyWithArrayValue.1")
			?.pattern
	).toStrictEqual([{ type: "text", value: "things" }] satisfies Pattern);
});

test("im- and exporting multiple files should succeed", async () => {
	const en = {
		key: "value",
	};
	const de = {
		key: "Wert",
	};

	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(en)),
			},
			{
				locale: "de",
				content: new TextEncoder().encode(JSON.stringify(de)),
			},
		],
	});

	const exported = await runExportFiles(imported);

	const exportedEn = JSON.parse(
		new TextDecoder().decode(exported.find((e) => e.locale === "en")?.content)
	);
	const exportedDe = JSON.parse(
		new TextDecoder().decode(exported.find((e) => e.locale === "de")?.content)
	);

	expect(exportedEn).toStrictEqual({
		key: "value",
	});
	expect(exportedDe).toStrictEqual({
		key: "Wert",
	});
});

test("it should handle namespaces", async () => {
	const enCommon = {
		confirm: "value1",
	};
	const enLogin = {
		button: "value2",
	};

	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(enCommon)),
				toBeImportedFilesMetadata: {
					namespace: "common",
				},
			},
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(enLogin)),
				toBeImportedFilesMetadata: {
					namespace: "login",
				},
			},
		],
	});
	const exported = await runExportFiles(imported);

	const exportedCommon = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.name === "common-en.json")?.content
		)
	);
	const exportedLogin = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.name === "login-en.json")?.content
		)
	);

	expect(exportedCommon).toStrictEqual({
		confirm: "value1",
	});
	expect(exportedLogin).toStrictEqual({
		button: "value2",
	});

	// the namespace metadata enables the SDK to resolve namespaced
	// pathPatterns when writing files back to disk
	// https://github.com/opral/inlang/issues/4356
	expect(
		exported.find((e) => e.name === "common-en.json")?.metadata
	).toStrictEqual({ namespace: "common" });
	expect(
		exported.find((e) => e.name === "login-en.json")?.metadata
	).toStrictEqual({ namespace: "login" });
});

test("it should put new entities into the file without a namespace", async () => {
	const enNoNamespace = {
		blue_box: "value1",
	};

	const enCommon = {
		foo_bar: "value2",
	};

	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(enNoNamespace)),
			},
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(enCommon)),
				toBeImportedFilesMetadata: {
					namespace: "common",
				},
			},
		],
	});

	const newBundle: Bundle = {
		id: "new_bundle",
		declarations: [],
	};

	const newMessage: Message = {
		id: "mock-29jas",
		bundleId: "new_bundle",
		locale: "en",
		selectors: [],
	};

	const newVariant: Variant = {
		id: "mock-111sss",
		matches: [],
		messageId: "mock-29jas",
		pattern: [{ type: "text", value: "elephant" }],
	};

	const exported = await runExportFiles({
		bundles: [...imported.bundles, newBundle],
		messages: [...imported.messages, newMessage],
		variants: [...imported.variants, newVariant],
	});

	const exportedNoNamespace = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.name === "en.json")?.content
		)
	);

	const exportedCommon = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.name === "common-en.json")?.content
		)
	);

	expect(exportedNoNamespace).toStrictEqual({
		blue_box: "value1",
		new_bundle: "elephant",
	});

	expect(exportedCommon).toStrictEqual({
		foo_bar: "value2",
	});
});

test("a key with a single variant should have no matches even if other keys are multi variant", async () => {
	const imported = await runImportFiles({
		key: "value",
		keyPluralSimple_one: "the singular",
		keyPluralSimple_other: "the plural",
	});

	expect(await runExportFilesParsed(imported)).toStrictEqual({
		key: "value",
		keyPluralSimple_one: "the singular",
		keyPluralSimple_other: "the plural",
	});

	expect(imported.bundles).lengthOf(2);
	expect(imported.messages).lengthOf(3);
	expect(imported.variants).lengthOf(3);

	expect(imported.bundles[0]?.id).toStrictEqual("key");

	expect(imported.messages[0]?.selectors).toStrictEqual([]);
	expect(imported.variants[0]?.matches).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "value" },
	]);
});

// https://github.com/opral/inlang-paraglide-js/issues/513
test("custom variable reference patterns can be provided", async () => {
	const settings = {
		"plugin.inlang.i18next": {
			variableReferencePattern: ["<", ">"],
		},
	};

	const imported = await runImportFiles(
		{
			blue: "blue {{blue}}",
			red: "red <red>",
		},
		settings
	);

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "blue {{blue}}" },
	] satisfies Pattern);
	expect(imported.variants[1]?.pattern).toStrictEqual([
		{ type: "text", value: "red " },
		{ type: "expression", arg: { type: "variable-reference", name: "red" } },
	] satisfies Pattern);

	expect(await runExportFilesParsed(imported, settings)).toStrictEqual({
		blue: "blue {{blue}}",
		red: "red <red>",
	});
});

test("markup conflicts with angle bracket variable reference pattern", async () => {
	const settings = {
		"plugin.inlang.i18next": {
			variableReferencePattern: ["<", ">"],
		},
	};

	const imported = {
		bundles: [{ id: "rich", declarations: [] }],
		messages: [
			{
				id: "rich-en",
				bundleId: "rich",
				locale: "en",
				selectors: [],
			},
		],
		variants: [
			{
				id: "rich-en-default",
				messageId: "rich-en",
				matches: [],
				pattern: [
					{ type: "text", value: "Click " },
					{ type: "markup-start", name: "link" },
					{ type: "text", value: "here" },
					{ type: "markup-end", name: "link" },
				],
			},
		],
	};

	await expect(runExportFiles(imported as any, settings)).rejects.toThrow(
		"Cannot serialize markup when variableReferencePattern is '<' and '>' because both syntaxes would conflict."
	);
});

// convenience wrapper for less testing code
function runImportFiles(json: Record<string, any>, settings?: any) {
	return importFiles({
		settings: settings ?? {},
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(json)),
			},
		],
	});
}

// convenience wrapper for less testing code
async function runExportFiles(
	imported: Awaited<ReturnType<typeof importFiles>>,
	settings?: any
) {
	// add ids which are undefined from the import
	for (const message of imported.messages) {
		if (message.id === undefined) {
			message.id = `${Math.random() * 1000}`;
		}
	}
	for (const variant of imported.variants) {
		if (variant.id === undefined) {
			// @ts-expect-error - variant is an VariantImport
			variant.id = `${Math.random() * 1000}`;
		}
		if (variant.messageId === undefined) {
			// @ts-expect-error - variant is an VariantImport
			variant.messageId = imported.messages.find(
				(m: any) =>
					m.bundleId === variant.messageBundleId &&
					m.locale === variant.messageLocale
			)?.id;
		}
	}

	const exported = await exportFiles({
		settings: settings ?? {},
		bundles: imported.bundles as Bundle[],
		messages: imported.messages as Message[],
		variants: imported.variants as Variant[],
	});
	return exported;
}

// convenience wrapper for less testing code
async function runExportFilesParsed(imported: any, settings?: any) {
	const exported = await runExportFiles(imported, settings);
	return JSON.parse(new TextDecoder().decode(exported[0]?.content));
}
