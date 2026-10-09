// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import type { Pattern, VariantRow } from "@inlang/sdk";
import { $getRoot, $getSelection, $isRangeSelection, type ElementNode } from "lexical";
import type { ChangeEventDetail } from "../../helper/event.js";
import type InlangPatternEditor from "./inlang-pattern-editor.js";
import "./inlang-pattern-editor.js";
import { $readPattern } from "./patternNodes.js";

async function mount(variant: VariantRow) {
	const element = document.createElement("inlang-pattern-editor");
	element.variant = variant;
	const changes: ChangeEventDetail[] = [];
	element.addEventListener("change", (event) =>
		changes.push((event as CustomEvent<ChangeEventDetail>).detail)
	);
	document.body.append(element);
	await element.updateComplete;
	return { element, changes };
}

/** Types `text` at the caret (at the end without a selection), as the user would. */
function type(element: InlangPatternEditor, text: string) {
	element.editor.update(
		() => {
			let selection = $getSelection();
			if (!$isRangeSelection(selection)) {
				$getRoot().selectEnd();
				selection = $getSelection();
			}
			if ($isRangeSelection(selection)) selection.insertText(text);
		},
		{ discrete: true }
	);
}

async function setVariant(element: InlangPatternEditor, variant: VariantRow) {
	element.variant = variant;
	await element.updateComplete;
}

const lastPattern = (changes: ChangeEventDetail[]) =>
	(changes.at(-1)?.newData as VariantRow | undefined)?.pattern;

/** Sorts object keys the way the SDK database returns JSON (`{"arg":…,"type":…}`). */
function sortKeys<T>(value: T): T {
	if (Array.isArray(value)) return value.map(sortKeys) as T;
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
	) as T;
}

afterEach(() => document.body.replaceChildren());

it("replaces the content when the host passes another variant (+ Add form), even with unsaved typing", async () => {
	const v1: VariantRow = { id: "V1", message_id: "m", matches: [], pattern: [] };
	const { element, changes } = await mount(v1);
	type(element, "abc");
	expect(changes.at(-1)).toMatchObject({ entityId: "V1" });
	// the host adds a new form and shows it in this editor before echoing "abc"
	await setVariant(element, { id: "V2", message_id: "m", matches: [], pattern: [] });
	type(element, "d");
	expect(changes.at(-1)).toMatchObject({ entityId: "V2" });
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "d" }]);
	// a late echo of V1's typing does not leak into V2 either
	await setVariant(element, { id: "V2", message_id: "m", matches: [], pattern: [] });
	expect(element.editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("d");
});

it("takes the database's echo (sorted keys) of a pattern with a token for an echo", async () => {
	const { loadProjectInMemory, newProject } = await import("@inlang/sdk");
	const project = await loadProjectInMemory({ blob: await newProject() });
	try {
		await project.db.insertInto("inlang_bundle").values({ id: "b", declarations: [] }).execute();
		await project.db.insertInto("inlang_message").values({ id: "m", bundle_id: "b", locale: "en", selectors: [] }).execute();
		await project.db.insertInto("inlang_variant").values({ id: "v", message_id: "m", matches: [], pattern: [] }).execute();
		const load = () =>
			project.db.selectFrom("inlang_variant").select(["id", "message_id", "matches", "pattern"]).where("id", "=", "v").executeTakeFirstOrThrow() as Promise<VariantRow>;
		const { element, changes } = await mount(await load());
		element.insertExpression("count");
		const firstSave = lastPattern(changes)!;
		// the user keeps typing while the first save is on its way
		type(element, " items");
		await project.db.updateTable("inlang_variant").set({ pattern: firstSave }).where("id", "=", "v").execute();
		const echo = await load();
		expect(JSON.stringify(echo.pattern)).not.toBe(JSON.stringify(firstSave));
		await setVariant(element, echo);
		expect(element.editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("{count} items");
	} finally {
		await project.close();
	}
}, 60_000);

it("keeps typing when an older save comes back with reordered keys", async () => {
	const pattern: Pattern = [
		{ type: "text", value: "Hi " },
		{ type: "expression", arg: { type: "variable-reference", name: "name" } },
	];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	type(element, "!");
	const firstSave = lastPattern(changes)!;
	type(element, "!");
	await setVariant(element, { id: "v", message_id: "m", matches: [], pattern: sortKeys(firstSave) });
	expect(element.editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("Hi {name}!!");
});

it("shows stored braces as text and keeps them text when the user types (ICU '{'literal'}')", async () => {
	const pattern: Pattern = [{ type: "text", value: "It's {literal}" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	expect(element.editor.getEditorState().read($readPattern)).toEqual(pattern);
	expect(changes).toEqual([]);
	type(element, "!");
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "It's {literal}!" }]);
});

it("keeps a lone markup-start (valid MF2) when the user types", async () => {
	const pattern: Pattern = [
		{ type: "markup-start", name: "br" },
		{ type: "text", value: "Hello" },
	];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	type(element, "!");
	expect(lastPattern(changes)).toEqual([
		{ type: "markup-start", name: "br" },
		{ type: "text", value: "Hello!" },
	]);
});

it("still removes the partner when one tag of a pair is deleted", async () => {
	const pattern: Pattern = [
		{ type: "markup-start", name: "br" },
		{ type: "markup-start", name: "b" },
		{ type: "text", value: "Hi" },
		{ type: "markup-end", name: "b" },
	];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	element.editor.update(
		() => {
			const block = $getRoot().getFirstChild() as ElementNode;
			block.getChildren()[1]!.remove();
		},
		{ discrete: true }
	);
	await new Promise((resolve) => setTimeout(resolve));
	expect(lastPattern(changes)).toEqual([
		{ type: "markup-start", name: "br" },
		{ type: "text", value: "Hi" },
	]);
});

it("ignores shortcut keys while an IME composes text", async () => {
	const { element } = await mount({ id: "v", message_id: "m", matches: [], pattern: [{ type: "text", value: "abc" }] });
	element.markupOptions = [{ part: { type: "markup-start", name: "b", options: [], attributes: [] }, label: "Bold" }];
	await element.updateComplete;
	const editable = element.querySelector<HTMLElement>("[contenteditable]")!;
	const composing = new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true, isComposing: true });
	editable.dispatchEvent(composing);
	expect(composing.defaultPrevented).toBe(false);
	const ime = new KeyboardEvent("keydown", { key: "b", keyCode: 229, metaKey: true, bubbles: true, cancelable: true } as KeyboardEventInit);
	editable.dispatchEvent(ime);
	expect(ime.defaultPrevented).toBe(false);
	// outside a composition the shortcut is handled
	const plain = new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true, cancelable: true });
	editable.dispatchEvent(plain);
	expect(plain.defaultPrevented).toBe(true);
});
