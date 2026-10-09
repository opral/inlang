import { expect, test } from "vitest";
import type { Declaration, Pattern } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import { checkTranslation } from "./translations.js";
import {
	isPluralSelector,
	isUnreachableVariant,
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
		{
			type: "missing-selector",
			selector: "gender",
			input: "gender",
			values: ["female"],
		},
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
	// Russian with only an exact number on the input still needs the plural
	expect(
		checkTranslation({
			reference: files,
			target: message("ru", ["countPluralExact"], {
				"countPluralExact=0": [t("Нет файлов")],
				"countPluralExact=*": [v("count"), t(" файлов")],
			}),
			declarations: plural,
		})
	).toEqual([
		{
			type: "missing-selector",
			selector: "countPlural",
			input: "count",
			values: [],
		},
	]);
});

test("the reference's exact number needs an exact-number selector; a number on the plural never matches", () => {
	const reference = message("en", ["countPluralExact", "countPlural"], {
		"countPluralExact=0,countPlural=*": [t("No files")],
		"countPluralExact=*,countPlural=one": [v("count"), t(" file")],
		"countPluralExact=*,countPlural=*": [v("count"), t(" files")],
	});
	// `countPlural` selects a category at runtime, so `countPlural=0` can't stand for =0
	for (const target of [
		message("de", ["countPlural"], {
			"countPlural=one": [t("Eine Datei")],
			"countPlural=*": [v("count"), t(" Dateien")],
		}),
		message("de", ["countPlural"], {
			"countPlural=0": [t("Keine Dateien")],
			"countPlural=one": [t("Eine Datei")],
			"countPlural=*": [v("count"), t(" Dateien")],
		}),
	])
		expect(
			checkTranslation({ reference, target, declarations: plural })
		).toEqual([
			{
				type: "missing-selector",
				selector: "countPluralExact",
				input: "count",
				values: ["0"],
			},
		]);
	expect(
		variantCovers(
			{ matches: [match("countPluralExact", "*"), match("countPlural", "0")] },
			[match("countPluralExact", "0"), match("countPlural", "*")],
			plural
		)
	).toBe(false);
	// with the exact selector, the 0 form is a missing variant as before
	expect(
		checkTranslation({
			reference,
			target: message("de", ["countPluralExact", "countPlural"], {
				"countPluralExact=*,countPlural=one": [t("Eine Datei")],
				"countPluralExact=*,countPlural=*": [v("count"), t(" Dateien")],
			}),
			declarations: plural,
		})
	).toEqual([
		{
			type: "missing-variant",
			matches: [match("countPluralExact", "0"), match("countPlural", "*")],
		},
	]);
});

test("plural categories are not matched by name across locales: the input is needed unless the category is one number", () => {
	const reference = message("en", ["countPlural"], {
		"countPlural=one": [t("One file")],
		"countPlural=*": [v("count"), t(" files")],
	});
	const one = (locale: string, text: string) =>
		checkTranslation({
			reference,
			target: message(locale, ["countPlural"], {
				"countPlural=one": [t(text)],
				"countPlural=few": [v("count"), t(" x")],
				"countPlural=many": [v("count"), t(" x")],
				"countPlural=*": [v("count"), t(" x")],
			}),
			declarations: plural,
		}).filter((issue) => issue.type === "missing-variable");
	// Russian one is 1, 21, 31…; French one is 0 and 1; German one is only 1
	expect(one("ru", "файл")).toEqual([
		{
			type: "missing-variable",
			name: "count",
			variantId: "ru:countPlural=one",
		},
	]);
	expect(one("fr", "fichier")).toEqual([
		{
			type: "missing-variable",
			name: "count",
			variantId: "fr:countPlural=one",
		},
	]);
	expect(one("de", "Eine Datei")).toEqual([]);
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

test("locales with underscores get plural rules; :number and :integer select by value", () => {
	expect(pluralRules("countPlural", plural, "pt_BR")?.categories).toEqual(
		pluralRules("countPlural", plural, "pt-BR")?.categories
	);
	// Paraglide's registry.number returns a formatted string: `countNumber=1` matches, `one` never
	const number: Declaration[] = [
		{ type: "input-variable", name: "count" },
		local("countNumber", "count", "number"),
		local("countInteger", "count", "integer"),
	];
	expect(isPluralSelector("countNumber", number)).toBe(false);
	expect(pluralRules("countInteger", number, "ru")).toBeUndefined();
	const english = message("en", ["countNumber"], {
		"countNumber=1": [t("One file")],
		"countNumber=*": [v("count"), t(" files")],
	});
	expect(
		missingVariants(english, number, { referenceVariants: english.variants })
	).toEqual([]);
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
			values: ["female"],
			severity: "warning",
			fixes: [],
			message:
				'Message "invite" doesn\'t choose by {gender} in "de" like "en" does.',
		},
	]);
});

