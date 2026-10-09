import { expect, test } from "vitest";
import type { Declaration, Pattern } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import { checkTranslation } from "./translations.js";
import {
	isPluralSelector,
	missingVariants,
	pluralRules,
	requiredVariants,
	variantCovers,
} from "./selectors.js";

// Review fixes of the translation rules: per-variant comparison, dropped selectors,
// rare plural categories and number selectors.

const v = (name: string) => ({
	type: "expression" as const,
	arg: { type: "variable-reference" as const, name },
});
const t = (value: string) => ({ type: "text" as const, value });
const local = (
	name: string,
	input: string,
	annotation?: string
): Declaration => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: input },
		...(annotation
			? {
					annotation: {
						type: "function-reference",
						name: annotation,
						options: [],
					},
				}
			: {}),
	},
});
const plural: Declaration[] = [
	{ type: "input-variable", name: "count" },
	{ type: "input-variable", name: "folder" },
	{ type: "input-variable", name: "gender" },
	{ type: "input-variable", name: "hasName" },
	{ type: "input-variable", name: "name" },
	local("countPlural", "count", "plural"),
	local("countPluralExact", "count"),
];
const match = (key: string, value: string): Match =>
	value === "*"
		? { type: "catchall-match", key }
		: { type: "literal-match", key, value };
/** A message with variants given as "key=value,key=value" -> pattern. */
const message = (
	locale: string,
	selectors: string[],
	forms: Record<string, Pattern>
) => ({
	id: `m-${locale}`,
	locale,
	selectors: selectors.map((name) => ({
		type: "variable-reference" as const,
		name,
	})),
	variants: Object.entries(forms).map(([form, pattern]) => ({
		id: `${locale}:${form}`,
		matches: form
			? form.split(",").map((pair) => {
					const [key, value] = pair.split("=");
					return match(key!, value!);
				})
			: [],
		pattern,
	})),
});
const types = (issues: { type: string }[]) => issues.map((issue) => issue.type);

test("variables are compared with the reference form that has the same matches", () => {
	const reference = message("en", ["hasName"], {
		"hasName=true": [t("Hello "), v("name")],
		"hasName=*": [t("Hello")],
	});
	const target = message("de", ["hasName"], {
		"hasName=true": [t("Hallo "), v("name")],
		"hasName=*": [t("Hallo")],
	});
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[]
	);
	// without a matching reference form, every reference variable is expected
	const extra = message("de", ["hasName"], {
		"hasName=true": [t("Hallo "), v("name")],
		"hasName=false": [t("Hallo")],
		"hasName=*": [t("Hallo")],
	});
	expect(
		checkTranslation({ reference, target: extra, declarations: plural })
	).toEqual([
		{ type: "missing-variable", name: "name", variantId: "de:hasName=false" },
	]);
});

test("a form for one number may only leave out the number it selects on", () => {
	const reference = message("en", ["countPluralExact", "countPlural"], {
		"countPluralExact=0,countPlural=*": [t("No files in "), v("folder")],
		"countPluralExact=*,countPlural=one": [
			v("count"),
			t(" file in "),
			v("folder"),
		],
		"countPluralExact=*,countPlural=*": [
			v("count"),
			t(" files in "),
			v("folder"),
		],
	});
	const target = message("de", ["countPluralExact", "countPlural"], {
		"countPluralExact=0,countPlural=*": [t("Keine Dateien")],
		"countPluralExact=*,countPlural=one": [t("Eine Datei in "), v("folder")],
		"countPluralExact=*,countPlural=*": [
			v("count"),
			t(" Dateien in "),
			v("folder"),
		],
	});
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[
			{
				type: "missing-variable",
				name: "folder",
				variantId: "de:countPluralExact=0,countPlural=*",
			},
		]
	);
});

test("an empty reference expects no variables and knows none", () => {
	const reference = message("en", [], { "": [] });
	const target = message("de", [], { "": [t("Hallo "), v("name")] });
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[]
	);
});

test("a translation that drops the reference's selector is reported", () => {
	const reference = message("en", ["gender"], {
		"gender=female": [t("She")],
		"gender=*": [t("They")],
	});
	expect(
		checkTranslation({
			reference,
			target: message("de", [], { "": [t("Sie")] }),
			declarations: plural,
		})
	).toEqual([
		{ type: "missing-selector", selector: "gender", input: "gender" },
	]);
	// a plural: Russian needs it, Japanese doesn't
	const files = message("en", ["countPlural"], {
		"countPlural=one": [v("count"), t(" file")],
		"countPlural=*": [v("count"), t(" files")],
	});
	expect(
		types(
			checkTranslation({
				reference: files,
				target: message("ru", [], { "": [v("count"), t(" файлов")] }),
				declarations: plural,
			})
		)
	).toEqual(["missing-selector"]);
	expect(
		checkTranslation({
			reference: files,
			target: message("ja", [], { "": [v("count"), t(" ファイル")] }),
			declarations: plural,
		})
	).toEqual([]);
});

