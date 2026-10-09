import { expect, test } from "vitest";
import type { Declaration } from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import {
	missingVariants,
	pluralRules,
	requiredVariants,
	resolveInputVariable,
	selectorGroups,
} from "./selectors.js";

const plural: Declaration[] = [
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
const genderPlural: Declaration[] = [
	{ type: "input-variable", name: "gender" },
	...plural,
];
/** What `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`. */
const icuExact: Declaration[] = [
	...plural,
	{
		type: "local-variable",
		name: "countPluralExact",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
	},
];

const variant = (values: Record<string, string>) => ({
	matches: Object.entries(values).map(
		([key, value]): Match =>
			value === "*"
				? { type: "catchall-match", key }
				: { type: "literal-match", key, value }
	),
});
const message = (
	locale: string,
	selectors: string[],
	variants: Record<string, string>[] = []
) => ({
	locale,
	selectors: selectors.map((name) => ({
		type: "variable-reference" as const,
		name,
	})),
	variants: variants.map(variant),
});
const values = (forms: Match[][]) =>
	forms.map((form) =>
		form
			.map((match) => (match.type === "literal-match" ? match.value : "*"))
			.join(" · ")
	);

const icuEnglish = message(
	"en",
	["countPluralExact", "countPlural"],
	[
		{ countPluralExact: "0", countPlural: "*" },
		{ countPluralExact: "*", countPlural: "one" },
		{ countPluralExact: "*", countPlural: "*" },
	]
);

test("a message without selectors needs one form without matches", () => {
	expect(requiredVariants(message("en", []), [])).toEqual([[]]);
});

test("plural categories follow the locale in CLDR order, ordinals too", () => {
	expect(
		values(requiredVariants(message("ru", ["countPlural"]), plural))
	).toEqual(["one", "few", "many", "*"]);
	const ordinal = structuredClone(plural);
	const local = ordinal[1]!;
	if (local.type === "local-variable")
		local.value.annotation!.options.push({
			name: "type",
			value: { type: "literal", value: "ordinal" },
		});
	expect(
		values(requiredVariants(message("en", ["countPlural"]), ordinal))
	).toEqual(["one", "two", "few", "*"]);
	expect(pluralRules("countPlural", ordinal, "en")?.type).toBe("ordinal");
});

test("an ICU offset keeps the plural rules known and is reported", () => {
	const withOptions = (options: { name: string; value: string }[]) => {
		const declarations = structuredClone(plural);
		const local = declarations[1]!;
		if (local.type === "local-variable")
			local.value.annotation!.options = options.map(({ name, value }) => ({
				name,
				value: { type: "literal", value },
			}));
		return declarations;
	};
	const offset = pluralRules(
		"countPlural",
		withOptions([{ name: "offset", value: "1" }]),
		"en"
	);
	expect(offset).toMatchObject({ offset: 1, categories: ["one", "other"] });
	expect(pluralRules("countPlural", plural, "en")?.offset).toBe(0);
	// an offset that is only known at runtime: unknown rules
	expect(
		pluralRules(
			"countPlural",
			withOptions([{ name: "offset", value: "n" }]),
			"en"
		)
	).toBeUndefined();
});

test("the cartesian product uses the literal values of a select and the catch-all", () => {
	const forms = requiredVariants(
		message(
			"ru",
			["gender", "countPlural"],
			[
				{ gender: "female", countPlural: "one" },
				{ gender: "male", countPlural: "*" },
			]
		),
		genderPlural
	);
	expect(forms).toHaveLength(12);
	expect(values(forms).slice(0, 5)).toEqual([
		"female · one",
		"female · few",
		"female · many",
		"female · *",
		"male · one",
	]);
	expect(forms.at(-1)![0]).toEqual({ type: "catchall-match", key: "gender" });
});

test("plurals with unknown rules need only the catch-all", () => {
	const m = message("zz", ["countPlural"], [{ countPlural: "one" }]);
	expect(values(requiredVariants(m, plural))).toEqual(["*"]);
	expect(selectorGroups(m, plural)[0]!.keys).toEqual(["one", "*"]);
});

test("an ICU exact number and the plural of the same input are one choice", () => {
	const groups = selectorGroups(icuEnglish, icuExact);
	expect(groups).toHaveLength(1);
	const group = groups[0]!;
	expect(group).toMatchObject({
		names: ["countPluralExact", "countPlural"],
		selector: "countPlural",
		exactSelector: "countPluralExact",
		input: "count",
		isPlural: true,
		plural: { type: "cardinal", categories: ["one", "other"] },
		keys: ["0", "one", "*"],
		requiredKeys: ["0", "one", "*"],
	});
	expect(group.values("0")).toEqual({
		countPluralExact: "0",
		countPlural: "*",
	});
	expect(group.values("one")).toEqual({
		countPluralExact: "*",
		countPlural: "one",
	});
	expect(icuEnglish.variants.map(group.keyOf)).toEqual(["0", "one", "*"]);
	// "0 · one" is never a form
	expect(values(requiredVariants(icuEnglish, icuExact))).toEqual([
		"0 · *",
		"* · one",
		"* · *",
	]);
	expect(missingVariants(icuEnglish, icuExact)).toEqual([]);
	expect(
		values(
			missingVariants({ ...icuEnglish, locale: "ru" }, icuExact, {
				referenceVariants: icuEnglish.variants,
			})
		)
	).toEqual(["* · few", "* · many"]);
});

test("the pair is found in either order, and a select with words on the input stays apart", () => {
	const after = message(
		"en",
		["countPlural", "count"],
		[
			{ count: "0", countPlural: "*" },
			{ count: "*", countPlural: "one" },
		]
	);
	expect(selectorGroups(after, plural).map((group) => group.names)).toEqual([
		["countPlural", "count"],
	]);
	expect(values(requiredVariants(after, plural))).toEqual([
		"* · 0",
		"one · *",
		"* · *",
	]);
	const words = message(
		"en",
		["count", "countPlural"],
		[{ count: "many", countPlural: "*" }]
	);
	expect(selectorGroups(words, plural).map((group) => group.names)).toEqual([
		["count"],
		["countPlural"],
	]);
});

test("a translation needs the reference's select values and exact numbers, not its plural categories", () => {
	const reference = [
		variant({ gender: "female" }),
		variant({ gender: "male" }),
		variant({ gender: "*" }),
	];
	const german = message("de", ["gender"]);
	expect(values(requiredVariants(german, genderPlural))).toEqual(["*"]);
	expect(
		values(
			requiredVariants(german, genderPlural, { referenceVariants: reference })
		)
	).toEqual(["female", "male", "*"]);
	// the reference's order first, then values only the translation has
	expect(
		selectorGroups(
			message("de", ["gender"], [{ gender: "diverse" }, { gender: "female" }]),
			genderPlural,
			{ referenceVariants: reference }
		)[0]!.keys
	).toEqual(["female", "male", "diverse", "*"]);
	expect(
		values(
			requiredVariants(message("de", ["countPlural"]), plural, {
				referenceVariants: [variant({ countPlural: "few" })],
			})
		)
	).toEqual(["one", "*"]);
	expect(
		values(
			missingVariants(
				message(
					"de",
					["countPluralExact", "countPlural"],
					[{ countPluralExact: "*", countPlural: "*" }]
				),
				icuExact,
				{ referenceVariants: icuEnglish.variants }
			)
		)
	).toEqual(["0 · *", "* · one"]);
});

test("an explicit other covers the catch-all, a missing match counts as catch-all", () => {
	expect(
		missingVariants(
			message(
				"en",
				["countPlural"],
				[{ countPlural: "one" }, { countPlural: "other" }]
			),
			plural
		)
	).toEqual([]);
	// ICU `{gender, select, female {{count, plural, …}} other {…}}`: the catch-all has no plural match
	expect(
		values(
			missingVariants(
				message(
					"en",
					["gender", "countPlural"],
					[
						{ gender: "female", countPlural: "one" },
						{ gender: "female", countPlural: "*" },
						{ gender: "*" },
					]
				),
				genderPlural
			)
		)
	).toEqual(["* · one"]);
});

test("resolveInputVariable follows local aliases", () => {
	expect(resolveInputVariable("countPluralExact", icuExact)).toBe("count");
	expect(resolveInputVariable("count", icuExact)).toBe("count");
	expect(resolveInputVariable("unknown", icuExact)).toBe("unknown");
});
