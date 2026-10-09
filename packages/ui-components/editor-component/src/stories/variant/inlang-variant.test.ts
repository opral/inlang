// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import type { Declaration, VariantRow } from "@inlang/sdk";
import type { ChangeEventDetail } from "../../helper/event.js";
import "./inlang-variant.js";

const declarations: Declaration[] = [
	{ type: "input-variable", name: "count" },
	{
		type: "local-variable",
		name: "amount",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
			annotation: { type: "function-reference", name: "plural", options: [] },
		},
	},
	{ type: "input-variable", name: "gender" },
];

async function mount(variant: VariantRow) {
	const element = document.createElement("inlang-variant");
	element.declarations = declarations;
	element.locale = "en";
	element.variants = [variant];
	element.variant = variant;
	const changes: ChangeEventDetail[] = [];
	element.addEventListener("change", (event) => changes.push((event as CustomEvent<ChangeEventDetail>).detail));
	document.body.append(element);
	await element.updateComplete;
	return { element, changes };
}

async function blur(element: HTMLElement & { updateComplete: Promise<unknown> }, key: string, value: string) {
	const input = element.shadowRoot!.getElementById(`v-${key}`) as HTMLInputElement;
	input.value = value;
	input.dispatchEvent(new Event("sl-blur"));
	await element.updateComplete;
	return element.shadowRoot!.querySelector('[role="alert"]')?.textContent ?? "";
}

afterEach(() => document.body.replaceChildren());

it("does not flag an unchanged imported category outside the locale on blur", async () => {
	// i18next imports `zero` for English, which English cardinal rules never select.
	const { element, changes } = await mount({ id: "v", message_id: "m", pattern: [], matches: [{ type: "literal-match", key: "amount", value: "zero" }] });
	expect(await blur(element, "amount", "zero")).toBe("");
	expect(changes).toEqual([]);
	expect(await blur(element, "amount", "few")).toBe("Choose one, other, *.");
	expect(changes).toEqual([]);
});

it("rejects a blank text match instead of saving an empty literal", async () => {
	const { element, changes } = await mount({ id: "v", message_id: "m", pattern: [], matches: [{ type: "literal-match", key: "gender", value: "male" }] });
	expect(await blur(element, "gender", "  ")).toContain("Enter a value");
	expect(changes).toEqual([]);
	expect(await blur(element, "gender", "female")).toBe("");
	expect((changes[0]?.newData as VariantRow).matches).toEqual([{ type: "literal-match", key: "gender", value: "female" }]);
});