test("full scans order bundles like SQLite's BINARY collation", async () => {
	const { compareBinary } = await import("./checkProject.js");
	// U+FF5E (3 UTF-8 bytes) sorts before U+1F600 (4 bytes); UTF-16 units say the opposite
	const ids = ["😀", "～", "a"];
	expect([...ids].sort(compareBinary)).toEqual(["a", "～", "😀"]);
	expect([...ids].sort()).not.toEqual(["a", "～", "😀"]);
});

test("a select next to a plural: forms without the plural's number don't need it", () => {
	const reference = message("en", ["gender", "countPlural"], {
		"gender=female,countPlural=one": [t("Nothing here")],
		"gender=female,countPlural=*": [t("Nothing here")],
		"gender=*,countPlural=one": [v("count"), t(" item")],
		"gender=*,countPlural=*": [v("count"), t(" items")],
	});
	const target = message("de", ["gender", "countPlural"], {
		"gender=female,countPlural=one": [t("Nichts hier")],
		"gender=female,countPlural=*": [t("Nichts hier")],
		"gender=*,countPlural=one": [v("count"), t(" Artikel")],
		"gender=*,countPlural=*": [v("count"), t(" Artikel")],
	});
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[]
	);
	expect(
		checkTranslation({ reference, target: reference, declarations: plural })
	).toEqual([]);
});

test("markup or a variable in one reference category is needed in that category, not in every one", () => {
	const reference = message("en", ["countPlural"], {
		"countPlural=one": [
			{ type: "markup-start", name: "b", options: [], attributes: [] } as never,
			v("count"),
			{ type: "markup-end", name: "b", options: [], attributes: [] } as never,
			t(" item in "),
			v("folder"),
		],
		"countPlural=*": [v("count"), t(" items")],
	});
	const target = message("de", ["countPlural"], {
		"countPlural=one": [
			{ type: "markup-start", name: "b", options: [], attributes: [] } as never,
			t("Ein"),
			{ type: "markup-end", name: "b", options: [], attributes: [] } as never,
			t(" Artikel in "),
			v("folder"),
		],
		"countPlural=*": [v("count"), t(" Artikel")],
	});
	expect(checkTranslation({ reference, target, declarations: plural })).toEqual(
		[]
	);
	// a category only the target has compares with the reference's other form
	const russian = message("ru", ["countPlural"], {
		"countPlural=one": [v("count"), t(" товар в "), v("folder")],
		"countPlural=few": [v("count"), t(" товара")],
		"countPlural=many": [v("count"), t(" товаров")],
		"countPlural=*": [v("count"), t(" товара")],
	});
	expect(
		checkTranslation({ reference, target: russian, declarations: plural })
	).toEqual([
		{ type: "missing-markup", name: "b", variantId: "ru:countPlural=one" },
	]);
});

test("missing-selector names the selector its values belong to: plural and exact number apart", () => {
	const reference = message("en", ["countPluralExact", "countPlural"], {
		"countPluralExact=0,countPlural=*": [t("No files")],
		"countPluralExact=*,countPlural=one": [v("count"), t(" file")],
		"countPluralExact=*,countPlural=*": [v("count"), t(" files")],
	});
	const single = (locale: string) =>
		checkTranslation({
			reference,
			target: message(locale, [], { "": [v("count"), t(" x")] }),
			declarations: plural,
		});
	expect(single("ja")).toEqual([
		{
			type: "missing-selector",
			selector: "countPluralExact",
			input: "count",
			values: ["0"],
		},
	]);
	expect(single("ru")).toEqual([
		{
			type: "missing-selector",
			selector: "countPlural",
			input: "count",
			values: [],
		},
		{
			type: "missing-selector",
			selector: "countPluralExact",
			input: "count",
			values: ["0"],
		},
	]);
});

