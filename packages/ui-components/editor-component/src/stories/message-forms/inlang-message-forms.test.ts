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
