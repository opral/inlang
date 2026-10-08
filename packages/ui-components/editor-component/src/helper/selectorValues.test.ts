import { expect, it } from "vitest";
import { missingVariants, selectorGroups } from "@inlang/sdk/browser";
import plugin from "@inlang/plugin-icu1";
import type { Declaration, Pattern } from "@inlang/sdk";
import {
	addExactNumber,
	addSelectValue,
	removeExactNumber,
	removeSelectValue,
	type SelectorBundle,
} from "./addSelector.js";

let n = 0;
const createId = () => `new${++n}`;

type Bundle = SelectorBundle & { id: string };
const settings = {
	baseLocale: "en",
	locales: ["en", "de"],
	"plugin.inlang.icu-messageformat-1": { pathPattern: "{locale}.json" },
};

/** Imports ICU JSON per locale with `@inlang/plugin-icu1` into one nested bundle per key. */
async function importIcu(files: Record<string, Record<string, string>>) {
	const imported = await plugin.importFiles!({
		files: Object.entries(files).map(([locale, messages]) => ({
			locale,
			content: new TextEncoder().encode(JSON.stringify(messages)),
		})),
		settings,
	} as never);
	return imported.bundles.map(
		(bundle): Bundle => ({
			id: bundle.id!,
			declarations: bundle.declarations as Declaration[],
			messages: imported.messages
				.filter((message) => message.bundleId === bundle.id)
				.map((message) => ({
					id: `${bundle.id}_${message.locale}`,
					locale: message.locale,
					selectors: message.selectors ?? [],
					variants: imported.variants
						.filter(
							(variant) =>
								"messageBundleId" in variant &&
								variant.messageBundleId === bundle.id &&
								variant.messageLocale === message.locale
						)
						.map((variant) => ({
							id: createId(),
							matches: variant.matches!,
							pattern: variant.pattern!,
						})),
				})),
		})
	);
}

/** Exports nested bundles with `@inlang/plugin-icu1` back to ICU JSON per locale. */
async function exportIcu(bundles: Bundle[]) {
	const files = await plugin.exportFiles!({
		bundles: bundles.map(({ id, declarations }) => ({ id, declarations })),
		messages: bundles.flatMap((bundle) =>
			bundle.messages.map((message) => ({
				id: message.id,
				bundleId: bundle.id,
				locale: message.locale!,
				selectors: message.selectors,
			}))
		),
		variants: bundles.flatMap((bundle) =>
			bundle.messages.flatMap((message) =>
				message.variants.map((variant) => ({
					...variant,
					messageId: message.id,
				}))
			)
		),
		settings,
	} as never);
	return Object.fromEntries(
		files.map((file) => [
			file.locale,
			JSON.parse(new TextDecoder().decode(file.content)),
		])
	);
}

const text = (value: string): Pattern => [{ type: "text", value }];
/** Fills the empty forms an action added, per locale. */
function fill(bundle: Bundle, texts: Record<string, string>): Bundle {
	return {
		...bundle,
		messages: bundle.messages.map((message) => ({
			...message,
			variants: message.variants.map((variant) =>
				variant.pattern.length === 0
					? { ...variant, pattern: text(texts[message.locale!]!) }
					: variant
			),
		})),
	};
}
const missing = (bundle: Bundle, locale: string) => {
	const message = bundle.messages.find((m) => m.locale === locale)!;
	const reference = bundle.messages.find((m) => m.locale === "en")!;
	return missingVariants({ ...message, locale }, bundle.declarations, {
		referenceVariants: reference.variants,
	}).map((form) =>
		form.map((m) => (m.type === "literal-match" ? m.value : "*")).join(" · ")
	);
};

const items = {
	en: { items: "{count, plural, one {# item} other {# items}}" },
	de: { items: "{count, plural, one {# Element} other {# Elemente}}" },
};

it("adds an exact number to the reference in the shape ICU imports and exports; other languages need it", async () => {
	const [bundle] = await importIcu(items);
	const zero = addExactNumber(bundle!, {
		selector: "count",
		value: 0,
		locale: "en",
		createId,
	});
	expect(zero.declarations).toContainEqual({
		type: "local-variable",
		name: "countPluralExact",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
	});
	for (const message of zero.messages)
		expect(message.selectors.map((s) => s.name)).toEqual([
			"countPluralExact",
			"countPlural",
		]);
	// only the reference gets the (empty) form; German keeps its two forms and needs "0"
	const [en, de] = zero.messages;
	expect(en!.variants).toHaveLength(3);
	expect(en!.variants.filter((v) => v.pattern.length === 0)).toHaveLength(1);
	expect(de!.variants).toHaveLength(2);
	expect(
		selectorGroups({ ...de!, locale: "de" }, zero.declarations, {
			referenceVariants: en!.variants,
		})[0]!.keys
	).toEqual(["0", "one", "*"]);
	expect(missing(zero, "en")).toEqual([]);
	expect(missing(zero, "de")).toEqual(["0 · *"]);
	// the untranslated =0 is absent from the export, not an empty text
	const english = fill(zero, { en: "No items" });
	expect(await exportIcu([english])).toEqual({
		en: {
			items: "{count, plural, =0 {No items} one {# item} other {# items}}",
		},
		de: items.de,
	});
	// once German has the form too, both export it
	const translated = {
		...english,
		messages: english.messages.map((m) =>
			m.locale === "de"
				? {
						...m,
						variants: [
							{
								...m.variants[0]!,
								id: createId(),
								matches: [
									{
										type: "literal-match" as const,
										key: "countPluralExact",
										value: "0",
									},
									{ type: "catchall-match" as const, key: "countPlural" },
								],
								pattern: text("Keine Elemente"),
							},
							...m.variants,
						],
					}
				: m
		),
	};
	expect(missing(translated, "de")).toEqual([]);
	const exported = await exportIcu([translated]);
	expect(exported.de.items).toBe(
		"{count, plural, =0 {Keine Elemente} one {# Element} other {# Elemente}}"
	);
	const [again] = await importIcu(exported);
	expect(again!.declarations).toEqual(zero.declarations);
	expect(again!.messages.map((m) => m.selectors)).toEqual(
		zero.messages.map((m) => m.selectors)
	);
	// a second number reuses the exact selector; removing both (in every language) removes it again
	const one = addExactNumber(again!, {
		selector: "countPlural",
		value: "=1",
		locale: "en",
		createId,
	});
	expect(one.declarations).toEqual(again!.declarations);
	expect(one.messages.map((m) => m.variants.length)).toEqual([4, 3]);
	const withoutZero = removeExactNumber(one, { selector: "count", value: 0 });
	expect(withoutZero.messages.map((m) => m.variants.length)).toEqual([3, 2]);
	expect(withoutZero.messages[0]!.selectors).toHaveLength(2);
	const plain = removeExactNumber(withoutZero, { selector: "count", value: 1 });
	expect(plain.declarations.map((d) => d.name)).toEqual([
		"count",
		"countPlural",
	]);
	expect(await exportIcu([plain])).toEqual(items);
	expect(() =>
		addExactNumber(bundle!, { selector: "count", value: 0, locale: "fr" })
	).toThrow(/no selector/);
});