test("every fixture reference checked against itself is clean", () => {
	const references = [
		message("en", ["hasName"], {
			"hasName=true": [t("Hello "), v("name")],
			"hasName=*": [t("Hello")],
		}),
		message("en", ["countPluralExact", "countPlural"], {
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
		}),
		message("en", ["countPlural"], {
			"countPlural=one": [t("One file")],
			"countPlural=*": [v("count"), t(" files")],
		}),
		message("en", ["gender", "countPlural"], {
			"gender=female,countPlural=one": [t("Nothing here")],
			"gender=female,countPlural=*": [t("Nothing here")],
			"gender=*,countPlural=one": [v("count"), t(" item")],
			"gender=*,countPlural=*": [v("count"), t(" items")],
		}),
		message("en", ["countPlural"], {
			"countPlural=one": [t("One item in "), v("folder")],
			"countPlural=*": [v("count"), t(" items")],
		}),
		// i18next `_zero`: an exact `count=0` and the `zero` category English never selects
		i18next("en", {
			zero: [t("Your cart is empty")],
			one: [v("count"), t(" item")],
			other: [v("count"), t(" items")],
		}),
	];
	for (const reference of references)
		expect(
			checkTranslation({ reference, target: reference, declarations: plural })
		).toEqual([]);
});

/** The i18next plugin's import of `_zero`, `_one`, `_other`: `_zero` is two forms. */
const i18next = (
	locale: string,
	forms: { zero: Pattern; one?: Pattern; other: Pattern; extra?: string[] }
) =>
	message(locale, ["count", "countPlural"], {
		"count=0,countPlural=*": forms.zero,
		"count=*,countPlural=zero": forms.zero,
		...(forms.one ? { "count=*,countPlural=one": forms.one } : {}),
		...Object.fromEntries(
			(forms.extra ?? []).map((category) => [
				`count=*,countPlural=${category}`,
				forms.other,
			])
		),
		"count=*,countPlural=other": forms.other,
	});

test("a plural category the locale never selects is not checked: i18next `_zero` in German and French", () => {
	const reference = i18next("en", {
		zero: [t("Your cart is empty")],
		one: [v("count"), t(" item")],
		other: [v("count"), t(" items")],
	});
	for (const locale of ["de", "fr"]) {
		const target = i18next(locale, {
			zero: [t("Leer")],
			one: [v("count"), t(" Artikel")],
			other: [v("count"), t(" Artikel")],
		});
		expect(
			checkTranslation({ reference, target, declarations: plural })
		).toEqual([]);
	}
	// nothing is reported for the unreachable form: not empty, unknown variables or markup
	const de = message("de", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Leer")],
		"count=*,countPlural=zero": [],
		"count=*,countPlural=one": [v("count"), t(" Artikel")],
		"count=*,countPlural=other": [v("count"), t(" Artikel")],
	});
	expect(
		checkTranslation({ reference, target: de, declarations: plural })
	).toEqual([]);
	const markup = message("en", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Empty")],
		"count=*,countPlural=zero": [
			{ type: "markup-start", name: "b", options: [], attributes: [] },
			t("Empty"),
		],
		"count=*,countPlural=one": [v("count"), t(" item")],
		"count=*,countPlural=other": [v("count"), t(" items")],
	} as never);
	const typo = message("de", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Leer")],
		"count=*,countPlural=zero": [v("cuont"), t(" Leer")],
		"count=*,countPlural=one": [v("count"), t(" Artikel")],
		"count=*,countPlural=other": [v("count"), t(" Artikel")],
	});
	expect(
		checkTranslation({ reference: markup, target: typo, declarations: plural })
	).toEqual([]);
	// the exact number keeps its rule: it may spell the number out, other variables stay needed
	const folder = i18next("en", {
		zero: [t("Nothing in "), v("folder")],
		other: [v("count"), t(" in "), v("folder")],
	});
	expect(
		checkTranslation({
			reference: folder,
			target: i18next("de", {
				zero: [t("Nichts")],
				one: [v("count"), t(" in "), v("folder")],
				other: [v("count"), t(" in "), v("folder")],
			}),
			declarations: plural,
		})
	).toEqual([
		{
			type: "missing-variable",
			name: "folder",
			variantId: "de:count=0,countPlural=*",
		},
	]);
});

