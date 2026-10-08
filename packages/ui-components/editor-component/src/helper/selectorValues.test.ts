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

it("adds an exact number in every language in the shape ICU imports and exports", async () => {
	const [bundle] = await importIcu(items);
	const zero = addExactNumber(bundle!, {
		selector: "count",
		value: 0,
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
	for (const message of zero.messages) {
		expect(message.selectors.map((s) => s.name)).toEqual([
			"countPluralExact",
			"countPlural",
		]);
		expect(message.variants).toHaveLength(3);
	}
	// one choice, and every language now needs the =0 form, which exists (empty)
	const de = zero.messages[1]!;
	expect(
		selectorGroups({ ...de, locale: "de" }, zero.declarations)[0]!.keys
	).toEqual(["0", "one", "*"]);
	expect(missing(zero, "de")).toEqual([]);
	// export -> import is lossless
	const exported = await exportIcu([
		fill(zero, { en: "No items", de: "Keine Elemente" }),
	]);
	expect(exported).toEqual({
		en: {
			items: "{count, plural, =0 {No items} one {# item} other {# items}}",
		},
		de: {
			items:
				"{count, plural, =0 {Keine Elemente} one {# Element} other {# Elemente}}",
		},
	});
	const [again] = await importIcu(exported);
	expect(again!.declarations).toEqual(zero.declarations);
	expect(again!.messages.map((m) => m.selectors)).toEqual(
		zero.messages.map((m) => m.selectors)
	);
	// a second number reuses the exact selector; removing both removes it again
	const one = addExactNumber(again!, {
		selector: "countPlural",
		value: "=1",
		createId,
	});
	expect(one.declarations).toEqual(again!.declarations);
	expect(one.messages[0]!.variants).toHaveLength(4);
	const withoutZero = removeExactNumber(one, { selector: "count", value: 0 });
	expect(withoutZero.messages[0]!.selectors).toHaveLength(2);
	const plain = removeExactNumber(withoutZero, { selector: "count", value: 1 });
	expect(plain.declarations.map((d) => d.name)).toEqual([
		"count",
		"countPlural",
	]);
	expect(await exportIcu([plain])).toEqual(items);
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
	expect(() => addExactNumber(zero, { selector: "gender", value: 0 })).toThrow(
		/not a plural/
	);
	expect(() =>
		addExactNumber(zero, { selector: "count", value: "few" })
	).toThrow(/not a number/);
	expect(() =>
		removeExactNumber(zero, { selector: "count", value: 7 })
	).toThrow(/not an exact number/);
});

it("adds and removes a value of a select in every language", async () => {
	const [bundle] = await importIcu({
		en: { greeting: "{gender, select, female {She} male {He} other {They}}" },
		de: { greeting: "{gender, select, female {Sie} male {Er} other {Sie}}" },
	});
	const diverse = addSelectValue(bundle!, {
		selector: "gender",
		value: " diverse ",
		createId,
	});
	for (const message of diverse.messages)
		expect(message.variants.map((v) => v.matches[0])).toEqual([
			{ type: "literal-match", key: "gender", value: "female" },
			{ type: "literal-match", key: "gender", value: "male" },
			{ type: "literal-match", key: "gender", value: "diverse" },
			{ type: "catchall-match", key: "gender" },
		]);
	// adding it again changes nothing
	expect(
		addSelectValue(diverse, { selector: "gender", value: "diverse", createId })
	).toEqual(diverse);
	expect(await exportIcu([fill(diverse, { en: "They", de: "Sie" })])).toEqual({
		en: {
			greeting:
				"{gender, select, female {She} male {He} diverse {They} other {They}}",
		},
		de: {
			greeting:
				"{gender, select, female {Sie} male {Er} diverse {Sie} other {Sie}}",
		},
	});
	// a value only the reference has is needed in the translation
	const onlyEnglish = {
		...diverse,
		messages: diverse.messages.map((m) =>
			m.locale === "de"
				? {
						...m,
						variants: m.variants.filter(
							(v) =>
								v.matches[0]?.type !== "literal-match" ||
								v.matches[0].value !== "diverse"
						),
					}
				: m
		),
	};
	expect(missing(onlyEnglish, "de")).toEqual(["diverse"]);
	const removed = removeSelectValue(diverse, {
		selector: "gender",
		value: "male",
	});
	expect(removed.messages[1]!.variants.map((v) => v.matches[0])).toEqual([
		{ type: "literal-match", key: "gender", value: "female" },
		{ type: "literal-match", key: "gender", value: "diverse" },
		{ type: "catchall-match", key: "gender" },
	]);
	expect(missing(removed, "de")).toEqual([]);
	expect(() =>
		removeSelectValue(removed, { selector: "gender", value: "male" })
	).toThrow(/not a value/);
	expect(() =>
		addSelectValue(removed, { selector: "gender", value: "*" })
	).toThrow(/cannot be a value/);
});

it("does not add select values to a plural or its exact-number selector", async () => {
	const [bundle] = await importIcu({
		en: { items: "{count, plural, =0 {none} one {# item} other {# items}}" },
	});
	expect(() =>
		addSelectValue(bundle!, { selector: "countPlural", value: "few" })
	).toThrow(/chooses by number/);
	expect(() =>
		addSelectValue(bundle!, { selector: "countPluralExact", value: "5" })
	).toThrow(/chooses by number/);
	expect(() =>
		addSelectValue(bundle!, { selector: "nope", value: "x" })
	).toThrow(/not a selector/);
});
