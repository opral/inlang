import { expect, it } from "vitest";
import type { Pattern } from "@inlang/sdk";
import {
	$createRangeSelection,
	$getRoot,
	$getSelection,
	$isElementNode,
	$setCompositionKey,
	$setSelection,
	TextNode,
	createEditor,
	type LexicalEditor,
	type RangeSelection,
} from "lexical";
import {
	$caretQuery,
	$insertVariableAt,
	$removeOrphanMarkup,
	$wrapSelection,
	$getCaretOffset,
	$isPatternTokenNode,
	$keepCaretOutOfTokens,
	$readPattern,
	$setCaretOffset,
	$setPattern,
	registerVariableText,
	PatternTokenNode,
	tokenText,
	tokenTitle,
} from "./patternNodes.js";

const setup = () => {
	const editor = createEditor({
		nodes: [PatternTokenNode],
		onError: (e) => {
			throw e;
		},
	});
	registerVariableText(editor);
	return editor;
};
const update = (editor: LexicalEditor, fn: () => void) =>
	editor.update(fn, { discrete: true });
const read = <T>(editor: LexicalEditor, fn: () => T) =>
	editor.getEditorState().read(fn);
const children = () => {
	const block = $getRoot().getFirstChild();
	return $isElementNode(block) ? block.getChildren() : [];
};

const pattern: Pattern = [
	{ type: "text", value: "Welcome back, " },
	{ type: "markup-start", name: "b" },
	{
		type: "expression",
		arg: { type: "variable-reference", name: "name" },
		annotation: { type: "function-reference", name: "string", options: [] },
	},
	{ type: "markup-end", name: "b" },
	{ type: "text", value: "!\nSee you" },
];

it("round-trips patterns including markup, annotations and newlines", () => {
	const editor = setup();
	update(editor, () => $setPattern(pattern));
	expect(read(editor, $readPattern)).toEqual(pattern);
	const tokens = read(editor, () =>
		children()
			.filter($isPatternTokenNode)
			.map((n) => n.getTextContent())
	);
	expect(tokens).toEqual(["<b>", "{name}", "</b>"]);
});

it("makes tokens atomic and formats text between known markup", () => {
	const editor = setup();
	update(editor, () => $setPattern(pattern));
	read(editor, () => {
		const token = children().find($isPatternTokenNode)!;
		expect(token.isToken()).toBe(true);
		expect(token.canInsertTextAfter()).toBe(false);
		const name = children().find(
			(n) => $isPatternTokenNode(n) && n.getPart().type === "expression"
		) as TextNode;
		expect(name.hasFormat("bold")).toBe(true);
		const first = children()[0] as TextNode;
		expect(first.hasFormat("bold")).toBe(false);
	});
});

it("turns typed {name} text into an expression token", () => {
	const editor = setup();
	update(editor, () => $setPattern([{ type: "text", value: "Hi " }]));
	update(editor, () => {
		const text = children()[0] as TextNode;
		text.setTextContent("Hi {user}, you have {count} items");
	});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "Hi " },
		{ type: "expression", arg: { type: "variable-reference", name: "user" } },
		{ type: "text", value: ", you have " },
		{ type: "expression", arg: { type: "variable-reference", name: "count" } },
		{ type: "text", value: " items" },
	]);
});

/** Puts a collapsed caret into the text node at `index` of the first paragraph. */
const caretAt = (index: number, offset: number) => {
	const node = children()[index] as TextNode;
	const selection = $createRangeSelection();
	selection.anchor.set(node.getKey(), offset, "text");
	selection.focus.set(node.getKey(), offset, "text");
	$setSelection(selection);
	return selection;
};

it("keeps braces of stored text as text (escaped ICU '{'literal'}')", () => {
	const editor = setup();
	const stored: Pattern = [
		{ type: "text", value: "It's {literal} " },
		{ type: "expression", arg: { type: "variable-reference", name: "n" } },
		{ type: "text", value: " {tags}" },
	];
	update(editor, () => $setPattern(stored));
	expect(read(editor, $readPattern)).toEqual(stored);
});

it("keeps stored braces as text when the user types into the same text", () => {
	const editor = setup();
	update(editor, () => $setPattern([{ type: "text", value: "It's {literal} here" }]));
	update(editor, () => caretAt(0, 4).insertText("!"));
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "It's! {literal} here" },
	]);
	// deleting next to the braces does not turn them into a variable either
	update(editor, () => {
		const selection = caretAt(0, 5);
		selection.anchor.offset = 4;
		selection.removeText();
	});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "It's {literal} here" },
	]);
});

