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

const exactDeclarations: Declaration[] = [
	...plural(),
	{
		type: "local-variable",
		name: "countPluralExact",
		value: { type: "expression", arg: { type: "variable-reference", name: "count" } },
	},
];
const match = (key: string, value: string) =>
	value === "*"
		? ({ type: "catchall-match", key } as const)
		: ({ type: "literal-match", key, value } as const);
const form = (id: string, matches: Record<string, string>, text: string): VariantRow => ({
	id,
	message_id: "m",
	matches: Object.entries(matches).map(([key, value]) => match(key, value)),
	pattern: [{ type: "text", value: text }],
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

it("needs the reference's exact number on a plural without an exact selector (countPlural=0) and adds it there", async () => {
	const reference = [
		form("e0", { countPluralExact: "0", countPlural: "*" }, "No items"),
		form("e1", { countPluralExact: "*", countPlural: "one" }, "# item"),
		form("e2", { countPluralExact: "*", countPlural: "*" }, "# items"),
	];
	const de = { ...message, locale: "de" };
	const missing = await mountForms({
		message: de,
		declarations: exactDeclarations,
		referenceVariants: reference,
		variants: [variant("one", "one", "# Element"), variant("other", "*", "# Elemente")],
	});
	expect(missing.labels[0]).toBe("form missing|Add form 0");
	missing.buttons[0]!.click();
	expect(missing.added).toEqual([[match("countPlural", "0")]]);
	document.body.replaceChildren();
	const present = await mountForms({
		message: de,
		declarations: exactDeclarations,
		referenceVariants: reference,
		variants: [variant("zero", "0", "Keine"), variant("one", "one", "# Element"), variant("other", "*", "# Elemente")],
	});
	expect(present.labels).toEqual(["form|0: Keine", "form|one: # Element", "form|other: # Elemente"]);
});

it("shows an exact number on the plural (countPlural=0) as the form of a message with an exact selector", async () => {
	const { labels } = await mountForms({
		message: {
			...message,
			selectors: [
				{ type: "variable-reference", name: "countPluralExact" },
				{ type: "variable-reference", name: "countPlural" },
			],
		},
		declarations: exactDeclarations,
		// the reference has `=0` on its exact selector; this message has it on the plural
		referenceVariants: [form("r0", { countPluralExact: "0", countPlural: "*" }, "No items")],
		variants: [
			form("a", { countPluralExact: "1", countPlural: "*" }, "One item"),
			form("b", { countPluralExact: "*", countPlural: "0" }, "Keine"),
			form("c", { countPluralExact: "*", countPlural: "one" }, "# item"),
			form("d", { countPluralExact: "*", countPlural: "*" }, "# items"),
		],
	});
	// the `0` form is shown, not a "+ Add" that would create a second one
	expect(labels).toEqual(["form|0: Keine", "form|1: One item", "form|one: # item", "form|other: # items"]);
});
