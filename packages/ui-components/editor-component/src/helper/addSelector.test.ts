import { expect, it } from "vitest";
import {
	addSelector,
	removeSelector,
	selectableVariables,
	type SelectorBundle,
} from "./addSelector.js";
import { requiredVariants, selectorGroups } from "@inlang/sdk/browser";
import { selectVariant } from "./selectVariant.js";
import { icuExactPluralDeclarations } from "./fixtures.test-util.js";

let n = 0;
const createId = () => `new${++n}`;

const bundle = (): SelectorBundle & { id: string } => ({
	id: "items",
	declarations: [{ type: "input-variable", name: "count" }],
	messages: ["en", "de"].map((locale) => ({
		id: `items_${locale}`,
		bundleId: "items",
		locale,
		selectors: [],
		variants: [
			{
				id: `items_${locale}_1`,
				messageId: `items_${locale}`,
				matches: [],
				pattern: [
					{
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
					},
					{ type: "text", value: locale === "en" ? " items" : " Elemente" },
				],
			},
		],
	})),
});

it("makes a message plural in every language and keeps the text as the catch-all", () => {
	const original = bundle();
	const plural = addSelector(original, { variable: "count", kind: "plural" });
	expect(original).toEqual(bundle());
	expect(plural.declarations).toEqual([
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
	]);
	for (const message of plural.messages) {
		expect(message.selectors).toEqual([
			{ type: "variable-reference", name: "countPlural" },
		]);
		expect(message.variants).toHaveLength(1);
		expect(message.variants[0]!.matches).toEqual([
			{ type: "catchall-match", key: "countPlural" },
		]);
		// other fields (ids of the host) are kept
		expect(message.variants[0]).toMatchObject({ messageId: message.id });
		expect(message).toMatchObject({ bundleId: "items" });
	}
	expect(plural.messages[0]!.variants[0]!.pattern).toEqual(
		original.messages[0]!.variants[0]!.pattern
	);
});

it("then requires the plural categories of each language", () => {
	const plural = addSelector(bundle(), { variable: "count", kind: "plural" });
	// Russian has four categories, English two
	expect(
		requiredVariants(
			{ ...plural.messages[1]!, locale: "ru" },
			plural.declarations
		)
	).toHaveLength(4);
	const en = plural.messages[0]!;
	expect(
		requiredVariants({ ...en, locale: "en" }, plural.declarations).map(
			(form) => form[0]!
		)
	).toEqual([
		{ type: "literal-match", key: "countPlural", value: "one" },
		{ type: "catchall-match", key: "countPlural" },
	]);
	// the catch-all keeps being picked for other numbers, the plural picks nothing else yet
	expect(
		selectVariant({
			message: en as never,
			variants: en.variants as never,
			declarations: plural.declarations,
			values: { count: 5 },
			locale: "en",
		})
	).toBe(en.variants[0]);
});

it("adds an ordinal plural and a select with empty forms for its values", () => {
	const ordinal = addSelector(bundle(), { variable: "count", kind: "ordinal" });
	expect(ordinal.declarations[1]).toMatchObject({
		name: "countOrdinal",
		value: {
			annotation: {
				name: "plural",
				options: [
					{ name: "type", value: { type: "literal", value: "ordinal" } },
				],
			},
		},
	});
	expect(
		selectorGroups(
			{ ...ordinal.messages[0]!, locale: "en" },
			ordinal.declarations
		)[0]!.plural?.type
	).toBe("ordinal");

	const select = addSelector(bundle(), {
		variable: "count",
		kind: "select",
		values: ["female", " male ", "female", "*", ""],
		locale: "en",
		createId,
	});
	expect(select.declarations).toEqual(bundle().declarations);
	const en = select.messages[0]!;
	// only the given language gets the empty forms, the others need them
	expect(select.messages[1]!.variants).toHaveLength(1);
	expect(() =>
		addSelector(bundle(), { variable: "count", kind: "select", values: ["a"] })
	).toThrow(/locale/);
	expect(en.selectors).toEqual([{ type: "variable-reference", name: "count" }]);
	expect(en.variants.map((v) => v.matches[0])).toEqual([
		{ type: "catchall-match", key: "count" },
		{ type: "literal-match", key: "count", value: "female" },
		{ type: "literal-match", key: "count", value: "male" },
	]);
	expect(en.variants.slice(1).every((v) => v.pattern.length === 0)).toBe(true);
	expect(new Set(en.variants.map((v) => v.id)).size).toBe(3);
});