it("adds the exact number to every combination of the other selectors", async () => {
	const [bundle] = await importIcu({
		en: {
			invite:
				"{gender, select, female {{count, plural, one {She invited # guest} other {She invited # guests}}} other {{count, plural, one {They invited # guest} other {They invited # guests}}}}",
		},
	});
	const zero = addExactNumber(bundle!, {
		selector: "count",
		value: 0,
		locale: "en",
		createId,
	});
	const en = zero.messages[0]!;
	expect(en.selectors.map((s) => s.name)).toEqual([
		"gender",
		"countPluralExact",
		"countPlural",
	]);
	expect(en.variants).toHaveLength(6);
	expect(missing(zero, "en")).toEqual([]);
	const exported = await exportIcu([fill(zero, { en: "Nobody was invited" })]);
	expect(exported.en.invite).toBe(
		"{gender, select, female {{count, plural, =0 {Nobody was invited} one {She invited # guest} other {She invited # guests}}} other {{count, plural, =0 {Nobody was invited} one {They invited # guest} other {They invited # guests}}}}"
	);
	expect(() =>
		addExactNumber(zero, { selector: "gender", value: 0, locale: "en" })
	).toThrow(/not a plural/);
	expect(() =>
		addExactNumber(zero, { selector: "count", value: "few", locale: "en" })
	).toThrow(/not a number/);
	expect(() =>
		removeExactNumber(zero, { selector: "count", value: 7 })
	).toThrow(/not an exact number/);
});

it("adds a select value to the reference, other languages need it, removing removes it everywhere", async () => {
	const [bundle] = await importIcu({
		en: { greeting: "{gender, select, female {She} male {He} other {They}}" },
		de: { greeting: "{gender, select, female {Sie} male {Er} other {Sie}}" },
	});
	const diverse = addSelectValue(bundle!, {
		selector: "gender",
		value: " diverse ",
		locale: "en",
		createId,
	});
	const keys = (locale: string, b = diverse) =>
		b.messages
			.find((m) => m.locale === locale)!
			.variants.map((v) =>
				v.matches[0]?.type === "literal-match" ? v.matches[0].value : "*"
			);
	expect(keys("en")).toEqual(["female", "male", "diverse", "*"]);
	expect(keys("de")).toEqual(["female", "male", "*"]);
	expect(missing(diverse, "de")).toEqual(["diverse"]);
	// adding it again changes nothing
	expect(
		addSelectValue(diverse, {
			selector: "gender",
			value: "diverse",
			locale: "en",
			createId,
		})
	).toEqual(diverse);
	// German exports without an empty "diverse"
	expect(await exportIcu([fill(diverse, { en: "They" })])).toEqual({
		en: {
			greeting:
				"{gender, select, female {She} male {He} diverse {They} other {They}}",
		},
		de: {
			greeting: "{gender, select, female {Sie} male {Er} other {Sie}}",
		},
	});
	const removed = removeSelectValue(diverse, {
		selector: "gender",
		value: "male",
	});
	expect(keys("en", removed)).toEqual(["female", "diverse", "*"]);
	expect(keys("de", removed)).toEqual(["female", "*"]);
	expect(missing(removed, "de")).toEqual(["diverse"]);
	expect(() =>
		removeSelectValue(removed, { selector: "gender", value: "male" })
	).toThrow(/not a value/);
	expect(() =>
		addSelectValue(removed, { selector: "gender", value: "*", locale: "en" })
	).toThrow(/cannot be a value/);
});

it("does not add select values to a plural or its exact-number selector", async () => {
	const [bundle] = await importIcu({
		en: { items: "{count, plural, =0 {none} one {# item} other {# items}}" },
	});
	expect(() =>
		addSelectValue(bundle!, {
			selector: "countPlural",
			value: "few",
			locale: "en",
		})
	).toThrow(/chooses by number/);
	expect(() =>
		addSelectValue(bundle!, {
			selector: "countPluralExact",
			value: "5",
			locale: "en",
		})
	).toThrow(/chooses by number/);
	expect(() =>
		addSelectValue(bundle!, { selector: "nope", value: "x", locale: "en" })
	).toThrow(/not a selector/);
});