test("a plural category the locale selects keeps every check: Latvian `zero` is 10–20", () => {
	const reference = i18next("en", {
		zero: [t("Your cart is empty")],
		one: [v("count"), t(" item")],
		other: [v("count"), t(" items")],
	});
	const latvian = message("lv", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Grozs ir tukšs")],
		"count=*,countPlural=zero": [t("Grozs ir tukšs")],
		"count=*,countPlural=one": [v("count"), t(" prece")],
		"count=*,countPlural=other": [v("count"), t(" preces")],
	});
	expect(
		checkTranslation({ reference, target: latvian, declarations: plural })
	).toEqual([
		{
			type: "missing-variable",
			name: "count",
			variantId: "lv:count=*,countPlural=zero",
		},
	]);
	const empty = message("lv", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Grozs ir tukšs")],
		"count=*,countPlural=zero": [],
		"count=*,countPlural=one": [v("count"), t(" prece")],
		"count=*,countPlural=other": [v("count"), t(" preces")],
	});
	expect(
		types(checkTranslation({ reference, target: empty, declarations: plural }))
	).toEqual(["empty-variant"]);
});

test("isUnreachableVariant: categories outside the locale's rules", () => {
	const zero = { matches: [match("countPlural", "zero")] };
	expect(isUnreachableVariant(zero, plural, "de")).toBe(true);
	expect(isUnreachableVariant(zero, plural, "en")).toBe(true);
	expect(isUnreachableVariant(zero, plural, "fr")).toBe(true);
	expect(isUnreachableVariant(zero, plural, "lv")).toBe(false);
	expect(isUnreachableVariant(zero, plural, "ar")).toBe(false);
	// French `many` (millions) is rare, not unreachable
	const many = { matches: [match("countPlural", "many")] };
	expect(isUnreachableVariant(many, plural, "fr")).toBe(false);
	expect(isUnreachableVariant(many, plural, "de")).toBe(true);
	// numbers, the catch-all, other, non-plural selectors and unknown rules are reachable
	expect(
		isUnreachableVariant({ matches: [match("count", "0")] }, plural, "de")
	).toBe(false);
	expect(
		isUnreachableVariant({ matches: [match("countPlural", "*")] }, plural, "de")
	).toBe(false);
	expect(
		isUnreachableVariant(
			{ matches: [match("countPlural", "other")] },
			plural,
			"de"
		)
	).toBe(false);
	expect(
		isUnreachableVariant({ matches: [match("gender", "zero")] }, plural, "de")
	).toBe(false);
	expect(isUnreachableVariant(zero, plural, "xx-invalid-")).toBe(false);
});

test("required and missing variants never demand i18next's `zero` where the locale never selects it", () => {
	const reference = i18next("en", {
		zero: [t("Your cart is empty")],
		one: [v("count"), t(" item")],
		other: [v("count"), t(" items")],
	});
	const keys = (forms: Match[][]) =>
		forms.map((matches) =>
			matches
				.map((m) => `${m.key}=${m.type === "literal-match" ? m.value : "*"}`)
				.join(",")
		);
	const options = { referenceVariants: reference.variants };
	for (const locale of ["de", "fr", "en"]) {
		const target = i18next(locale, {
			zero: [t("0")],
			one: [v("count")],
			other: [v("count")],
		});
		const required = keys(requiredVariants(target, plural, options));
		expect(required).not.toContainEqual(expect.stringContaining("zero"));
		expect(required).toContain("count=0,countPlural=*");
		expect(missingVariants(target, plural, options)).toEqual([]);
		// a translation without the unreachable `zero` form is complete as well
		const withoutZero = {
			...target,
			variants: target.variants.filter(
				(variant) => !isUnreachableVariant(variant, plural, locale)
			),
		};
		expect(withoutZero.variants).toHaveLength(3);
		expect(missingVariants(withoutZero, plural, options)).toEqual([]);
		expect(
			checkTranslation({ reference, target: withoutZero, declarations: plural })
		).toEqual([]);
	}
	// Latvian selects `zero` (0, 10–20, 30…): it is needed
	const latvian = message("lv", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("0")],
		"count=*,countPlural=one": [v("count")],
		"count=*,countPlural=other": [v("count")],
	});
	expect(keys(missingVariants(latvian, plural, options))).toEqual([
		"count=*,countPlural=zero",
	]);
});
