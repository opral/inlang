import { expect, test } from "vitest";
import type { Declaration, Pattern } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import { checkTranslation } from "./translations.js";
import { requiredVariants } from "./selectors.js";

const v = (name: string) => ({
	type: "expression" as const,
	arg: { type: "variable-reference" as const, name },
});
const t = (value: string) => ({ type: "text" as const, value });
const declarations: Declaration[] = [
	{ type: "input-variable", name: "count" },
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
const key = (value: string): Match =>
	value === "*"
		? { type: "catchall-match", key: "countPlural" }
		: { type: "literal-match", key: "countPlural", value };
const message = (locale: string, forms: Record<string, Pattern>) => ({
	id: `m-${locale}`,
	locale,
	selectors: [{ type: "variable-reference" as const, name: "countPlural" }],
	variants: Object.entries(forms).map(([form, pattern]) => ({
		id: `${locale}-${form}`,
		matches: [key(form)],
		pattern,
	})),
});
const english = message("en", {
	one: [v("count"), t(" file left")],
	"*": [v("count"), t(" files left")],
});

test("plural forms follow the locale, with the catch-all as other", () => {
	const values = (locale: string) =>
		requiredVariants(
			{ locale, selectors: english.selectors },
			declarations
		).map((matches) =>
			matches.map((m) => (m.type === "literal-match" ? m.value : "*")).join()
		);
	expect(values("ru")).toEqual(["one", "few", "many", "*"]);
	expect(values("en")).toEqual(["one", "*"]);
	expect(values("ja")).toEqual(["*"]);
	const russian = message("ru", {
		one: [v("count"), t(" файл")],
		"*": [v("count"), t(" файлов")],
	});
	expect(
		checkTranslation({ reference: english, target: russian, declarations })
	).toEqual([
		{ type: "missing-variant", matches: [key("few")] },
		{ type: "missing-variant", matches: [key("many")] },
	]);
	// An explicit "other" covers the catch-all.
	const complete = message("ru", {
		one: [v("count")],
		few: [v("count")],
		many: [v("count")],
		other: [v("count")],
	});
	expect(
		checkTranslation({ reference: english, target: complete, declarations })
	).toEqual([]);
});

test("variables and markup are checked per variant, with suggestions", () => {
	const reference = {
		locale: "en",
		selectors: [],
		variants: [
			{
				id: "en",
				matches: [],
				pattern: [
					v("used"),
					t(" of "),
					v("total"),
					t(" used. "),
					{ type: "markup-start" as const, name: "link" },
					t("docs"),
					{ type: "markup-end" as const, name: "link" },
				],
			},
		],
	};
	const target = {
		locale: "de",
		selectors: [],
		variants: [
			{ id: "de", matches: [], pattern: [v("used"), t(" von "), v("totl")] },
		],
	};
	expect(checkTranslation({ reference, target })).toEqual([
		{ type: "missing-variable", name: "total", variantId: "de" },
		{
			type: "unknown-variable",
			name: "totl",
			variantId: "de",
			suggestion: "total",
		},
		{ type: "missing-markup", name: "link", variantId: "de" },
	]);
});

test("empty translations are missing, and exact numbers may spell the number out", () => {
	expect(
		checkTranslation({
			reference: english,
			target: message("de", { "*": [t("  ")] }),
			declarations,
		})
	).toEqual([{ type: "missing-translation" }]);
	expect(checkTranslation({ reference: english, target: undefined })).toEqual([
		{ type: "missing-translation" },
	]);
	const zero = message("de", {
		"0": [t("Keine Dateien")],
		one: [v("count"), t(" Datei")],
		"*": [v("count"), t(" Dateien")],
	});
	expect(
		checkTranslation({ reference: english, target: zero, declarations })
	).toEqual([]);
});

test("an ICU exact-number form may spell the number out", () => {
	// ICU `{count, plural, =0 {…} one {…} other {…}}` imports as two selectors on the same input
	const icuDeclarations: Declaration[] = [
		...declarations,
		{
			type: "local-variable",
			name: "countPluralExact",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
			},
		},
	];
	const icu = (locale: string, forms: [string, string, Pattern][]) => ({
		id: `m-${locale}`,
		locale,
		selectors: [
			{ type: "variable-reference" as const, name: "countPluralExact" },
			{ type: "variable-reference" as const, name: "countPlural" },
		],
		variants: forms.map(([exact, plural, pattern]) => ({
			id: `${locale}-${exact}-${plural}`,
			matches: [
				exact === "*"
					? ({ type: "catchall-match", key: "countPluralExact" } as const)
					: ({
							type: "literal-match",
							key: "countPluralExact",
							value: exact,
						} as const),
				key(plural),
			],
			pattern,
		})),
	});
	const issues = checkTranslation({
		reference: icu("en", [
			["0", "*", [t("No files")]],
			["*", "one", [v("count"), t(" file")]],
			["*", "*", [v("count"), t(" files")]],
		]),
		target: icu("de", [
			["0", "*", [t("Keine Dateien")]],
			["*", "one", [v("count"), t(" Datei")]],
			["*", "*", [v("count"), t(" Dateien")]],
		]),
		declarations: icuDeclarations,
	});
	expect(issues).toEqual([]);
	// An empty `=0 {}` next to filled forms is reported, in the reference too.
	const empty = icu("en", [
		["0", "*", []],
		["*", "one", [v("count"), t(" file")]],
		["*", "*", [v("count"), t(" files")]],
	]);
	expect(
		checkTranslation({ target: empty, declarations: icuDeclarations })
	).toEqual([
		{
			type: "empty-variant",
			variantId: "en-0-*",
			matches: empty.variants[0]!.matches,
		},
	]);
});

