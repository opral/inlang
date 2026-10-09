import { createHash } from "node:crypto";
import type { Rows } from "./harness.js";

/**
 * A stable id that looks like the uuids editors generate. Derived from a hash,
 * so the id order is unrelated to the order in which rows are created, like
 * in a real project.
 */
export function stableUuid(label: string): string {
	const hex = createHash("sha1").update(label).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const text = (value: string) => ({ type: "text", value });
const ref = (name: string) => ({
	type: "expression",
	arg: { type: "variable-reference", name },
});
const input = (name: string) => ({
	type: "input-variable",
	name,
});
const local = (
	name: string,
	arg: string,
	annotation?: { name: string; options?: unknown[] }
) => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: arg },
		...(annotation
			? {
					annotation: {
						type: "function-reference",
						name: annotation.name,
						options: annotation.options ?? [],
					},
				}
			: {}),
	},
});
const selector = (name: string) => ({ type: "variable-reference", name });
const exact = (key: string, value: string) => ({
	type: "literal-match",
	key,
	value,
});
const any = (key: string) => ({ type: "catchall-match", key });

type MessageSpec = {
	selectors?: string[];
	variants: Array<{ matches?: unknown[]; pattern: unknown[] }>;
};

export type BundleSpec = {
	id: string;
	declarations?: unknown[];
	messages: Record<string, MessageSpec>;
};

export function rowsFromSpecs(
	specs: BundleSpec[],
	salt = "",
	idPrefix = ""
): Rows {
	const rows: Rows = { bundles: [], messages: [], variants: [] };
	for (const spec of specs) {
		const bundleId = idPrefix + spec.id;
		rows.bundles.push({ id: bundleId, declarations: spec.declarations ?? [] });
		for (const [locale, message] of Object.entries(spec.messages)) {
			const messageId = stableUuid(`${salt}${spec.id}/${locale}`);
			rows.messages.push({
				id: messageId,
				bundleId,
				locale,
				selectors: (message.selectors ?? []).map(selector),
			});
			message.variants.forEach((variant, index) => {
				rows.variants.push({
					id: stableUuid(`${salt}${spec.id}/${locale}/${index}`),
					messageId,
					matches: variant.matches ?? [],
					pattern: variant.pattern,
				});
			});
		}
	}
	return rows;
}

/**
 * Messages the way editors (Fink, Parrot, the editor components) create them
 * in the database, not the way a storage plugin imports them:
 *
 * - selectors in the order the translator added them, not sorted
 * - uuid ids, so the stored order of variants is unrelated to their meaning
 * - plurals with exact numbers in the shape of `addExactNumber`
 * - markup, escapes and formatted placeholders
 */
export const editorSpecs: BundleSpec[] = [
	{
		id: "greeting",
		declarations: [input("name")],
		messages: {
			en: { variants: [{ pattern: [text("Hello "), ref("name"), text("!")] }] },
			de: { variants: [{ pattern: [text("Hallo "), ref("name"), text("!")] }] },
		},
	},
	{
		id: "items_count",
		declarations: [
			input("count"),
			local("countPlural", "count", { name: "plural" }),
		],
		messages: {
			en: {
				selectors: ["countPlural"],
				variants: [
					{
						matches: [exact("countPlural", "one")],
						pattern: [text("One item")],
					},
					{
						matches: [any("countPlural")],
						pattern: [ref("count"), text(" items")],
					},
				],
			},
			de: {
				selectors: ["countPlural"],
				variants: [
					{
						matches: [any("countPlural")],
						pattern: [ref("count"), text(" Artikel")],
					},
					{
						matches: [exact("countPlural", "one")],
						pattern: [text("Ein Artikel")],
					},
				],
			},
		},
	},
	{
		// selectors in the order the translator added them: gender, then plural
		id: "invite",
		declarations: [
			input("count"),
			input("gender"),
			local("countPlural", "count", { name: "plural" }),
		],
		messages: {
			en: {
				selectors: ["gender", "countPlural"],
				variants: [
					{
						matches: [exact("gender", "female"), exact("countPlural", "one")],
						pattern: [text("She invited one guest")],
					},
					{
						matches: [exact("gender", "female"), any("countPlural")],
						pattern: [text("She invited "), ref("count"), text(" guests")],
					},
					{
						matches: [any("gender"), exact("countPlural", "one")],
						pattern: [text("They invited one guest")],
					},
					{
						matches: [any("gender"), any("countPlural")],
						pattern: [text("They invited "), ref("count"), text(" guests")],
					},
				],
			},
		},
	},
	{
		// ICU `{count, plural, =0 {…} one {…} other {…}}` as editors and
		// `@inlang/plugin-icu1` store it
		id: "cart",
		declarations: [
			input("count"),
			local("countPluralExact", "count"),
			local("countPlural", "count", { name: "plural" }),
		],
		messages: {
			en: {
				selectors: ["countPluralExact", "countPlural"],
				variants: [
					{
						matches: [exact("countPluralExact", "0"), any("countPlural")],
						pattern: [text("Your cart is empty")],
					},
					{
						matches: [any("countPluralExact"), exact("countPlural", "one")],
						pattern: [text("One item in your cart")],
					},
					{
						matches: [any("countPluralExact"), any("countPlural")],
						pattern: [ref("count"), text(" items in your cart")],
					},
				],
			},
		},
	},
	{
		// a select alone, values added in the editor
		id: "pronoun",
		declarations: [input("gender")],
		messages: {
			en: {
				selectors: ["gender"],
				variants: [
					{ matches: [any("gender")], pattern: [text("they")] },
					{ matches: [exact("gender", "male")], pattern: [text("he")] },
					{ matches: [exact("gender", "female")], pattern: [text("she")] },
				],
			},
		},
	},
	{
		id: "rich_text",
		declarations: [input("name"), input("link")],
		messages: {
			en: {
				variants: [
					{
						pattern: [
							{ type: "markup-start", name: "b", options: [], attributes: [] },
							text("Hi "),
							ref("name"),
							{ type: "markup-end", name: "b", options: [], attributes: [] },
							text(", read the "),
							{
								type: "markup-start",
								name: "link",
								options: [
									{
										name: "to",
										value: { type: "variable-reference", name: "link" },
									},
								],
								attributes: [],
							},
							text("docs"),
							{ type: "markup-end", name: "link", options: [], attributes: [] },
							{
								type: "markup-standalone",
								name: "icon",
								options: [],
								attributes: [],
							},
						],
					},
				],
			},
		},
	},
	{
		id: "escapes",
		messages: {
			en: {
				variants: [
					{ pattern: [text('Use {braces}, a backslash \\ and "quotes"')] },
				],
			},
		},
	},
	{
		id: "nav.home.title",
		messages: {
			en: { variants: [{ pattern: [text("Home")] }] },
			de: { variants: [{ pattern: [text("Startseite")] }] },
		},
	},
];

export const editorRows = rowsFromSpecs(editorSpecs);