it("adds the new selector to the matches of a message that already has selectors", () => {
	const first = addSelector(bundle(), {
		variable: "count",
		kind: "select",
		values: ["a"],
		locale: "en",
		createId,
	});
	first.declarations.push({ type: "input-variable", name: "who" });
	const second = addSelector(first, {
		variable: "who",
		kind: "select",
		values: ["x"],
		locale: "en",
		createId,
	});
	const en = second.messages[0]!;
	expect(en.selectors.map((s) => s.name)).toEqual(["count", "who"]);
	// 2 variants x (catch-all + "x")
	expect(en.variants).toHaveLength(4);
	expect(en.variants.every((v) => v.matches.length === 2)).toBe(true);
});

it("reuses a plural that is already declared and rejects invalid requests", () => {
	const icu: SelectorBundle = {
		declarations: icuExactPluralDeclarations,
		messages: [
			{
				id: "m",
				selectors: [],
				variants: [{ id: "v", matches: [], pattern: [] }],
			},
		],
	};
	const reused = addSelector(icu, { variable: "countPlural", kind: "plural" });
	expect(reused.declarations).toEqual(icuExactPluralDeclarations);
	expect(reused.messages[0]!.selectors).toEqual([
		{ type: "variable-reference", name: "countPlural" },
	]);
	expect(() =>
		addSelector(reused, { variable: "countPlural", kind: "plural" })
	).toThrow(/already a selector/);
	expect(() =>
		addSelector(bundle(), { variable: "nope", kind: "plural" })
	).toThrow(/not a variable/);
	// a second plural on the same input gets its own name
	const twice = addSelector(
		addSelector(bundle(), { variable: "count", kind: "plural" }),
		{ variable: "count", kind: "ordinal" }
	);
	expect(twice.messages[0]!.selectors.map((s) => s.name)).toEqual([
		"countPlural",
		"countOrdinal",
	]);
});

it("removes a selector again: keeps the catch-all form and drops unused local variables", () => {
	const plural = addSelector(bundle(), { variable: "count", kind: "plural" });
	const en = plural.messages[0]!;
	en.variants.push({
		id: "one",
		matches: [{ type: "literal-match", key: "countPlural", value: "one" }],
		pattern: [{ type: "text", value: "one item" }],
	});
	const removed = removeSelector(plural, "countPlural");
	expect(removed.declarations).toEqual(bundle().declarations);
	expect(removed.messages[0]!.selectors).toEqual([]);
	expect(removed.messages[0]!.variants).toHaveLength(1);
	expect(removed.messages[0]!.variants[0]!.matches).toEqual([]);
	expect(removed.messages[0]!.variants[0]!.pattern[1]).toEqual({
		type: "text",
		value: " items",
	});
	expect(
		removeSelector(plural, "countPlural", { keep: "one" }).messages[0]!
			.variants[0]!.pattern
	).toEqual([{ type: "text", value: "one item" }]);
	expect(() => removeSelector(removed, "countPlural")).toThrow(
		/not a selector/
	);
});

it("removes both selectors of an imported ICU exact number + plural", () => {
	const mk = (a: string, b: string, text: string) => ({
		id: `${a}${b}`,
		matches: [
			a === "*"
				? { type: "catchall-match" as const, key: "countPluralExact" }
				: { type: "literal-match" as const, key: "countPluralExact", value: a },
			b === "*"
				? { type: "catchall-match" as const, key: "countPlural" }
				: { type: "literal-match" as const, key: "countPlural", value: b },
		],
		pattern: [{ type: "text" as const, value: text }],
	});
	const icu: SelectorBundle = {
		declarations: icuExactPluralDeclarations,
		messages: [
			{
				id: "m",
				selectors: [
					{ type: "variable-reference", name: "countPluralExact" },
					{ type: "variable-reference", name: "countPlural" },
				],
				variants: [
					mk("0", "*", "none"),
					mk("*", "one", "one"),
					mk("*", "*", "many"),
				],
			},
		],
	};
	const removed = removeSelector(
		removeSelector(icu, "countPluralExact"),
		"countPlural"
	);
	expect(removed.declarations).toEqual([
		{ type: "input-variable", name: "count" },
	]);
	expect(removed.messages[0]!.variants).toEqual([
		{ id: "**", matches: [], pattern: [{ type: "text", value: "many" }] },
	]);
});

it("lists the variables that can still become a selector", () => {
	const plural = addSelector(bundle(), { variable: "count", kind: "plural" });
	expect(selectableVariables(bundle())).toEqual(["count"]);
	expect(selectableVariables(plural)).toEqual(["count"]);
	expect(selectableVariables(removeSelector(plural, "countPlural"))).toEqual([
		"count",
	]);
	const local = { ...plural, declarations: plural.declarations };
	expect(selectableVariables(local)).not.toContain("countPlural");
});
