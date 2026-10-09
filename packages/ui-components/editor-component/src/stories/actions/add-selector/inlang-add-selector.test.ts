// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import type { BundleRow, Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import type { ChangeEventDetail } from "../../../helper/event.js";
import { selectorMatches } from "../../../helper/selectorMatches.js";
import "./inlang-add-selector.js";

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

async function mount(props: { message?: MessageRow; variables?: Declaration[] } = {}) {
	const bundle: BundleRow = { id: "b", declarations: props.variables ?? declarations };
	const variants: VariantRow[] = [{ id: "v", message_id: "m", matches: [], pattern: [] }];
	const element = document.createElement("inlang-add-selector");
	element.bundle = bundle;
	if (props.message) element.message = props.message;
	element.variants = variants;
	const changes: ChangeEventDetail[] = [];
	element.addEventListener("change", (event) => changes.push((event as CustomEvent<ChangeEventDetail>).detail));
	document.body.append(element);
	await settle(element);
	return { element, changes };
}

async function settle(element: HTMLElement & { updateComplete: Promise<unknown> }) {
	for (let i = 0; i < 4; i++) {
		await element.updateComplete;
		await new Promise((resolve) => setTimeout(resolve));
	}
}

const message = (): MessageRow => ({ id: "m", bundle_id: "b", locale: "en", selectors: [] });
const state = (element: HTMLElement) => element as unknown as { _matchers: string[]; _matchError: string; _variable?: Declaration };
const options = (element: HTMLElement) => Array.from(element.shadowRoot!.querySelectorAll<HTMLInputElement>("sl-input.option"));
const submit = (element: HTMLElement) =>
	Array.from(element.shadowRoot!.querySelectorAll<HTMLElement>("sl-button")).find((button) => button.textContent?.includes("Add selector"))!.click();
const edit = (input: HTMLInputElement, value: string) => {
	input.value = value;
	input.dispatchEvent(new Event("input"));
};

afterEach(() => document.body.replaceChildren());

it("rejects an edited plural matcher and leaves the shared category cache intact", async () => {
	const { element, changes } = await mount({ message: message() });
	const select = element.shadowRoot!.querySelector<HTMLInputElement>("sl-select")!;
	select.value = "amount";
	select.dispatchEvent(new CustomEvent("sl-change"));
	await settle(element);
	expect(state(element)._matchers).toEqual(["one", "other", "*"]);

	edit(options(element)[0]!, "banana");
	submit(element);
	await settle(element);

	expect(state(element)._matchError).toBe("Choose one, other, *.");
	expect(element.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain("Choose one, other, *.");
	expect(changes).toEqual([]);
	expect(selectorMatches("amount", declarations, "en", []).allowed).toEqual(["one", "other", "*"]);
});

it("renders without a message instead of throwing once an input is selected", async () => {
	const { element } = await mount();
	expect(state(element)._variable?.name).toBe("count");
	expect(element.shadowRoot!.querySelector("sl-select")).not.toBeNull();
	expect(element.shadowRoot!.querySelector(".options-container")).toBeNull();
});

it("explains a duplicate selector instead of failing silently", async () => {
	const current = message();
	const { element, changes } = await mount({ message: current });
	current.selectors.push({ type: "variable-reference", name: "count" });
	submit(element);
	await settle(element);
	expect(state(element)._matchError).toContain("count is already a selector");
	expect(changes).toEqual([]);
});

it("drops blank and duplicate text matchers and moves to the next input", async () => {
	const { element, changes } = await mount({ message: message() });
	expect(state(element)._variable?.name).toBe("count");
	state(element)._matchers = ["male", "", "  ", "male", "*"];
	await settle(element);
	submit(element);
	await settle(element);

	const created = changes.filter((change) => change.entity === "variant" && change.entityId !== "v");
	expect(created.map((change) => (change.newData as VariantRow).matches)).toEqual([
		[{ type: "literal-match", key: "count", value: "male" }],
	]);
	expect(state(element)._variable?.name).toBe("amount");
});
