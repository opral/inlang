import { expect, test } from "vitest";
import type { Declaration, Pattern } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import { checkBundle } from "./checkBundle.js";

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
// The camelCase shape applications keep in memory (`bundleId`, `messageId`).
const message = (locale: string, forms: Record<string, Pattern>) => ({
	id: `files_${locale}`,
	bundleId: "files",
	locale,
	selectors: [{ type: "variable-reference" as const, name: "countPlural" }],
	variants: Object.entries(forms).map(([form, pattern]) => ({
		id: `files_${locale}_${form}`,
		messageId: `files_${locale}`,
		matches: [key(form)],
		pattern,
	})),
});

test("checks one bundle without a project, in locale order", () => {
	const bundle = {
		id: "files",
		declarations,
		messages: [
			message("en", {
				one: [v("count"), t(" file")],
				"*": [v("count"), t(" files")],
			}),
			message("ru", {
				one: [v("count"), t(" файл")],
				"*": [v("cuont"), t(" файлов")],
			}),
			message("fr", { "*": [t(" ")] }),
		],
	};
	const diagnostics = checkBundle({
		bundle,
		locales: ["de", "ru", "fr"],
		referenceLocale: "en",
	});
	expect(JSON.parse(JSON.stringify(diagnostics))).toEqual(diagnostics);
	expect(
		diagnostics.map((d) => ({
			checkId: d.checkId,
			locale: d.locale,
			...("variantId" in d ? { variantId: d.variantId } : {}),
			...("name" in d ? { name: d.name } : {}),
			...("suggestion" in d ? { suggestion: d.suggestion } : {}),
			...("matches" in d
				? {
						matches: d.matches.map((m) =>
							m.type === "literal-match" ? m.value : "*"
						),
					}
				: {}),
		}))
	).toEqual([
		{ checkId: "missing-translation", locale: "de" },
		{
			checkId: "missing-variable",
			locale: "ru",
			variantId: "files_ru_*",
			name: "count",
		},
		{
			checkId: "unknown-variable",
			locale: "ru",
			variantId: "files_ru_*",
			name: "cuont",
			suggestion: "count",
		},
		{ checkId: "missing-variant", locale: "ru", matches: ["few"] },
		{ checkId: "missing-variant", locale: "ru", matches: ["many"] },
		{ checkId: "empty-translation", locale: "fr" },
	]);
	expect(diagnostics[0]).toEqual({
		checkId: "missing-translation",
		bundleId: "files",
		locale: "de",
		severity: "warning",
		message: 'Message "files" has no translation for "de".',
		fixes: [],
	});
});

test("the reference is checked for emptiness and its own variants only", () => {
	const reference = message("en", {
		// "One file" without {count} is fine for the reference itself.
		one: [t("One file")],
	});
	expect(
		checkBundle({
			bundle: { id: "files", declarations, messages: [reference] },
			locales: ["en"],
			referenceLocale: "en",
		}).map((d) => [d.checkId, d.locale])
	).toEqual([["missing-variant", "en"]]);
	expect(
		checkBundle({
			bundle: {
				id: "files",
				declarations,
				messages: [message("en", { "*": [] })],
			},
			locales: ["en"],
			referenceLocale: "en",
		}).map((d) => [d.checkId, d.locale])
	).toEqual([["empty-translation", "en"]]);
});

test("selected checks and fallback exemptions", () => {
	const bundle = {
		id: "files",
		declarations,
		messages: [
			message("en", { one: [v("count")], "*": [v("count")] }),
			message("de", { "*": [] }),
		],
	};
	const run = (args: Partial<Parameters<typeof checkBundle>[0]>) =>
		checkBundle({
			bundle,
			locales: ["de", "fr"],
			referenceLocale: "en",
			...args,
		}).map((d) => [d.checkId, d.locale]);
	expect(run({})).toEqual([
		["empty-translation", "de"],
		["missing-translation", "fr"],
	]);
	expect(run({ checks: ["missing-translation"] })).toEqual([
		["missing-translation", "fr"],
	]);
	expect(run({ checks: ["missing-variant"] })).toEqual([]);
	expect(run({ ignoreMissingTranslations: ["de", "fr"] })).toEqual([]);
});
