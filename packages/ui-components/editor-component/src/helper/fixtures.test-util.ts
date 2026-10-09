import type { Declaration, MessageRow, Pattern, VariantRow } from "@inlang/sdk";

/** Test fixtures shared by helper tests. */

export const text = (value: string) => ({ type: "text", value }) as const;
export const v = (name: string) =>
	({ type: "expression", arg: { type: "variable-reference", name } }) as const;

export const pluralDeclarations: Declaration[] = [
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

export const genderPluralDeclarations: Declaration[] = [
	{ type: "input-variable", name: "actorName" },
	{ type: "input-variable", name: "actorGender" },
	...pluralDeclarations,
];

let id = 0;
export function variant(
	matches: Record<string, string>,
	pattern: Pattern,
	messageId = "m"
): VariantRow {
	return {
		id: `v${++id}`,
		message_id: messageId,
		matches: Object.entries(matches).map(([key, value]) =>
			value === "*"
				? { type: "catchall-match", key }
				: { type: "literal-match", key, value }
		),
		pattern,
	};
}

export function message(
	locale: string,
	selectors: string[],
	id = "m"
): MessageRow {
	return {
		id,
		bundle_id: "b",
		locale,
		selectors: selectors.map((name) => ({ type: "variable-reference", name })),
	};
}

/** What `@inlang/plugin-icu1` imports for `{count, plural, =0 {…} one {…} other {…}}`. */
export const icuExactPluralDeclarations: Declaration[] = [
	{ type: "input-variable", name: "count" },
	{
		type: "local-variable",
		name: "countPluralExact",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
	},
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
