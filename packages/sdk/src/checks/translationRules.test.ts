import { expect, test } from "vitest";
import type { Declaration, Pattern } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import { checkTranslation } from "./translations.js";
import { checkBundle } from "./checkBundle.js";
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
	// i18next keys with cardinal and ordinal forms: `type=$pluralType`
	for (const reference of [mixedEnglish(), mixedGerman()])
		expect(
			checkTranslation({ reference, target: reference, declarations: mixed })
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

test("isUnreachableVariant follows the plural's type, locale spelling and aliases", () => {
	const ordinal: Declaration[] = [
		{ type: "input-variable", name: "count" },
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
						{ name: "type", value: { type: "literal", value: "ordinal" } },
					],
				},
			},
		},
		local("ordinalAlias", "countOrdinal"),
	];
	const form = (key: string, value: string) => ({
		matches: [match(key, value)],
	});
	// English ordinals: one (1st), two (2nd), few (3rd), other; Welsh ordinals have zero
	expect(isUnreachableVariant(form("countOrdinal", "few"), ordinal, "en")).toBe(
		false
	);
	expect(
		isUnreachableVariant(form("countOrdinal", "zero"), ordinal, "en")
	).toBe(true);
	expect(
		isUnreachableVariant(form("countOrdinal", "zero"), ordinal, "cy")
	).toBe(false);
	// the alias reads the same plural
	expect(isUnreachableVariant(form("ordinalAlias", "few"), ordinal, "de")).toBe(
		true
	);
	expect(isUnreachableVariant(form("ordinalAlias", "few"), ordinal, "en")).toBe(
		false
	);
	// `pt_BR` is read as `pt-BR`: many (millions) is a category, zero isn't
	expect(
		isUnreachableVariant(form("countPlural", "many"), plural, "pt_BR")
	).toBe(false);
	expect(
		isUnreachableVariant(form("countPlural", "zero"), plural, "pt_BR")
	).toBe(true);
});

/** i18next keys with cardinal and ordinal forms: `.local $countPlural = {$count :plural type=$pluralType}`. */
const mixed: Declaration[] = [
	{ type: "input-variable", name: "pluralType" },
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
				options: [
					{
						name: "type",
						value: { type: "variable-reference", name: "pluralType" },
					},
				],
			},
		},
	},
];

/**
 * What `@inlang/plugin-i18next` imports for keys with `_zero`, cardinal and `_ordinal_` forms:
 * `pluralType` chooses the type, cardinal forms are its catch-all, `_zero` is the exact
 * `pluralType=cardinal,count=0` and the category `zero`.
 */
const mixedShape = (locale: string, forms: Record<string, Pattern>) =>
	message(locale, ["pluralType", "count", "countPlural"], forms);
const mixedEnglish = () =>
	mixedShape("en", {
		"pluralType=cardinal,count=0,countPlural=*": [t("None")],
		"pluralType=ordinal,count=*,countPlural=one": [v("count"), t("st")],
		"pluralType=ordinal,count=*,countPlural=two": [v("count"), t("nd")],
		"pluralType=ordinal,count=*,countPlural=few": [v("count"), t("rd")],
		"pluralType=ordinal,count=*,countPlural=other": [v("count"), t("th")],
		"pluralType=*,count=*,countPlural=zero": [t("None")],
		"pluralType=*,count=*,countPlural=one": [v("count"), t(" item")],
		"pluralType=*,count=*,countPlural=other": [v("count"), t(" items")],
	});
const mixedGerman = () =>
	mixedShape("de", {
		"pluralType=cardinal,count=0,countPlural=*": [t("Keine")],
		"pluralType=ordinal,count=*,countPlural=other": [v("count"), t(".")],
		"pluralType=*,count=*,countPlural=zero": [t("Keine")],
		"pluralType=*,count=*,countPlural=one": [v("count"), t(" Artikel")],
		"pluralType=*,count=*,countPlural=other": [v("count"), t(" Artikel")],
	});
const formKeys = (forms: Match[][]) =>
	forms.map((matches) =>
		matches
			.map((m) => `${m.key}=${m.type === "literal-match" ? m.value : "*"}`)
			.join(",")
	);

test("a plural with a variable type: i18next's `_zero` next to ordinal forms", () => {
	const reference = mixedEnglish();
	const german = mixedGerman();
	const issues = (target: typeof reference) =>
		checkTranslation({ reference, target, declarations: mixed });
	expect(issues(german)).toEqual([]);
	expect(issues(reference)).toEqual([]);
	// the variant's type decides: English ordinal `few` (3rd) is reachable, cardinal `few` isn't
	const few = (pluralType: string) => ({
		matches: [
			match("pluralType", pluralType),
			match("count", "*"),
			match("countPlural", "few"),
		],
	});
	expect(isUnreachableVariant(few("ordinal"), mixed, "en")).toBe(false);
	expect(isUnreachableVariant(few("cardinal"), mixed, "en")).toBe(true);
	// the catch-all type is either: `few` is an English ordinal, never German
	expect(isUnreachableVariant(few("*"), mixed, "en")).toBe(false);
	expect(isUnreachableVariant(few("*"), mixed, "de")).toBe(true);
	// a type the runtime doesn't know keeps the variant
	expect(isUnreachableVariant(few("other"), mixed, "de")).toBe(false);
});