it("turns only the typed {name} into a token next to stored braces", () => {
	const editor = setup();
	update(editor, () => $setPattern([{ type: "text", value: "{literal} for " }]));
	// typed key by key
	for (const key of ["{", "w", "h", "o", "}"])
		update(editor, () => {
			$getRoot().selectEnd();
			($getSelection() as RangeSelection).insertText(key);
		});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "{literal} for " },
		{ type: "expression", arg: { type: "variable-reference", name: "who" } },
	]);
	// pasted at once, with two variables, between stored text
	update(editor, () => $setPattern([{ type: "text", value: "{a} | {b}" }]));
	update(editor, () => caretAt(0, 4).insertText("{x} and {y} "));
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "{a} " },
		{ type: "expression", arg: { type: "variable-reference", name: "x" } },
		{ type: "text", value: " and " },
		{ type: "expression", arg: { type: "variable-reference", name: "y" } },
		{ type: "text", value: " | {b}" },
	]);
	// the caret stays behind the pasted text
	read(editor, () => expect($getCaretOffset()).toBe("{a} {x} and {y} ".length));
});

const text = (value: string) => ({ type: "text", value }) as const;
const variable = (name: string) =>
	({ type: "expression", arg: { type: "variable-reference", name } }) as const;

it("keeps stored braces as text when Lexical splits or merges their text", () => {
	const editor = setup();
	// Enter in the middle of the stored text
	update(editor, () => $setPattern([text("Hello {lit} world")]));
	update(editor, () => caretAt(0, 2).insertLineBreak());
	expect(read(editor, $readPattern)).toEqual([text("He\nllo {lit} world")]);
	// a variable picked from the suggestions in the middle of the text
	update(editor, () => $setPattern([text("Hi {lit} there")]));
	update(editor, () => {
		const key = (children()[0] as TextNode).getKey();
		$insertVariableAt({ key, from: 2, to: 2 }, "x");
	});
	expect(read(editor, $readPattern)).toEqual([text("Hi"), variable("x"), text(" {lit} there")]);
	// bold around a word before the braces
	update(editor, () => $setPattern([text("Hello {lit}")]));
	update(editor, () => {
		const selection = caretAt(0, 5);
		selection.anchor.offset = 0;
		$wrapSelection({ type: "markup-start", name: "b" });
	});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "markup-start", name: "b" },
		text("Hello"),
		{ type: "markup-end", name: "b" },
		text(" {lit}"),
	]);
	// a removed token merges the stored texts around it
	update(editor, () => $setPattern([text("{a} "), variable("n"), text(" {b}")]));
	update(editor, () => children().find($isPatternTokenNode)!.remove());
	expect(read(editor, $readPattern)).toEqual([text("{a}  {b}")]);
});

it("tells typed braces from stored ones by their text, not by their node", () => {
	const editor = setup();
	// two texts converted in one update
	update(editor, () => $setPattern([text("a {s1} b"), variable("n"), text("c {s2} d")]));
	update(editor, () => {
		const [first, , last] = children() as TextNode[];
		first!.setTextContent("{t1} a {s1} b");
		last!.setTextContent("c {s2} d {t2}");
	});
	expect(read(editor, $readPattern)).toEqual([
		variable("t1"),
		text(" a {s1} b"),
		variable("n"),
		text("c {s2} d "),
		variable("t2"),
	]);
	// "{" typed before stored braces, then the rest of the name
	update(editor, () => $setPattern([text("a {lit}")]));
	update(editor, () => caretAt(0, 2).insertText("{"));
	expect(read(editor, $readPattern)).toEqual([text("a {{lit}")]);
	update(editor, () => caretAt(0, 3).insertText("name}"));
	expect(read(editor, $readPattern)).toEqual([text("a "), variable("name"), text("{lit}")]);
	// the same {x} pasted before a stored one: the pasted one (before the caret) is the variable
	update(editor, () => $setPattern([text("{x}")]));
	update(editor, () => caretAt(0, 0).insertText("{x}"));
	expect(read(editor, $readPattern)).toEqual([variable("x"), text("{x}")]);
	// editing inside stored braces keeps them text
	update(editor, () => $setPattern([text("It's {literal}")]));
	update(editor, () => {
		const selection = caretAt(0, 13);
		selection.anchor.offset = 12;
		selection.removeText();
	});
	expect(read(editor, $readPattern)).toEqual([text("It's {litera}")]);
});

