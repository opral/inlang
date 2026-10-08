import type {
	Declaration,
	Expression,
	MarkupEnd,
	MarkupStandalone,
	MarkupStart,
	Pattern,
} from "@inlang/sdk";
import {
	$createLineBreakNode,
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	TextNode,
	type EditorConfig,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedTextNode,
	type Spread,
	type TextFormatType,
} from "lexical";
import { resolveAnnotation } from "../../helper/declarations.js";

export type TokenPart = Expression | MarkupStart | MarkupEnd | MarkupStandalone;

export type SerializedPatternTokenNode = Spread<
	{ part: TokenPart },
	SerializedTextNode
>;

/** Text shown for a token. Expressions read `{name}`, markup `<b>`, `</b>`, `<br/>`. */
export function tokenText(part: TokenPart): string {
	if (part.type === "expression") {
		return `{${part.arg.type === "variable-reference" ? part.arg.name : part.arg.value}}`;
	}
	if (part.type === "markup-start") return `<${part.name}>`;
	if (part.type === "markup-end") return `</${part.name}>`;
	return `<${part.name}/>`;
}

/** Human readable description, e.g. "count · plural" or "bold". */
export function tokenTitle(
	part: TokenPart,
	declarations?: readonly Declaration[]
): string {
	if (part.type === "expression") {
		const name =
			part.arg.type === "variable-reference" ? part.arg.name : part.arg.value;
		const annotation =
			part.annotation ??
			(part.arg.type === "variable-reference"
				? resolveAnnotation(part.arg.name, declarations)
				: undefined);
		return annotation ? `${name} · ${annotation.name}` : name;
	}
	const kind = markupKind(part.name);
	const label = kind === "unknown" ? `<${part.name}>` : kind;
	if (part.type === "markup-start") return `Start of ${label}`;
	if (part.type === "markup-end") return `End of ${label}`;
	return label;
}

export type MarkupKind = "bold" | "italic" | "underline" | "unknown";

/** Maps common markup names to formatting. Unknown markup stays a tag. */
export function markupKind(name: string): MarkupKind {
	const lower = name.toLowerCase();
	if (["b", "strong", "bold"].includes(lower)) return "bold";
	if (["i", "em", "italic"].includes(lower)) return "italic";
	if (["a", "link", "u", "underline"].includes(lower)) return "underline";
	return "unknown";
}

/**
 * An atomic token (expression or markup) inside the pattern editor.
 *
 * A token-mode text node: it cannot be partially edited, Backspace/Delete
 * removes it as a whole, and typing next to it creates a separate text node.
 */
export class PatternTokenNode extends TextNode {
	__part: TokenPart;

	static override getType(): string {
		return "inlang-pattern-token";
	}

	static override clone(node: PatternTokenNode): PatternTokenNode {
		return new PatternTokenNode(node.__part, node.__text, node.__key);
	}

	constructor(part: TokenPart, text?: string, key?: NodeKey) {
		super(text ?? tokenText(part), key);
		this.__part = part;
	}

	getPart(): TokenPart {
		return this.getLatest().__part;
	}

	override createDOM(
		config: EditorConfig,
		editor?: LexicalEditor
	): HTMLElement {
		const dom = super.createDOM(config, editor);
		const part = this.__part;
		dom.classList.add("inlang-token");
		if (part.type === "expression") dom.classList.add("inlang-token-variable");
		else {
			dom.classList.add("inlang-token-markup");
			dom.classList.add(`inlang-token-markup-${markupKind(part.name)}`);
		}
		dom.setAttribute("spellcheck", "false");
		dom.setAttribute("data-inlang-token", part.type);
		dom.title = tokenTitle(part);
		return dom;
	}

	static override importJSON(
		json: SerializedPatternTokenNode
	): PatternTokenNode {
		const node = $createPatternTokenNode(json.part);
		node.setFormat(json.format);
		return node;
	}

	override exportJSON(): SerializedPatternTokenNode {
		return {
			...super.exportJSON(),
			part: this.__part,
			type: PatternTokenNode.getType(),
			version: 1,
		};
	}

	override isTextEntity(): true {
		return true;
	}

	override canInsertTextBefore(): boolean {
		return false;
	}

	override canInsertTextAfter(): boolean {
		return false;
	}
}

export function $createPatternTokenNode(part: TokenPart): PatternTokenNode {
	const node = new PatternTokenNode(structuredClone(part));
	node.setMode("token");
	return node;
}

export function $isPatternTokenNode(
	node: LexicalNode | null | undefined
): node is PatternTokenNode {
	return node instanceof PatternTokenNode;
}

/** Replaces the editor content with a pattern. Must run inside `editor.update`. */
export function $setPattern(pattern: Pattern | undefined) {
	const root = $getRoot();
	root.clear();
	const paragraph = $createParagraphNode();
	for (const part of pattern ?? []) {
		if (part.type === "text") {
			const lines = part.value.split("\n");
			lines.forEach((line, index) => {
				if (index > 0) paragraph.append($createLineBreakNode());
				if (line) paragraph.append($createTextNode(line));
			});
		} else {
			paragraph.append($createPatternTokenNode(part));
		}
	}
	root.append(paragraph);
	$syncMarkupFormats();
}