test("unreachable forms are ignored on both sides: no translation, no reference", () => {
	const reference = i18next("en", {
		zero: [t("Your cart is empty")],
		one: [v("count"), t(" item")],
		other: [v("count"), t(" items")],
	});
	// only the form German never shows has text
	const german = message("de", ["count", "countPlural"], {
		"count=0,countPlural=*": [],
		"count=*,countPlural=zero": [t("Leer")],
		"count=*,countPlural=one": [],
		"count=*,countPlural=other": [],
	});
	expect(
		checkTranslation({ reference, target: german, declarations: plural })
	).toEqual([{ type: "missing-translation" }]);
	// a variable only the reference's unreachable form uses is unknown
	const typo = message("en", ["count", "countPlural"], {
		"count=0,countPlural=*": [t("Empty")],
		"count=*,countPlural=zero": [v("cuont"), t(" empty")],
		"count=*,countPlural=one": [v("count"), t(" item")],
		"count=*,countPlural=other": [v("count"), t(" items")],
	});
	expect(
		checkTranslation({
			reference: typo,
			target: message("de", ["count", "countPlural"], {
				"count=0,countPlural=*": [t("Leer")],
				"count=*,countPlural=one": [v("count"), t(" Artikel")],
				"count=*,countPlural=other": [v("cuont"), t(" Artikel")],
			}),
			declarations: plural,
		})
	).toEqual([
		{
			type: "missing-variable",
			name: "count",
			variantId: "de:count=*,countPlural=other",
		},
		{
			type: "unknown-variable",
			name: "cuont",
			variantId: "de:count=*,countPlural=other",
			suggestion: "count",
		},
	]);
});

test("checkBundle reports nothing for i18next's `_zero` in German and French, `{count}` in Latvian", () => {
	const forms = (locale: string, zero: Pattern, other: Pattern) =>
		i18next(locale, { zero, one: other, other });
	const bundle = {
		id: "cart.items",
		declarations: plural,
		messages: [
			forms("en", [t("Your cart is empty")], [v("count"), t(" items")]),
			forms("de", [t("Dein Warenkorb ist leer")], [v("count"), t(" Artikel")]),
			forms("fr", [t("Votre panier est vide")], [v("count"), t(" articles")]),
			i18next("lv", {
				zero: [t("Grozs ir tukšs")],
				one: [v("count"), t(" prece")],
				other: [v("count"), t(" preces")],
				extra: [],
			}),
		],
	};
	expect(
		checkBundle({
			bundle,
			locales: ["en", "de", "fr", "lv"],
			referenceLocale: "en",
		}).map((diagnostic) => [
			diagnostic.locale,
			diagnostic.checkId,
			"variantId" in diagnostic ? diagnostic.variantId : undefined,
		])
	).toEqual([["lv", "missing-variable", "lv:count=*,countPlural=zero"]]);
});

