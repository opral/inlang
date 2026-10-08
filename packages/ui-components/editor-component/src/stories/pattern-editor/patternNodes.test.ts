import { expect, it } from "vitest";
import type { Pattern } from "@inlang/sdk";
import {
	$createRangeSelection,
	$getRoot,
	$isElementNode,
	$setSelection,
	TextNode,
	createEditor,
	type LexicalEditor,
} from "lexical";
import {
	$getCaretOffset,
	$isPatternTokenNode,
	$keepCaretOutOfTokens,
	$readPattern,
	$setCaretOffset,
	$setPattern,
	$transformVariableText,
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
	editor.registerNodeTransform(TextNode, $transformVariableText);
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
