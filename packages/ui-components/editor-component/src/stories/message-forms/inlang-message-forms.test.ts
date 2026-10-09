// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import type { Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import "./inlang-message-forms.js";

const plural = (options: Array<{ name: string; value: string }> = []): Declaration[] => [
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
				options: options.map(({ name, value }) => ({ name, value: { type: "literal", value } })),
			},
		},
	},
];

const message: MessageRow = {
	id: "m",
	bundle_id: "b",
	locale: "en",
	selectors: [{ type: "variable-reference", name: "countPlural" }],
};

const variant = (id: string, key: string, text: string): VariantRow => ({
	id,
	message_id: "m",
	matches: [
		key === "*"
			? { type: "catchall-match", key: "countPlural" }
			: { type: "literal-match", key: "countPlural", value: key },
	],
	pattern: [{ type: "text", value: text }],
});

async function mount(declarations: Declaration[], variants: VariantRow[]) {
	const element = document.createElement("inlang-message-forms");
	element.message = message;
	element.variants = variants;
	element.declarations = declarations;
	document.body.append(element);
	await element.updateComplete;
	const rows = Array.from(element.shadowRoot!.querySelectorAll<HTMLButtonElement>(".form"));
	return rows.map((row) => row.getAttribute("aria-label")!);
}

afterEach(() => document.body.replaceChildren());

it("shows an explicit `other` (Paraglide's shape) once and does not offer a second catch-all", async () => {
	const rows = await mount(plural(), [variant("one", "one", "# item"), variant("other", "other", "# items")]);
	expect(rows).toEqual(["one: # item", "other: # items"]);
});

it("shifts example numbers by an ICU offset and leaves out its exact numbers", async () => {
	const element = document.createElement("inlang-message-forms");
	element.message = message;
	element.declarations = plural([{ name: "offset", value: "1" }]);
	element.variants = [
		variant("0", "0", "nobody"),
		variant("1", "1", "you"),
		variant("one", "one", "you and one other"),
		variant("other", "*", "you and # others"),
	];
	document.body.append(element);
	await element.updateComplete;
	const hints = Array.from(element.shadowRoot!.querySelectorAll(".label")).map((label) => label.textContent!.replace(/\s+/g, " ").trim());
	// count 2 is "one" (2 - 1 = 1); 0 and 1 have their own forms
	expect(hints).toEqual(["0exactly", "1exactly", "one2", "other3, 4, 5…"]);
});

async function mountForms(props: Partial<HTMLElementTagNameMap["inlang-message-forms"]>) {
	const element = document.createElement("inlang-message-forms");
	Object.assign(element, props);
	const added: unknown[] = [];
	element.addEventListener("add-variant", (event) => added.push((event as CustomEvent).detail.matches));
	document.body.append(element);
	await element.updateComplete;
	const buttons = Array.from(element.shadowRoot!.querySelectorAll<HTMLButtonElement>(".form"));
	return { element, added, buttons, labels: buttons.map((b) => `${b.className}|${b.getAttribute("aria-label")}`) };
}

it("offers a category only millions select (French many) quietly instead of as a missing form", async () => {
	const { labels } = await mountForms({
		message: { ...message, locale: "fr" },
		declarations: plural(),
		variants: [variant("one", "one", "# élément"), variant("other", "*", "# éléments")],
	});
	expect(labels).toEqual([
		"form|one: # élément",
		"form optional|Add form many",
		"form|other: # éléments",
	]);
});

it("offers the ordinal forms of a plural with a variable type (i18next `type=$pluralType`) that `missing-variant` reports", async () => {
	const declarations: Declaration[] = [
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
	const form = (
		id: string,
		pluralType: string,
		category: string,
		text: string
	): VariantRow => ({
		id,
		message_id: "m",
		matches: [
			pluralType === "*"
				? { type: "catchall-match", key: "pluralType" }
				: { type: "literal-match", key: "pluralType", value: pluralType },
			category === "*"
				? { type: "catchall-match", key: "countPlural" }
				: { type: "literal-match", key: "countPlural", value: category },
		],
		pattern: [{ type: "text", value: text }],
	});
	const { labels, added, buttons } = await mountForms({
		message: {
			...message,
			selectors: [
				{ type: "variable-reference", name: "pluralType" },
				{ type: "variable-reference", name: "countPlural" },
			],
		},
		declarations,
		variants: [
			form("o1", "ordinal", "one", "#st"),
			form("o", "ordinal", "other", "#th"),
			form("c1", "*", "one", "# item"),
			form("c", "*", "other", "# items"),
		],
	});
	const missing = labels.filter((label) => label.startsWith("form missing"));
	expect(missing).toEqual([
		"form missing|Add form ordinal · two",
		"form missing|Add form ordinal · few",
	]);
	buttons
		.find(
			(button) => button.getAttribute("aria-label") === "Add form ordinal · two"
		)!
		.click();
	expect(added).toEqual([
		[
			{ type: "literal-match", key: "pluralType", value: "ordinal" },
			{ type: "literal-match", key: "countPlural", value: "two" },
		],
	]);
});