test("required variants of a plural with a variable type are per type, not a product", () => {
	const reference = mixedEnglish();
	const options = { referenceVariants: reference.variants };
	// the catch-all type is cardinal; `pluralType=cardinal` only adds its exact numbers, the
	// cardinal categories fall through to the catch-all; ordinal needs its own categories
	expect(formKeys(requiredVariants(reference, mixed, options))).toEqual([
		"pluralType=cardinal,count=0,countPlural=*",
		"pluralType=ordinal,count=*,countPlural=one",
		"pluralType=ordinal,count=*,countPlural=two",
		"pluralType=ordinal,count=*,countPlural=few",
		"pluralType=ordinal,count=*,countPlural=*",
		"pluralType=*,count=*,countPlural=one",
		"pluralType=*,count=*,countPlural=*",
	]);
	expect(missingVariants(reference, mixed, options)).toEqual([]);
	const german = mixedGerman();
	expect(formKeys(requiredVariants(german, mixed, options))).toEqual([
		"pluralType=cardinal,count=0,countPlural=*",
		"pluralType=ordinal,count=*,countPlural=*",
		"pluralType=*,count=*,countPlural=one",
		"pluralType=*,count=*,countPlural=*",
	]);
	expect(missingVariants(german, mixed, options)).toEqual([]);
	// Latvian selects `zero` in cardinals: needed in the catch-all type
	const latvian = mixedShape("lv", {
		"pluralType=cardinal,count=0,countPlural=*": [t("Nav")],
		"pluralType=ordinal,count=*,countPlural=other": [v("count"), t(".")],
		"pluralType=*,count=*,countPlural=one": [v("count"), t(" prece")],
		"pluralType=*,count=*,countPlural=other": [v("count"), t(" preces")],
	});
	expect(formKeys(missingVariants(latvian, mixed, options))).toEqual([
		"pluralType=*,count=*,countPlural=zero",
	]);
	// a translation without the ordinal forms, or the exact 0, is missing them
	const cardinalOnly = mixedShape("de", {
		"pluralType=*,count=*,countPlural=one": [v("count"), t(" Artikel")],
		"pluralType=*,count=*,countPlural=other": [v("count"), t(" Artikel")],
	});
	expect(formKeys(missingVariants(cardinalOnly, mixed, options))).toEqual([
		"pluralType=cardinal,count=0,countPlural=*",
		"pluralType=ordinal,count=*,countPlural=*",
	]);
	// English ordinals need one, two, few and other
	const fewMissing = mixedShape("en", {
		"pluralType=ordinal,count=*,countPlural=one": [v("count"), t("st")],
		"pluralType=ordinal,count=*,countPlural=other": [v("count"), t("th")],
		"pluralType=*,count=*,countPlural=one": [v("count"), t(" item")],
		"pluralType=*,count=*,countPlural=other": [v("count"), t(" items")],
	});
	expect(formKeys(missingVariants(fewMissing, mixed))).toEqual([
		"pluralType=ordinal,count=*,countPlural=two",
		"pluralType=ordinal,count=*,countPlural=few",
	]);
	expect(
		types(checkTranslation({ reference, target: german, declarations: mixed }))
	).toEqual([]);
});

test("a variable plural type next to another selector: i18next context", () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "context" },
		...mixed,
	];
	const reference = message("en", ["context", "pluralType", "countPlural"], {
		"context=male,pluralType=ordinal,countPlural=one": [v("count"), t("st")],
		"context=male,pluralType=ordinal,countPlural=two": [v("count"), t("nd")],
		"context=male,pluralType=ordinal,countPlural=few": [v("count"), t("rd")],
		"context=male,pluralType=ordinal,countPlural=other": [v("count"), t("th")],
		"context=*,pluralType=ordinal,countPlural=one": [v("count"), t("st")],
		"context=*,pluralType=ordinal,countPlural=two": [v("count"), t("nd")],
		"context=*,pluralType=ordinal,countPlural=few": [v("count"), t("rd")],
		"context=*,pluralType=ordinal,countPlural=other": [v("count"), t("th")],
		"context=male,pluralType=*,countPlural=one": [v("count"), t(" friend")],
		"context=male,pluralType=*,countPlural=other": [v("count"), t(" friends")],
		"context=*,pluralType=*,countPlural=one": [v("count"), t(" friend")],
		"context=*,pluralType=*,countPlural=other": [v("count"), t(" friends")],
	});
	expect(
		missingVariants(reference, declarations, {
			referenceVariants: reference.variants,
		})
	).toEqual([]);
	expect(
		checkTranslation({ reference, target: reference, declarations })
	).toEqual([]);
	const german = message("de", ["context", "pluralType", "countPlural"], {
		"context=male,pluralType=ordinal,countPlural=other": [v("count"), t(".")],
		"context=*,pluralType=ordinal,countPlural=other": [v("count"), t(".")],
		"context=male,pluralType=*,countPlural=one": [v("count"), t(" Freund")],
		"context=male,pluralType=*,countPlural=other": [v("count"), t(" Freunde")],
		"context=*,pluralType=*,countPlural=one": [v("count"), t(" Freund")],
		"context=*,pluralType=*,countPlural=other": [v("count"), t(" Freunde")],
	});
	expect(checkTranslation({ reference, target: german, declarations })).toEqual(
		[]
	);
});

