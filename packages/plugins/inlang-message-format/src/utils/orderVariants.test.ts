import { describe, expect, test } from "vitest";
import type { Declaration, Match } from "@inlang/sdk";
import { orderVariants } from "./orderVariants.js";

const plural = (name: string, input: string): Declaration => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: input },
		annotation: { type: "function-reference", name: "plural", options: [] },
	},
});
const alias = (name: string, input: string): Declaration => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: input },
	},
});
const input = (name: string): Declaration => ({ type: "input-variable", name });

/** `"countPlural=one, gender=*"` → a variant with those matches */
const variant = (keys: string) => ({
	keys,
	matches: keys.split(", ").map((part): Match => {
		const [key, value] = part.split("=") as [string, string];
		return value === "*"
			? { type: "catchall-match", key }
			: { type: "literal-match", key, value };
	}),
});

function order(
	keys: string[],
	selectors: string[],
	declarations: Declaration[]
): string[] {
	return orderVariants(keys.map(variant), selectors, declarations).map(
		(v) => v.keys
	);
}

const countPlural = [input("count"), plural("countPlural", "count")];
const exactPlural = [
	input("count"),
	alias("countPluralExact", "count"),
	plural("countPlural", "count"),
];

describe("keeps the order if every input selects the variant it prefers", () => {
	test.each([
		{
			name: "plural categories, catch-all last",
			keys: ["countPlural=one", "countPlural=few", "countPlural=*"],
			selectors: ["countPlural"],
			declarations: countPlural,
		},
		{
			name: "select values in any order",
			keys: ["gender=male", "gender=female", "gender=*"],
			selectors: ["gender"],
			declarations: [input("gender")],
		},
		{
			// `countPlural=*, gender=female` is preferred for (1, female) by the
			// selector order, but `countPlural=one, gender=female` before both
			// catches that input
			name: "two selectors with every combination",
			keys: [
				"countPlural=one, gender=female",
				"countPlural=*, gender=female",
				"countPlural=one, gender=*",
				"countPlural=*, gender=*",
			],
			selectors: ["countPlural", "gender"],
			declarations: [...countPlural, input("gender")],
		},
		{
			name: "an exact number before its plural",
			keys: [
				"countPlural=*, countPluralExact=0",
				"countPlural=one, countPluralExact=*",
				"countPlural=*, countPluralExact=*",
			],
			selectors: ["countPluralExact", "countPlural"],
			declarations: exactPlural,
		},
		{
			name: "exact numbers of a plural before its categories",
			keys: [
				"countPlural=0",
				"countPlural=1",
				"countPlural=one",
				"countPlural=*",
			],
			selectors: ["countPlural"],
			declarations: countPlural,
		},
		{
			name: "exact numbers of an input in any order",
			keys: ["count=1", "count=0", "count=*"],
			selectors: ["count"],
			declarations: [input("count")],
		},
	])("$name", ({ keys, selectors, declarations }) => {
		expect(order(keys, selectors, declarations)).toStrictEqual(keys);
	});
});

describe("sorts the variants by preference if a variant shadows a preferred one", () => {
	test("an =0 form an editor added after the catch-all", () => {
		expect(
			order(
				[
					"countPlural=one, countPluralExact=*",
					"countPlural=*, countPluralExact=*",
					"countPlural=*, countPluralExact=0",
				],
				["countPluralExact", "countPlural"],
				exactPlural
			)
		).toStrictEqual([
			"countPlural=*, countPluralExact=0",
			"countPlural=one, countPluralExact=*",
			"countPlural=*, countPluralExact=*",
		]);
	});

	test("an =0 form after a plural category that selects 0 in French", () => {
		expect(
			order(
				[
					"countPlural=one, countPluralExact=*",
					"countPlural=*, countPluralExact=0",
					"countPlural=*, countPluralExact=*",
				],
				["countPluralExact", "countPlural"],
				exactPlural
			)
		).toStrictEqual([
			"countPlural=*, countPluralExact=0",
			"countPlural=one, countPluralExact=*",
			"countPlural=*, countPluralExact=*",
		]);
	});

	test("the catch-all first", () => {
		expect(
			order(
				["gender=*", "gender=male", "gender=female"],
				["gender"],
				[input("gender")]
			)
		).toStrictEqual(["gender=male", "gender=female", "gender=*"]);
	});

	test("an exact number of a plural after its category", () => {
		expect(
			order(
				["countPlural=one", "countPlural=1", "countPlural=*"],
				["countPlural"],
				countPlural
			)
		).toStrictEqual(["countPlural=1", "countPlural=one", "countPlural=*"]);
	});

	test("a partial catch-all before a variant the selector order prefers", () => {
		expect(
			order(
				[
					"countPlural=one, gender=*",
					"countPlural=*, gender=female",
					"countPlural=*, gender=*",
				],
				["gender", "countPlural"],
				[...countPlural, input("gender")]
			)
		).toStrictEqual([
			"countPlural=*, gender=female",
			"countPlural=one, gender=*",
			"countPlural=*, gender=*",
		]);
	});
});

test("ignores keys that aren't selectors", () => {
	const keys = ["count=*"];
	expect(order(keys, [], [input("count")])).toStrictEqual(keys);
});
