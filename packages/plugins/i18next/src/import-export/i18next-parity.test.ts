import { expect, test } from "vitest";
import i18next from "i18next";
import type { Bundle, Message, Variant } from "@inlang/sdk";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

// Upstream fixtures: i18next/i18next@edaea71b729aa54dc35d5e7dfea72b2b12f24a61
// test/runtime/translator/translator.translate.plural.test.js
// test/runtime/translator/translator.translate.context.test.js
// Additional cases exercise sparse resources and suffix ambiguity. Expected
// lookup results come from the real, pinned i18next dev dependency.
type Resources = Record<string, Record<string, string>>;
type Imported = Awaited<ReturnType<typeof importFiles>>;
type Inputs = Record<string, string | number | boolean>;

async function setup(resources: Resources, contextValues?: string[]) {
	const runtime = i18next.createInstance();
	await runtime.init({
		lng: Object.keys(resources)[0],
		fallbackLng: false,
		resources: Object.fromEntries(
			Object.entries(resources).map(([locale, translation]) => [
				locale,
				{ translation },
			])
		),
	});
	const imported = await importFiles({
		settings: {
			baseLocale: Object.keys(resources)[0]!,
			locales: Object.keys(resources),
			"plugin.inlang.i18next": {
				pathPattern: "./locales/{locale}.json",
				contextValues,
			},
		},
		files: Object.entries(resources).map(([locale, json]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
	});
	return { runtime, imported };
}

// Evaluate only the MF2 subset produced by this importer: input variables,
// Intl plural locals, literal/catchall matches and interpolated text. This is
// independent of i18next key parsing and makes first-match behavior observable.
function evaluate(
	imported: Imported,
	root: string,
	locale: string,
	inputs: Inputs
) {
	const bundle = imported.bundles.find((bundle) => bundle.id === root);
	if (!bundle) throw new Error(`Missing imported bundle: ${root}`);
	// Adapt i18next's boolean ordinal option to the documented MF2 input.
	const variables: Inputs = {
		...inputs,
		pluralType: inputs.ordinal ? "ordinal" : "cardinal",
	};
	for (const declaration of bundle.declarations ?? []) {
		if (declaration.type !== "local-variable") continue;
		const expression = declaration.value;
		if (
			expression.type !== "expression" ||
			expression.arg.type !== "variable-reference" ||
			expression.annotation?.name !== "plural"
		)
			throw new Error("Unsupported test expression");
		const typeOption = expression.annotation.options.find(
			(option) => option.name === "type"
		)?.value;
		const pluralType =
			typeOption?.type === "variable-reference"
				? variables[typeOption.name]
				: typeOption?.value;
		const ordinal = pluralType === "ordinal";
		variables[declaration.name] = new Intl.PluralRules(locale, {
			type: ordinal ? "ordinal" : "cardinal",
		}).select(Number(variables[expression.arg.name]));
	}
	const variant = imported.variants.find(
		(variant) =>
			variant.messageBundleId === root &&
			variant.messageLocale === locale &&
			variant.matches?.every(
				(match) =>
					match.type === "catchall-match" ||
					String(variables[match.key]) === match.value
			)
	);
	if (!variant)
		throw new Error(`No matching imported variant: ${root}/${locale}`);
	if (!variant.pattern) throw new Error("Missing imported pattern");
	return variant.pattern
		.map((part) => {
			if (part.type === "text") return part.value;
			if (
				part.type === "expression" &&
				part.arg.type === "variable-reference"
			) {
				return String(variables[part.arg.name]);
			}
			throw new Error("Unsupported test pattern");
		})
		.join("");
}

async function expectLookup(
	resources: Resources,
	root: string,
	locale: string,
	inputs: Inputs,
	expected: string,
	contextValues?: string[]
) {
	const { runtime, imported } = await setup(resources, contextValues);
	expect(runtime.t(root, { lng: locale, ...inputs })).toBe(expected);
	expect(evaluate(imported, root, locale, inputs)).toBe(expected);
	return imported;
}

test("upstream: underscored root with ordinal plurals", async () => {
	await expectLookup(
		{
			en: {
				pos_test_ordinal_one: "pos_test_en_one",
				pos_test_ordinal_other: "pos_test_en_other",
			},
		},
		"pos_test",
		"en",
		{ count: 1, ordinal: true },
		"pos_test_en_one"
	);
});

test("underscored root with two contexts", async () => {
	await expectLookup(
		{
			en: {
				key_separator_context_male: "male value",
				key_separator_context_female: "female value",
			},
		},
		"key_separator_context",
		"en",
		{ context: "male" },
		"male value"
	);
});

test("underscored root with one context and no base key", async () => {
	await expectLookup(
		{ en: { key_separator_context_male: "male value" } },
		"key_separator_context",
		"en",
		{ context: "male" },
		"male value",
		["male"]
	);
});

test("single context needs no base key or second context", async () => {
	await expectLookup(
		{ en: { friend_male: "boyfriend" } },
		"friend",
		"en",
		{ context: "male" },
		"boyfriend",
		["male"]
	);
});

test("single context with cardinal plurals", async () => {
	await expectLookup(
		{
			en: {
				friend_male_one: "one boyfriend",
				friend_male_other: "{{count}} boyfriends",
			},
		},
		"friend",
		"en",
		{ context: "male", count: 2 },
		"2 boyfriends",
		["male"]
	);
});

test("single context with ordinal plurals", async () => {
	await expectLookup(
		{
			en: {
				race_male_ordinal_one: "his {{count}}st race",
				race_male_ordinal_other: "his {{count}}th race",
			},
		},
		"race",
		"en",
		{ context: "male", count: 1, ordinal: true },
		"his 1st race",
		["male"]
	);
});

test("upstream: a single month context can contain cardinal and ordinal forms", async () => {
	await expectLookup(
		{
			en: {
				oTest_month_ordinal_one: "Every {{count}}st month (ctx)",
				oTest_month_one: "Every month (ctx)",
			},
		},
		"oTest",
		"en",
		{ count: 1, ordinal: true, context: "month" },
		"Every 1st month (ctx)",
		["month"]
	);
});

test("context classification stays consistent across sparse locales", async () => {
	const resources = {
		en: { friend_male_one: "his", friend_female_one: "hers" },
		de: { friend_male_one: "sein" },
	};
	const imported = await expectLookup(
		resources,
		"friend",
		"de",
		{ context: "male", count: 1 },
		"sein"
	);
	expect(imported.bundles.map((bundle) => bundle.id)).toEqual(["friend"]);
});

test("context values can contain underscores", async () => {
	await expectLookup(
		{
			en: {
				friend: "friend",
				friend_male_formal: "formal boyfriend",
				friend_female_formal: "formal girlfriend",
			},
		},
		"friend",
		"en",
		{ context: "male_formal" },
		"formal boyfriend",
		["male_formal"]
	);
});

test("base key remains the fallback for missing contexts", async () => {
	await expectLookup(
		{
			en: {
				friend: "friend",
				friend_male: "boyfriend",
			},
		},
		"friend",
		"en",
		{ context: "unknown" },
		"friend"
	);
});

test("ordinal zero is not an English exact-zero override", async () => {
	await expectLookup(
		{
			en: {
				rank_ordinal_zero: "ordinal zero",
				rank_ordinal_other: "ordinal other",
			},
		},
		"rank",
		"en",
		{ count: 0, ordinal: true },
		"ordinal other"
	);
});

test("Welsh ordinal zero matches nonzero counts too", async () => {
	await expectLookup(
		{
			cy: {
				rank_ordinal_zero: "ordinal zero",
				rank_ordinal_other: "ordinal other",
			},
		},
		"rank",
		"cy",
		{ count: 7, ordinal: true },
		"ordinal zero"
	);
});

test("mixed cardinal and ordinal lookups select their own plural type", async () => {
	const resources = {
		en: {
			rank_one: "cardinal one",
			rank_other: "cardinal other",
			rank_ordinal_one: "ordinal one",
			rank_ordinal_other: "ordinal other",
		},
	};
	await expectLookup(resources, "rank", "en", { count: 1 }, "cardinal one");
	await expectLookup(
		resources,
		"rank",
		"en",
		{ count: 1, ordinal: true },
		"ordinal one"
	);
});

test("roundtrip preserves cardinal zero beside ordinal zero", async () => {
	const resources = {
		cy: {
			rank_zero: "cardinal zero",
			rank_other: "cardinal other",
			rank_ordinal_zero: "ordinal zero",
			rank_ordinal_other: "ordinal other",
		},
	};
	const { runtime, imported } = await setup(resources);
	// Assign deterministic SDK identities; merge per-key message imports in
	// the same bundle/locale, as persisted SDK messages do.
	const messages = [
		...new Map(
			imported.messages.map((message) => [
				`${message.bundleId}/${message.locale}`,
				message,
			])
		).values(),
	].map((message, index) => ({ ...message, id: `message-${index}` }));
	const variants = imported.variants.map((variant, index) => ({
		...variant,
		id: `variant-${index}`,
		messageId: messages.find(
			(message) =>
				message.bundleId === variant.messageBundleId &&
				message.locale === variant.messageLocale
		)!.id,
	}));
	const exported = await exportFiles({
		settings: {
			baseLocale: "cy",
			locales: ["cy"],
			"plugin.inlang.i18next": { pathPattern: "./locales/{locale}.json" },
		},
		bundles: imported.bundles as Bundle[],
		messages: messages as Message[],
		variants: variants as Variant[],
	});
	const json = JSON.parse(new TextDecoder().decode(exported[0]!.content));
	const after = i18next.createInstance();
	await after.init({
		lng: "cy",
		fallbackLng: false,
		resources: { cy: { translation: json } },
	});
	expect(after.t("rank", { count: 0 })).toBe(runtime.t("rank", { count: 0 }));
	expect(json).toEqual(resources.cy);
});

test("empty context values preserve literal context-like keys", async () => {
	await expectLookup(
		{ en: { status_open: "open", status_closed: "closed" } },
		"status_open",
		"en",
		{},
		"open",
		[]
	);
});

test("omitted context values preserve ambiguous singleton roots", async () => {
	await expectLookup(
		{ en: { key_separator_context: "literal" } },
		"key_separator_context",
		"en",
		{},
		"literal"
	);
});

test("the longest configured context suffix wins", async () => {
	const imported = await expectLookup(
		{ en: { friend_male_formal_one: "formal boyfriend" } },
		"friend",
		"en",
		{ context: "male_formal", count: 1 },
		"formal boyfriend",
		["formal", "male_formal"]
	);
	expect(imported.bundles.map((bundle) => bundle.id)).toEqual(["friend"]);
});

test("context inference does not cross namespace boundaries", async () => {
	const imported = await importFiles({
		settings: {
			baseLocale: "en",
			locales: ["en"],
			"plugin.inlang.i18next": { pathPattern: "./{namespace}/{locale}.json" },
		},
		files: [
			{
				namespace: "a",
				json: { friend_male: "male", friend_female: "female" },
			},
			{ namespace: "b", json: { friend_male: "literal" } },
		].map(({ namespace, json }) => ({
			locale: "en",
			toBeImportedFilesMetadata: { namespace },
			content: new TextEncoder().encode(JSON.stringify(json)),
		})),
	});
	expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
		"a:friend",
		"b:friend_male",
	]);
});