/** Reads the pattern from the editor. Must run inside `read` or `update`. */
export function $readPattern(): Pattern {
	const pattern: Pattern = [];
	const pushText = (value: string) => {
		if (!value) return;
		const last = pattern[pattern.length - 1];
		if (last?.type === "text") last.value += value;
		else pattern.push({ type: "text", value });
	};
	$getRoot()
		.getChildren()
		.forEach((block, index) => {
			if (index > 0) pushText("\n");
			const children = $isElementNode(block) ? block.getChildren() : [block];
			for (const child of children) {
				if ($isPatternTokenNode(child))
					pattern.push(structuredClone(child.getPart()));
				else if ($isLineBreakNode(child)) pushText("\n");
				else pushText(child.getTextContent());
			}
		});
	return pattern;
}

const FORMATS: Array<Exclude<MarkupKind, "unknown">> = [
	"bold",
	"italic",
	"underline",
];

/** The formats each text node should have given the markup tokens before it. */
function $desiredFormats(): Array<[TextNode, Set<TextFormatType>]> {
	const result: Array<[TextNode, Set<TextFormatType>]> = [];
	for (const block of $getRoot().getChildren()) {
		if (!$isElementNode(block)) continue;
		const open: string[] = [];
		for (const child of block.getChildren()) {
			if ($isPatternTokenNode(child)) {
				const part = child.getPart();
				if (part.type === "markup-start") open.push(part.name);
				else if (part.type === "markup-end") {
					const index = open.lastIndexOf(part.name);
					if (index !== -1) open.splice(index, 1);
				}
				if (part.type !== "expression") continue;
			}
			if (!$isTextNode(child)) continue;
			const formats = new Set<TextFormatType>();
			for (const name of open) {
				const kind = markupKind(name);
				if (kind !== "unknown") formats.add(kind);
			}
			result.push([child, formats]);
		}
	}
	return result;
}

/** True when text formatting does not reflect the surrounding markup tokens. */
export function $markupFormatsOutOfSync(): boolean {
	return $desiredFormats().some(([node, formats]) =>
		FORMATS.some((format) => node.hasFormat(format) !== formats.has(format))
	);
}

/**
 * Applies bold/italic/underline to text between known markup tokens so the
 * editor shows real formatting. Formatting is presentation only and never
 * becomes part of the pattern.
 */
export function $syncMarkupFormats() {
	for (const [node, formats] of $desiredFormats()) {
		for (const format of FORMATS) {
			if (node.hasFormat(format) !== formats.has(format))
				node.toggleFormat(format);
		}
	}
}

const VARIABLE_PATTERN = /\{\s*([A-Za-z_$][\w$.:-]*)\s*\}/;

/**
 * Node transform: typed or pasted `{name}` text becomes an expression token,
 * keeping the old string-based editing behaviour working.
 */
export function $transformVariableText(node: TextNode) {
	if (!node.isSimpleText()) return;
	const text = node.getTextContent();
	const match = VARIABLE_PATTERN.exec(text);
	if (!match) return;
	const start = match.index;
	const end = start + match[0].length;
	const pieces = node.splitText(start, end);
	const piece = start === 0 ? pieces[0] : pieces[1];
	if (!piece) return;
	const token = $createPatternTokenNode({
		type: "expression",
		arg: { type: "variable-reference", name: match[1]! },
	});
	token.setFormat(piece.getFormat());
	const selection = $getSelection();
	const hadCaret =
		$isRangeSelection(selection) &&
		selection.isCollapsed() &&
		selection.anchor.key === piece.getKey();
	piece.replace(token);
	if (hadCaret) token.selectNext(0, 0);
}

/** Moves a caret that landed inside a token to the token's nearest edge. */
export function $keepCaretOutOfTokens(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return false;
	let changed = false;
	const next = selection.clone();
	for (const point of [next.anchor, next.focus]) {
		const node = point.getNode();
		if (!$isPatternTokenNode(node) || point.type !== "text") continue;
		const length = node.getTextContentSize();
		if (point.offset > 0 && point.offset < length) {
			point.set(node.getKey(), point.offset < length / 2 ? 0 : length, "text");
			changed = true;
		}
	}
	if (changed) $setSelection(next);
	return changed;
}

/** Caret position as a character offset into the whole content (or null). */
export function $getCaretOffset(): number | null {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return null;
	const anchor = selection.anchor;
	let offset = 0;
	for (const node of $leaves()) {
		if (node.getKey() === anchor.key) {
			return offset + ($isTextNode(node) ? anchor.offset : 0);
		}
		offset += node.getTextContentSize();
	}
	return offset;
}

/** Places a collapsed caret at a character offset (clamped). */
export function $setCaretOffset(target: number) {
	let offset = 0;
	const leaves = $leaves();
	for (const node of leaves) {
		const size = node.getTextContentSize();
		if ($isTextNode(node) && target <= offset + size) {
			let local = target - offset;
			if ($isPatternTokenNode(node) && local > 0) local = size;
			const selection = $createRangeSelection();
			selection.anchor.set(node.getKey(), local, "text");
			selection.focus.set(node.getKey(), local, "text");
			$setSelection(selection);
			return;
		}
		offset += size;
	}
	$getRoot().selectEnd();
}

function $leaves(): LexicalNode[] {
	const leaves: LexicalNode[] = [];
	for (const block of $getRoot().getChildren()) {
		if ($isElementNode(block)) leaves.push(...block.getChildren());
	}
	return leaves;
}