test("exact numbers and plural types are needed only in the select branches that use them", () => {
	// i18next `c_male_one`, `c_male_other`, `c_zero`, `c_one`, `c_other`: context × exact 0 is
	// not a product, `context=male` at 0 shows the male other form
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "context" },
		...plural,
	];
	const zero = (locale: string, forms: Record<string, Pattern>) =>
		message(locale, ["context", "count", "countPlural"], forms);
	const reference = zero("en", {
		"context=male,count=*,countPlural=one": [v("count"), t(" friend")],
		"context=male,count=*,countPlural=other": [v("count"), t(" friends")],
		"context=*,count=0,countPlural=*": [t("no friends")],
		"context=*,count=*,countPlural=zero": [t("no friends")],
		"context=*,count=*,countPlural=one": [v("count"), t(" friend")],
		"context=*,count=*,countPlural=other": [v("count"), t(" friends")],
	});
	const options = { referenceVariants: reference.variants };
	expect(formKeys(requiredVariants(reference, declarations, options))).toEqual([
		"context=male,count=*,countPlural=one",
		"context=male,count=*,countPlural=*",
		"context=*,count=0,countPlural=*",
		"context=*,count=*,countPlural=one",
		"context=*,count=*,countPlural=*",
	]);
	expect(
		checkTranslation({ reference, target: reference, declarations })
	).toEqual([]);
	// the plural's categories are still needed in every branch: Russian male needs few and many
	const russian = zero("ru", {
		"context=male,count=*,countPlural=one": [v("count"), t(" друг")],
		"context=male,count=*,countPlural=other": [v("count"), t(" друзей")],
		"context=*,count=0,countPlural=*": [t("нет друзей")],
		"context=*,count=*,countPlural=one": [v("count"), t(" друг")],
		"context=*,count=*,countPlural=few": [v("count"), t(" друга")],
		"context=*,count=*,countPlural=many": [v("count"), t(" друзей")],
		"context=*,count=*,countPlural=other": [v("count"), t(" друга")],
	});
	expect(formKeys(missingVariants(russian, declarations, options))).toEqual([
		"context=male,count=*,countPlural=few",
		"context=male,count=*,countPlural=many",
	]);
	// a branch that uses the exact number needs it in the translation: female 0
	const female = zero("en", {
		"context=female,count=0,countPlural=*": [t("she has no friends")],
		"context=female,count=*,countPlural=one": [v("count"), t(" friend")],
		"context=female,count=*,countPlural=other": [v("count"), t(" friends")],
		"context=*,count=*,countPlural=one": [v("count"), t(" friend")],
		"context=*,count=*,countPlural=other": [v("count"), t(" friends")],
	});
	expect(
		formKeys(
			missingVariants(
				zero("de", {
					"context=female,count=*,countPlural=one": [v("count")],
					"context=female,count=*,countPlural=other": [v("count")],
					"context=*,count=*,countPlural=one": [v("count")],
					"context=*,count=*,countPlural=other": [v("count")],
				}),
				declarations,
				{ referenceVariants: female.variants }
			)
		)
	).toEqual(["context=female,count=0,countPlural=*"]);
	expect(
		checkTranslation({ reference: female, target: female, declarations })
	).toEqual([]);

	// i18next `d_male_one`, `d_male_other`, `d_one`, `d_other`, `d_ordinal_*`: ordinal forms only
	// without context
	const typed: Declaration[] = [
		{ type: "input-variable", name: "context" },
		...mixed,
	];
	const ordinal = (locale: string, forms: Record<string, Pattern>) =>
		message(locale, ["context", "pluralType", "countPlural"], forms);
	const english = ordinal("en", {
		"context=male,pluralType=*,countPlural=one": [v("count"), t(" friend")],
		"context=male,pluralType=*,countPlural=other": [v("count"), t(" friends")],
		"context=*,pluralType=ordinal,countPlural=one": [v("count"), t("st")],
		"context=*,pluralType=ordinal,countPlural=two": [v("count"), t("nd")],
		"context=*,pluralType=ordinal,countPlural=few": [v("count"), t("rd")],
		"context=*,pluralType=ordinal,countPlural=other": [v("count"), t("th")],
		"context=*,pluralType=*,countPlural=one": [v("count"), t(" friend")],
		"context=*,pluralType=*,countPlural=other": [v("count"), t(" friends")],
	});
	const german = ordinal("de", {
		"context=male,pluralType=*,countPlural=one": [v("count"), t(" Freund")],
		"context=male,pluralType=*,countPlural=other": [v("count"), t(" Freunde")],
		"context=*,pluralType=ordinal,countPlural=other": [v("count"), t(".")],
		"context=*,pluralType=*,countPlural=one": [v("count"), t(" Freund")],
		"context=*,pluralType=*,countPlural=other": [v("count"), t(" Freunde")],
	});
	for (const target of [english, german])
		expect(
			checkTranslation({ reference: english, target, declarations: typed })
		).toEqual([]);
	// without the ordinal forms of the catch-all context, they are missing
	expect(
		formKeys(
			missingVariants(
				ordinal("de", {
					"context=male,pluralType=*,countPlural=one": [v("count")],
					"context=male,pluralType=*,countPlural=other": [v("count")],
					"context=*,pluralType=*,countPlural=one": [v("count")],
					"context=*,pluralType=*,countPlural=other": [v("count")],
				}),
				typed,
				{ referenceVariants: english.variants }
			)
		)
	).toEqual(["context=*,pluralType=ordinal,countPlural=*"]);
});
