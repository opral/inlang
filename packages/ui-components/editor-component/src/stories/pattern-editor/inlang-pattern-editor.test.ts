// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { Pattern, VariantRow } from "@inlang/sdk";
import { $getRoot, $getSelection, $isRangeSelection, type ElementNode } from "lexical";
import type { ChangeEventDetail } from "../../helper/event.js";
import type InlangPatternEditor from "./inlang-pattern-editor.js";
import "./inlang-pattern-editor.js";
import { $readPattern } from "./patternNodes.js";

// Lexical handles `beforeinput` (as in browsers) only where InputEvent has getTargetRanges, which
// happy-dom lacks. It checks once when it loads, so this runs before the imports.
vi.hoisted(() => {
	const proto = InputEvent.prototype as InputEvent & { getTargetRanges?: () => StaticRange[] };
	proto.getTargetRanges ??= () => [];
});

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


/**
 * Keys pressed faster than the browser reports the caret: the caret moved (End, an arrow key,
 * a click) but `selectionchange` has not reached Lexical yet, so Lexical's selection is stale.
 */
async function fastKeys(
	element: InlangPatternEditor,
	{ clickedAt, movedTo }: { clickedAt: number; movedTo: number },
	keys: (editable: HTMLElement) => void
) {
	const editable = element.querySelector<HTMLElement>("[contenteditable]")!;
	const text = editable.querySelector("[data-lexical-text]")!.firstChild!;
	editable.focus();
	// where the user clicked earlier: Lexical knows this caret
	window.getSelection()!.collapse(text, clickedAt);
	await new Promise((resolve) => setTimeout(resolve));
	const hold = (event: Event) => event.stopImmediatePropagation();
	document.addEventListener("selectionchange", hold, { capture: true });
	// happy-dom has no Selection.modify, which Lexical's Backspace and Delete use to find the
	// character to delete; a browser moves the native caret by one character
	const proto = Selection.prototype as Selection & { modify?: unknown };
	const nativeModify = proto.modify;
	proto.modify = function (this: Selection, alter: string, direction: string) {
		const node = this.focusNode!;
		const step = direction === "backward" || direction === "left" ? -1 : 1;
		const offset = Math.max(0, Math.min(node.textContent!.length, this.focusOffset + step));
		if (alter === "move") this.collapse(node, offset);
		else this.extend(node, offset);
	};
	try {
		window.getSelection()!.collapse(text, movedTo);
		// a task passes, as between key presses: only the held-back selectionchange is missing
		await new Promise((resolve) => setTimeout(resolve));
		keys(editable);
		await new Promise((resolve) => setTimeout(resolve));
	} finally {
		proto.modify = nativeModify;
		document.removeEventListener("selectionchange", hold, { capture: true });
	}
}

/** A key as the browser sends it: keydown, then beforeinput unless the keydown was handled. */
function press(editable: HTMLElement, key: string, inputType: string) {
	const keydown = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	editable.dispatchEvent(keydown);
	if (!keydown.defaultPrevented)
		editable.dispatchEvent(new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }));
}

it("keeps stored braces text on End then Backspace before selectionchange", async () => {
	const pattern: Pattern = [{ type: "text", value: "Hi {name}!" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 10 }, (editable) =>
		press(editable, "Backspace", "deleteContentBackward")
	);
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "Hi {name}" }]);
});

it("keeps stored braces text on a deleteContentBackward input (no Backspace keydown) before selectionchange", async () => {
	const pattern: Pattern = [{ type: "text", value: "Hi {name}!" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 10 }, (editable) =>
		editable.dispatchEvent(
			new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true })
		)
	);
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "Hi {name}" }]);
});

it("keeps stored braces text on a fast Delete that joins them with the text after", async () => {
	const pattern: Pattern = [{ type: "text", value: "a {name}!b" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 8 }, (editable) =>
		press(editable, "Delete", "deleteContentForward")
	);
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "a {name}b" }]);
});

/**
 * Types a character as the browser does: beforeinput, then (unless Lexical inserted it) the
 * browser writes it into the DOM text at the caret, then input.
 */
function typeKey(editable: HTMLElement, data: string) {
	editable.dispatchEvent(new KeyboardEvent("keydown", { key: data, bubbles: true, cancelable: true }));
	const beforeinput = new InputEvent("beforeinput", { inputType: "insertText", data, bubbles: true, cancelable: true });
	editable.dispatchEvent(beforeinput);
	if (beforeinput.defaultPrevented) return;
	const selection = window.getSelection()!;
	const node = selection.anchorNode as Text;
	const offset = selection.anchorOffset;
	node.data = node.data.slice(0, offset) + data + node.data.slice(offset);
	selection.collapse(node, offset + data.length);
	editable.dispatchEvent(new InputEvent("input", { inputType: "insertText", data, bubbles: true }));
}

it("still converts a } typed right after the caret moved, and keeps the stored braces text", async () => {
	const pattern: Pattern = [{ type: "text", value: "{lit} {who" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 10 }, (editable) => typeKey(editable, "}"));
	expect(lastPattern(changes)).toEqual([
		{ type: "text", value: "{lit} " },
		{ type: "expression", arg: { type: "variable-reference", name: "who" } },
	]);
});

it("keeps stored braces text when the user types right after End", async () => {
	const pattern: Pattern = [{ type: "text", value: "Hi {name}" }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 9 }, (editable) => typeKey(editable, "!"));
	expect(lastPattern(changes)).toEqual([{ type: "text", value: "Hi {name}!" }]);
});

it("converts a {name} pasted right after the caret moved, and keeps the stored braces text", async () => {
	const pattern: Pattern = [{ type: "text", value: "{a} | " }];
	const { element, changes } = await mount({ id: "v", message_id: "m", matches: [], pattern });
	await fastKeys(element, { clickedAt: 0, movedTo: 6 }, (editable) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", "{x}");
		editable.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
	});
	expect(lastPattern(changes)).toEqual([
		{ type: "text", value: "{a} | " },
		{ type: "expression", arg: { type: "variable-reference", name: "x" } },
	]);
});