it("turns a {name} an IME composed into a token when the composition ends", () => {
	const editor = setup();
	update(editor, () => $setPattern([text("Hi ")]));
	update(editor, () => {
		$setCompositionKey((children()[0] as TextNode).getKey());
		caretAt(0, 3).insertText("{name}");
	});
	expect(read(editor, $readPattern)).toEqual([text("Hi {name}")]);
	update(editor, () => {
		$setCompositionKey(null);
		(children()[0] as TextNode).markDirty();
	});
	expect(read(editor, $readPattern)).toEqual([text("Hi "), variable("name")]);
});

it("removes a token as a whole", () => {
	const editor = setup();
	update(editor, () =>
		$setPattern([
			{ type: "text", value: "a" },
			{ type: "expression", arg: { type: "variable-reference", name: "x" } },
			{ type: "text", value: "b" },
		])
	);
	update(editor, () => children().find($isPatternTokenNode)!.remove());
	expect(read(editor, $readPattern)).toEqual([{ type: "text", value: "ab" }]);
});

it("keeps the caret out of tokens and restores caret offsets", () => {
	const editor = setup();
	update(editor, () =>
		$setPattern([
			{ type: "text", value: "ab" },
			{
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
			},
			{ type: "text", value: "cd" },
		])
	);
	update(editor, () => {
		const token = children().find($isPatternTokenNode)!;
		const selection = $createRangeSelection();
		selection.anchor.set(token.getKey(), 5, "text");
		selection.focus.set(token.getKey(), 5, "text");
		$setSelection(selection);
		expect($keepCaretOutOfTokens()).toBe(true);
		expect($getCaretOffset()).toBe(2 + "{count}".length);
		$setCaretOffset(10);
		expect($getCaretOffset()).toBe(10);
	});
});

it("describes tokens", () => {
	expect(tokenText({ type: "markup-standalone", name: "br" })).toBe("<br/>");
	expect(
		tokenTitle(
			{
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
			},
			[
				{ type: "input-variable", name: "count" },
				{
					type: "local-variable",
					name: "x",
					value: {
						type: "expression",
						arg: { type: "variable-reference", name: "count" },
					},
				},
			]
		)
	).toBe("count");
	expect(
		tokenTitle({
			type: "expression",
			arg: { type: "variable-reference", name: "n" },
			annotation: { type: "function-reference", name: "plural", options: [] },
		})
	).toBe("n · plural");
	expect(tokenTitle({ type: "markup-start", name: "b" })).toBe("Start of bold");
});

const select = (from: number, to: number) => {
	// Character offsets in the first text node.
	const node = children()[0]!;
	const selection = $createRangeSelection();
	selection.anchor.set(node.getKey(), from, "text");
	selection.focus.set(node.getKey(), to, "text");
	$setSelection(selection);
};

it("wraps the selection in the reference's markup, keeping its options", () => {
	const editor = setup();
	update(editor, () => $setPattern([{ type: "text", value: "Mehr in der Dokumentation." }]));
	const link = { type: "markup-start" as const, name: "link", options: [{ name: "href", value: { type: "literal" as const, value: "/docs" } }] };
	update(editor, () => {
		select(12, 25);
		expect($wrapSelection(link)).toBe(true);
	});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "Mehr in der " },
		link,
		{ type: "text", value: "Dokumentation" },
		{ type: "markup-end", name: "link" },
		{ type: "text", value: "." },
	]);
	update(editor, () => {
		select(3, 3);
		expect($wrapSelection(link)).toBe(false);
	});
});

it("removes the partner of a deleted markup tag and keeps the words", () => {
	const editor = setup();
	update(editor, () => $setPattern(pattern));
	update(editor, () => {
		const start = children().find((node) => $isPatternTokenNode(node) && node.getPart().type === "markup-start")!;
		start.remove();
		$removeOrphanMarkup();
	});
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "Welcome back, " },
		pattern[2],
		{ type: "text", value: "!\nSee you" },
	]);
});

it("reads a {query before the caret and replaces it with a variable", () => {
	const editor = setup();
	update(editor, () => $setPattern([{ type: "text", value: "von {to belegt" }]));
	update(editor, () => select(7, 7));
	const query = read(editor, $caretQuery);
	expect(query).toMatchObject({ from: 4, to: 7, query: "to" });
	update(editor, () => $insertVariableAt(query!, "total"));
	expect(read(editor, $readPattern)).toEqual([
		{ type: "text", value: "von " },
		{ type: "expression", arg: { type: "variable-reference", name: "total" } },
		{ type: "text", value: " belegt" },
	]);
	update(editor, () => select(2, 2));
	expect(read(editor, $caretQuery)).toBeUndefined();
});