test("the reference's exact number is needed on a translation's plural without the exact selector", () => {
	const reference = message("en", ["countPluralExact", "countPlural"], {
		"countPluralExact=0,countPlural=*": [t("No files")],
		"countPluralExact=*,countPlural=one": [v("count"), t(" file")],
		"countPluralExact=*,countPlural=*": [v("count"), t(" files")],
	});
	const target = message("de", ["countPlural"], {
		"countPlural=one": [t("Eine Datei")],
		"countPlural=*": [v("count"), t(" Dateien")],
	});
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[{ type: "missing-variant", matches: [match("countPlural", "0")] }]
	);
	// `countPlural=0` covers it, and covers the exact selector's 0 too
	const covered = message("de", ["countPlural"], {
		"countPlural=0": [t("Keine Dateien")],
		"countPlural=one": [t("Eine Datei")],
		"countPlural=*": [v("count"), t(" Dateien")],
	});
	expect(
		checkTranslation({ reference, target: covered, declarations: plural })
	).toEqual([]);
	expect(
		variantCovers(
			{ matches: [match("countPluralExact", "*"), match("countPlural", "0")] },
			[match("countPluralExact", "0"), match("countPlural", "*")],
			plural
		)
	).toBe(true);
});

test("categories only for millions (French many) are offered, not required", () => {
	const message = (locale: string) => ({
		locale,
		selectors: [{ type: "variable-reference" as const, name: "countPlural" }],
	});
	const keys = (forms: Match[][]) =>
		forms.map((form) =>
			form.map((m) => (m.type === "literal-match" ? m.value : "*")).join()
		);
	for (const locale of ["fr", "es", "it", "pt", "ca"])
		expect(keys(requiredVariants(message(locale), plural))).toEqual([
			"one",
			"*",
		]);
	expect(pluralRules("countPlural", plural, "fr")?.categories).toContain(
		"many"
	);
	expect(keys(requiredVariants(message("ru"), plural))).toEqual([
		"one",
		"few",
		"many",
		"*",
	]);
	expect(
		missingVariants(
			{
				...message("fr"),
				variants: [
					{ matches: [match("countPlural", "one")] },
					{ matches: [match("countPlural", "*")] },
				],
			},
			plural
		)
	).toEqual([]);
});

test("locales with underscores and number selectors get plural rules", () => {
	expect(pluralRules("countPlural", plural, "pt_BR")?.categories).toEqual(
		pluralRules("countPlural", plural, "pt-BR")?.categories
	);
	const number: Declaration[] = [
		{ type: "input-variable", name: "count" },
		local("countNumber", "count", "number"),
		local("countInteger", "count", "integer"),
		{
			type: "local-variable",
			name: "countExact",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{ name: "select", value: { type: "literal", value: "exact" } },
					],
				},
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
					name: "number",
					options: [
						{ name: "select", value: { type: "literal", value: "ordinal" } },
					],
				},
			},
		},
	];
	expect(isPluralSelector("countNumber", number)).toBe(true);
	expect(pluralRules("countInteger", number, "ru")?.categories).toEqual([
		"one",
		"few",
		"many",
		"other",
	]);
	expect(pluralRules("countOrdinal", number, "en")?.type).toBe("ordinal");
	expect(isPluralSelector("countExact", number)).toBe(false);
});

test("checkBundle reports a dropped selector against the reference", async () => {
	const { checkBundle } = await import("./checkBundle.js");
	const bundle = {
		id: "invite",
		declarations: plural,
		messages: [
			message("en", ["gender"], {
				"gender=female": [t("She invited you")],
				"gender=*": [t("They invited you")],
			}),
			message("de", [], { "": [t("Du wurdest eingeladen")] }),
		].map((m) => ({
			...m,
			variants: m.variants.map((variant) => ({ ...variant, id: variant.id })),
		})),
	};
	expect(
		checkBundle({ bundle, locales: ["de"], referenceLocale: "en" })
	).toEqual([
		{
			checkId: "missing-selector",
			bundleId: "invite",
			locale: "de",
			messageId: "m-de",
			name: "gender",
			selector: "gender",
			severity: "warning",
			fixes: [],
			message:
				'Message "invite" doesn\'t choose by {gender} in "de" like "en" does.',
		},
	]);
});