test("mixed plural selection is independent of resource order", async () => {
	for (const entries of [
		[
			["rank_one", "cardinal"],
			["rank_ordinal_one", "ordinal"],
		],
		[
			["rank_ordinal_one", "ordinal"],
			["rank_one", "cardinal"],
		],
	]) {
		const resources = { en: Object.fromEntries(entries) };
		await expectLookup(resources, "rank", "en", { count: 1 }, "cardinal");
		await expectLookup(
			resources,
			"rank",
			"en",
			{ count: 1, ordinal: true },
			"ordinal"
		);
	}
});

test("missing ordinal suffixes use the ordinal category for cardinal-key fallback", async () => {
	const resources = {
		ar: {
			rank_one: "cardinal one",
			rank_other: "suffix fallback",
			rank_ordinal_one: "ordinal one",
		},
	};
	await expectLookup(resources, "rank", "ar", { count: 1 }, "cardinal one");
	await expectLookup(
		resources,
		"rank",
		"ar",
		{ count: 1, ordinal: true },
		"suffix fallback"
	);
});

test("mixed Welsh zero keeps exact cardinal zero separate from ordinal categories", async () => {
	const resources = {
		cy: {
			rank_zero: "cardinal zero",
			rank_other: "cardinal other",
			rank_ordinal_zero: "ordinal zero",
			rank_ordinal_other: "ordinal other",
		},
	};
	await expectLookup(resources, "rank", "cy", { count: 0 }, "cardinal zero");
	await expectLookup(
		resources,
		"rank",
		"cy",
		{ count: 0, ordinal: true },
		"ordinal zero"
	);
	await expectLookup(
		resources,
		"rank",
		"cy",
		{ count: 7, ordinal: true },
		"ordinal zero"
	);
});