test("a plural category of one number may spell it out, others need the variable", () => {
	const forms = (locale: string, one: string) =>
		message(locale, {
			one: [t(one)],
			few: [v("count"), t(" x")],
			many: [v("count"), t(" x")],
			"*": [v("count"), t(" x")],
		});
	const missing = (locale: string, one: string) =>
		checkTranslation({
			reference: english,
			target: forms(locale, one),
			declarations,
		}).filter((issue) => issue.type === "missing-variable");
	// German "one" is only 1
	expect(missing("de", "Eine Datei")).toEqual([]);
	// Russian "one" is 1, 21, 31, …; French "one" is 0 and 1
	expect(missing("ru", "Один файл")).toEqual([
		{ type: "missing-variable", name: "count", variantId: "ru-one" },
	]);
	expect(missing("fr", "Un fichier")).toEqual([
		{ type: "missing-variable", name: "count", variantId: "fr-one" },
	]);
});

test("a translation needs the forms the reference's select values ask for", () => {
	const genders = (locale: string, forms: Record<string, Pattern>) => ({
		id: `g-${locale}`,
		locale,
		selectors: [{ type: "variable-reference" as const, name: "gender" }],
		variants: Object.entries(forms).map(([value, pattern]) => ({
			id: `${locale}-${value}`,
			matches: [
				value === "*"
					? ({ type: "catchall-match", key: "gender" } as const)
					: ({ type: "literal-match", key: "gender", value } as const),
			],
			pattern,
		})),
	});
	const genderDeclarations: Declaration[] = [
		{ type: "input-variable", name: "gender" },
	];
	expect(
		checkTranslation({
			reference: genders("en", {
				female: [t("She")],
				male: [t("He")],
				"*": [t("They")],
			}),
			target: genders("de", { female: [t("Sie")], "*": [t("Sie")] }),
			declarations: genderDeclarations,
		})
	).toEqual([
		{
			type: "missing-variant",
			matches: [{ type: "literal-match", key: "gender", value: "male" }],
		},
	]);
});
