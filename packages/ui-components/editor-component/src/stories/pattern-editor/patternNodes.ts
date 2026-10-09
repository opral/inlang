import type {
	Declaration,
	Expression,
	MarkupEnd,
	MarkupStandalone,
	MarkupStart,
	Pattern,
} from "@inlang/sdk";
import {
	$addUpdateTag,
	$createLineBreakNode,
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getEditor,
	$getNodeByKey,
	$getSelection,
	$hasUpdateTag,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	TextNode,
	type EditorConfig,
	type EditorState,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type PointType,
	type SerializedTextNode,
	type Spread,
	type TextFormatType,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { resolveAnnotation } from "@inlang/sdk/browser";

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
	const isLink = ["a", "link"].includes(part.name.toLowerCase());
	const label = isLink ? "link" : kind === "unknown" ? `<${part.name}>` : kind;
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
	$addUpdateTag(SET_PATTERN_UPDATE);
	// the old selection points into the replaced content
	$setSelection(null);
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

const VARIABLE_PATTERN = /\{\s*([A-Za-z_$][\w$.:-]*)\s*\}/g;

/**
 * Update tag of `$setPattern`: the braces of stored text are text (an escaped
 * ICU `'{'literal'}'`), not variables. Lexical keeps update tags until the
 * pending state is committed, so `$setPattern` belongs in a discrete update.
 */
const SET_PATTERN_UPDATE = "inlang-pattern-set";

/** A `{name}` written as text (not a token), with its offsets in the whole pattern. */
type Occurrence = { key: NodeKey; start: number; end: number; at: number; text: string };

/** `{name}` texts in document order. Must run inside `read` or `update`. */
function $textVariables(): Occurrence[] {
	const occurrences: Occurrence[] = [];
	let offset = 0;
	for (const node of $leaves()) {
		const size = node.getTextContentSize();
		if ($isTextNode(node) && !$isPatternTokenNode(node) && node.isSimpleText()) {
			for (const match of node.getTextContent().matchAll(VARIABLE_PATTERN))
				occurrences.push({
					key: node.getKey(),
					start: match.index!,
					end: match.index! + match[0].length,
					at: offset + match.index!,
					text: match[0],
				});
		}
		offset += size;
	}
	return occurrences;
}

/** Offset of a selection point in the whole pattern (as `$getCaretOffset`). */
function $pointOffset(point: PointType): number {
	// an element point ("before the n-th child") names the child instead
	const element = point.type === "element" ? $getNodeByKey(point.key) : null;
	let child = $isElementNode(element) ? element.getChildAtIndex(point.offset) : null;
	// before a paragraph: before its first leaf
	if ($isElementNode(child)) child = child.getFirstDescendant();
	const key = child ? child.getKey() : point.key;
	let offset = 0;
	for (const node of $leaves()) {
		if (node.getKey() === key) return offset + (!child && $isTextNode(node) ? point.offset : 0);
		offset += node.getTextContentSize();
	}
	return offset;
}

/** The collapsed caret, or undefined. */
function $caret(): number | undefined {
	const selection = $getSelection();
	return $isRangeSelection(selection) && selection.isCollapsed()
		? $pointOffset(selection.anchor)
		: undefined;
}

/**
 * Per editor, as after the last update that did not compose: how often each
 * `{name}` was text, and where the selection started (the text the user types
 * next starts there, also when it replaces a selection).
 */
const textBefore = new WeakMap<
	LexicalEditor,
	{ counts: Map<string, number>; selectionStart: number | undefined }
>();

function countTexts(occurrences: Occurrence[]) {
	const counts = new Map<string, number>();
	for (const { text } of occurrences) counts.set(text, (counts.get(text) ?? 0) + 1);
	return counts;
}

/**
 * Typed or pasted `{name}` text becomes an expression token (the old
 * string-based editing behaviour), braces that are text of the stored pattern
 * stay text: registers {@link $transformVariableText} and the bookkeeping it
 * needs.
 */
export function registerVariableText(editor: LexicalEditor): () => void {
	const remember = (state: EditorState, contentReplaced = false) =>
		textBefore.set(
			editor,
			state.read(() => {
				const selection = $getSelection();
				return {
					counts: countTexts($textVariables()),
					// a selection left on nodes the update removed (content replaced) says nothing
					// after the host replaced the content, the selection is where Lexical put it
					selectionStart:
						!contentReplaced &&
						$isRangeSelection(selection) &&
						[selection.anchor, selection.focus].every((point) =>
							$getNodeByKey(point.key)?.isAttached()
						)
							? Math.min($pointOffset(selection.anchor), $pointOffset(selection.focus))
							: undefined,
				};
			})
		);
	remember(editor.getEditorState());
	return mergeRegister(
		editor.registerNodeTransform(TextNode, $transformVariableText),
		editor.registerUpdateListener(({ editorState, tags }) => {
			// a word an IME is still composing is converted when the composition ends; content the
			// host set replaces what was composed
			const replaced = tags.has(SET_PATTERN_UPDATE);
			if (!editor.isComposing() || replaced) remember(editorState, replaced);
		})
	);
}

/**
 * Node transform (see {@link registerVariableText}): converts the `{name}`
 * texts the user just typed or pasted - those whose `{` or `}` lies between
 * where the selection started before the update and the caret now, in offsets
 * of the whole pattern, so Lexical splitting or merging text nodes (Enter, a
 * token inserted or removed, bold) does not matter. Stored braces stay text
 * when the user edits next to or inside them, or deletes. Without a caret
 * (programmatic edits) the `{name}` texts the update added are converted.
 */
export function $transformVariableText(node: TextNode) {
	if ($isPatternTokenNode(node) || !node.isSimpleText()) return;
	if ($hasUpdateTag(SET_PATTERN_UPDATE)) return;
	const key = node.getKey();
	const all = $textVariables();
	if (!all.some((occurrence) => occurrence.key === key)) return;
	const before = textBefore.get($getEditor());
	const caret = $caret();
	let typed: Occurrence[];
	if (caret !== undefined && before?.selectionStart !== undefined) {
		const from = before.selectionStart;
		// nothing was inserted (a deletion): nothing was typed
		if (caret <= from) return;
		const inserted = (offset: number) => offset >= from && offset < caret;
		typed = all.filter(
			(occurrence) =>
				inserted(occurrence.at) ||
				inserted(occurrence.at + occurrence.end - occurrence.start - 1)
		);
	} else {
		const excess = countTexts(all);
		for (const [text, count] of before?.counts ?? [])
			excess.set(text, (excess.get(text) ?? 0) - count);
		// the ones closest to the caret (ending before it, or containing it) are the new ones;
		// without a caret the last ones
		const distance = (occurrence: Occurrence, index: number) => {
			if (caret === undefined) return -index;
			const end = occurrence.at + occurrence.end - occurrence.start;
			if (end <= caret) return caret - end;
			return occurrence.at < caret ? 0 : occurrence.at - caret + 0.5;
		};
		const ranked = all
			.map((occurrence, index) => ({ occurrence, rank: distance(occurrence, index) }))
			.sort((a, b) => a.rank - b.rank)
			.map(({ occurrence }) => occurrence);
		// no more {name} texts than before: an existing one was edited (e.g. "{litera}")
		let budget = all.length;
		for (const count of before?.counts.values() ?? []) budget -= count;
		typed = [];
		for (const occurrence of ranked) {
			if (budget <= 0) break;
			const left = excess.get(occurrence.text) ?? 0;
			if (left <= 0) continue;
			excess.set(occurrence.text, left - 1);
			typed.push(occurrence);
			budget--;
		}
	}
	const mine = typed
		.filter((occurrence) => occurrence.key === key)
		.sort((a, b) => a.start - b.start);
	if (mine.length === 0) return;
	const selection = $getSelection();
	const caretOffset =
		$isRangeSelection(selection) && selection.isCollapsed() && selection.anchor.key === key
			? selection.anchor.offset
			: undefined;
	const pieces = node.splitText(...mine.flatMap((match) => [match.start, match.end]));
	let start = 0;
	let next = 0;
	let placeCaret: (() => void) | undefined;
	for (const piece of pieces) {
		const length = piece.getTextContentSize();
		const match = mine[next];
		if (match !== undefined && match.start === start) {
			next++;
			const token = $createPatternTokenNode({
				type: "expression",
				arg: {
					type: "variable-reference",
					name: piece.getTextContent().slice(1, -1).trim(),
				},
			});
			token.setFormat(piece.getFormat());
			piece.replace(token);
			if (caretOffset !== undefined && caretOffset > start && caretOffset <= start + length)
				placeCaret = () => token.selectNext(0, 0);
		} else if (
			caretOffset !== undefined &&
			caretOffset >= start &&
			caretOffset <= start + length
		) {
			const offset = caretOffset - start;
			placeCaret ??= () => piece.select(offset, offset);
		}
		start += length;
	}
	placeCaret?.();
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

/** Markup tokens whose partner (start ↔ end) is gone, e.g. after Backspace removed one of them. */
function $orphanMarkup(): PatternTokenNode[] {
	const orphans: PatternTokenNode[] = [];
	for (const block of $getRoot().getChildren()) {
		if (!$isElementNode(block)) continue;
		const open: PatternTokenNode[] = [];
		for (const child of block.getChildren()) {
			if (!$isPatternTokenNode(child)) continue;
			const part = child.getPart();
			if (part.type === "markup-start") open.push(child);
			else if (part.type === "markup-end") {
				const index = open.map((node) => (node.getPart() as MarkupStart).name).lastIndexOf(part.name);
				if (index === -1) orphans.push(child);
				else open.splice(index, 1);
			}
		}
		orphans.push(...open);
	}
	return orphans;
}

/** Keys of the markup tokens that have a partner (start ↔ end). */
export function $pairedMarkupKeys(): Set<string> {
	const orphans = new Set($orphanMarkup().map((node) => node.getKey()));
	const paired = new Set<string>();
	for (const node of $leaves()) {
		if (!$isPatternTokenNode(node)) continue;
		const type = node.getPart().type;
		if ((type === "markup-start" || type === "markup-end") && !orphans.has(node.getKey()))
			paired.add(node.getKey());
	}
	return paired;
}

/**
 * Keys of markup tags that lost their partner since `paired` (see {@link $pairedMarkupKeys}) was
 * read, e.g. after Backspace removed one of them. A tag that had no partner before (a lone
 * `markup-start` is valid MF2) is not one.
 */
export function $lostPartnerKeys(paired: ReadonlySet<string>): Set<string> {
	return new Set(
		$orphanMarkup()
			.map((node) => node.getKey())
			.filter((key) => paired.has(key))
	);
}

/**
 * Removes markup tags without a partner (only those in `keys` when given), so deleting one end of
 * a link or bold removes the markup and keeps the words inside it.
 */
export function $removeOrphanMarkup(keys?: ReadonlySet<string>) {
	for (const node of $orphanMarkup())
		if (!keys || keys.has(node.getKey())) node.remove();
}

/**
 * Wraps the selected text in `start` and its closing tag, e.g. the reference's
 * `<link>` with its options. Without a selection, inserts the markup around
 * `placeholder` at the caret and selects it. Must run inside `editor.update`.
 * Returns false when nothing was wrapped.
 */
export function $wrapSelection(start: MarkupStart, placeholder?: string): boolean {
	const selection = $getSelection();
	if ($isRangeSelection(selection) && selection.isCollapsed() && placeholder) {
		// Nothing selected: insert the markup around placeholder text and select it for typing.
		const text = $createTextNode(placeholder);
		selection.insertNodes([
			$createPatternTokenNode(structuredClone(start)),
			text,
			$createPatternTokenNode({ type: "markup-end", name: start.name } satisfies MarkupEnd),
		]);
		text.select(0, placeholder.length);
		$syncMarkupFormats();
		return true;
	}
	if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
	const [first, last] = selection.isBackward()
		? [selection.focus, selection.anchor]
		: [selection.anchor, selection.focus];
	const startPoint = { key: first.key, offset: first.offset, type: first.type };
	const endPoint = { key: last.key, offset: last.offset, type: last.type };
	const insertAt = (point: typeof startPoint, node: PatternTokenNode) => {
		const caret = $createRangeSelection();
		caret.anchor.set(point.key, point.offset, point.type);
		caret.focus.set(point.key, point.offset, point.type);
		$setSelection(caret);
		caret.insertNodes([node]);
	};
	// Insert the end first so the start point stays valid.
	const closing = $createPatternTokenNode({ type: "markup-end", name: start.name } satisfies MarkupEnd);
	insertAt(endPoint, closing);
	insertAt(startPoint, $createPatternTokenNode(structuredClone(start)));
	closing.selectNext(0, 0);
	$syncMarkupFormats();
	return true;
}

/** The `{query` typed right before a collapsed caret in plain text, for variable suggestions. */
export function $caretQuery(): { key: string; from: number; to: number; query: string } | undefined {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
	const node = selection.anchor.getNode();
	if (!$isTextNode(node) || $isPatternTokenNode(node)) return undefined;
	const before = node.getTextContent().slice(0, selection.anchor.offset);
	const match = /\{([A-Za-z_$][\w$.-]*)?$/.exec(before);
	if (!match) return undefined;
	return { key: node.getKey(), from: match.index, to: selection.anchor.offset, query: match[1] ?? "" };
}

/** Replaces `{query` with an expression token. Must run inside `editor.update`. */
export function $insertVariableAt(target: { key: string; from: number; to: number }, name: string) {
	const range = $createRangeSelection();
	range.anchor.set(target.key, target.from, "text");
	range.focus.set(target.key, target.to, "text");
	$setSelection(range);
	const token = $createPatternTokenNode({ type: "expression", arg: { type: "variable-reference", name } });
	range.insertNodes([token]);
	token.selectNext(0, 0);
}