test.each(["en", "fr", "ar", "cy", "lv"])(
	"one zero source branch preserves cardinal and ordinal fallback lookups in %s",
	async (locale) => {
		const resource = {
			rank: "base",
			rank_zero: "cardinal zero",
			rank_one: "cardinal one",
			rank_other: "cardinal other",
			rank_ordinal_one: "ordinal one",
			rank_ordinal_other: "ordinal other",
			rank_male: "context base",
			rank_male_zero: "context cardinal zero",
			rank_male_other: "context cardinal other",
			rank_male_ordinal_other: "context ordinal other",
		};
		const { runtime, imported } = await setup({ [locale]: resource });
		for (const count of [0, 1, 2, 3, 10, 11, 19, 20, 21, 100, 0.5]) {
			for (const ordinal of [false, true]) {
				for (const context of [undefined, "male", "unknown"]) {
					const inputs = {
						count,
						ordinal,
						...(context === undefined ? {} : { context }),
					};
					expect(
						evaluate(imported, "rank", locale, inputs),
						JSON.stringify({ locale, ...inputs })
					).toBe(runtime.t("rank", { lng: locale, ...inputs }));
				}
			}
		}
		expect(
			imported.variants.filter((variant) =>
				variant.pattern?.some(
					(part) => part.type === "text" && part.value === resource.rank_zero
				)
			)
		).toHaveLength(1);
	}
);
