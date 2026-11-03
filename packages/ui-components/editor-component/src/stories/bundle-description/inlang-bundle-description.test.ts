// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import "./inlang-bundle-description.js";

afterEach(() => document.body.replaceChildren());

async function create(description: string | null = "<b>Save money</b>") {
	const element = document.createElement("inlang-bundle-description");
	element.bundle = { id: "save", declarations: [], description };
	document.body.append(element);
	await element.updateComplete;
	const changes = vi.fn();
	element.addEventListener("change", changes);
	return { element, changes };
}
async function edit(
	element: Awaited<ReturnType<typeof create>>["element"],
	value: string
) {
	element.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
	await element.updateComplete;
	const input = element.shadowRoot!.querySelector("textarea")!;
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	return input;
}

it("reads plain text beside source actions, and only opens a form on request", async () => {
	const { element } = await create();
	expect(element.shadowRoot!.textContent).toContain("<b>Save money</b>");
	expect(element.shadowRoot!.querySelector("b")).toBeNull();
	expect(element.shadowRoot!.querySelector("textarea")).toBeNull();
	const code = document.createElement("button");
	code.slot = "context";
	code.textContent = "code";
	element.append(code);
	const slot = element.shadowRoot!.querySelector("slot")!;
	slot.dispatchEvent(new Event("slotchange"));
	await element.updateComplete;
	expect(slot.assignedElements()).toContain(code);
	expect(element.shadowRoot!.querySelector(".separator")?.textContent).toBe(
		"·"
	);
});

it("keeps typing and blur local, then emits exactly one canonical change on Save", async () => {
	const { element, changes } = await create();
	const input = await edit(element, "Shopping CTA\nKeep it short");
	input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
	expect(changes).not.toHaveBeenCalled();
	element.shadowRoot!.querySelector<HTMLButtonElement>(".save")!.click();
	await element.updateComplete;
	expect(changes).toHaveBeenCalledTimes(1);
	expect(changes.mock.calls[0]![0].detail).toEqual({
		entity: "bundle",
		entityId: "save",
		newData: {
			id: "save",
			declarations: [],
			description: "Shopping CTA\nKeep it short",
		},
	});
	expect(element.shadowRoot!.querySelector("textarea")).toBeNull();
	expect(element.shadowRoot!.querySelector(".trigger")?.textContent).toBe(
		"Shopping CTA\nKeep it short"
	);
});

it("cancels keyboard edits without persisting and restores focus", async () => {
	const { element, changes } = await create("Existing guidance");
	const input = await edit(element, "Discard me");
	input.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
	);
	await element.updateComplete;
	expect(changes).not.toHaveBeenCalled();
	expect(element.shadowRoot!.querySelector(".trigger")?.textContent).toBe(
		"Existing guidance"
	);
	expect(element.shadowRoot!.activeElement).toBe(
		element.shadowRoot!.querySelector(".trigger")
	);
});

it("clears guidance explicitly and normalizes whitespace to null", async () => {
	const { element, changes } = await create("Guidance");
	await edit(element, "Ignored draft");
	element.shadowRoot!.querySelector<HTMLButtonElement>(".clear")!.click();
	await element.updateComplete;
	expect(changes.mock.calls[0]![0].detail.newData.description).toBeNull();
	expect(element.shadowRoot!.querySelector(".trigger")?.textContent).toBe(
		"Add description"
	);
	element.bundle = { ...element.bundle, description: "Restored guidance" };
	await element.updateComplete;
	const input = await edit(element, " \n\t ");
	input.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })
	);
	expect(changes.mock.calls[1]![0].detail.newData.description).toBeNull();
});

it("reflects external changes, cancels a draft when switching bundles, and skips unchanged writes", async () => {
	const { element, changes } = await create(null);
	await edit(element, "");
	element.shadowRoot!.querySelector<HTMLButtonElement>(".save")!.click();
	await element.updateComplete;
	expect(changes).not.toHaveBeenCalled();
	element.bundle = { ...element.bundle, description: "New guidance" };
	await element.updateComplete;
	expect(element.shadowRoot!.querySelector(".trigger")?.textContent).toBe(
		"New guidance"
	);
	await edit(element, "An unfinished draft");
	element.bundle = {
		id: "other",
		declarations: [],
		description: "Other guidance",
	};
	await element.updateComplete;
	expect(element.shadowRoot!.querySelector("textarea")).toBeNull();
	expect(element.shadowRoot!.querySelector(".trigger")?.textContent).toBe(
		"Other guidance"
	);
});

it("makes disabled guidance readable without offering edits", async () => {
	const { element, changes } = await create("Read me");
	element.disabled = true;
	await element.updateComplete;
	expect(element.shadowRoot!.querySelector(".copy")?.textContent).toBe(
		"Read me"
	);
	expect(element.shadowRoot!.querySelector("button")).toBeNull();
	expect(changes).not.toHaveBeenCalled();
});
