import type { Declaration, MarkupStandalone, MarkupStart, Pattern, VariantRow } from "@inlang/sdk";
import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref, createRef, type Ref } from "lit/directives/ref.js";
import {
	$getRoot,
	$createRangeSelection,
	$createRangeSelectionFromDom,
	$getNearestNodeFromDOMNode,
	$getNodeByKey,
	$getSelection,
	$isElementNode,
	$setSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_LOW,
	SELECTION_CHANGE_COMMAND,
	TextNode,
	createEditor,
	type RangeSelection,
} from "lexical";
import { registerPlainText } from "@lexical/plain-text";
import { mergeRegister } from "@lexical/utils";
import { createChangeEvent } from "../../helper/event.js";
import { EchoTracker, canonicalJson } from "../../helper/echoTracker.js";
import {
	$caretQuery,
	$createPatternTokenNode,
	$getCaretOffset,
	$lostPartnerKeys,
	$pairedMarkupKeys,
	$insertVariableAt,
	$removeOrphanMarkup,
	$wrapSelection,
	markupKind,
	$isPatternTokenNode,
	$keepCaretOutOfTokens,
	$markupFormatsOutOfSync,
	$readPattern,
	$setCaretOffset,
	$setPattern,
	$syncMarkupFormats,
	$transformVariableText,
	PatternTokenNode,
	tokenTitle,
} from "./patternNodes.js";

/** "Remove link", "Remove bold", or the tag for other markup. */
const removeLabel = (name: string) => {
	const kind = markupKind(name);
	if (["a", "link"].includes(name.toLowerCase())) return "Remove link";
	return kind === "unknown" || kind === "underline" ? `Remove <${name}>` : `Remove ${kind}`;
};

/** Update tags: programmatic content changes never emit `change` events. */
const SET_PATTERN_TAG = "inlang-set-pattern";
const SYNC_FORMAT_TAG = "inlang-sync-format";

const theme = {
	text: {
		bold: "inlang-pattern-editor-bold",
		italic: "inlang-pattern-editor-italic",
		underline: "inlang-pattern-editor-underline",
	},
};

/**
 * Editable pattern of a variant.
 *
 * Text is edited freely; expressions (`{name}`) and markup (`<b>`, `</b>`)
 * are atomic tokens that are deleted as a whole. Typing `{name}` creates an
 * expression token. Text between known markup tokens (b/strong, i/em, a/link)
 * is shown with real formatting.
 *
 * Rendered in light DOM (contenteditable selection does not work reliably
 * across shadow roots). All styles are scoped to `inlang-pattern-editor`.
 *
 * Optional helpers for translators:
 * - `markupOptions`: markup the selection can be wrapped in (usually the
 *   reference's markup). Selecting text shows a small toolbar; ⌘K / ⌘B / ⌘I
 *   wrap the selection in the matching link / bold / italic option. Inside
 *   that markup the toolbar offers "Remove link" and the shortcut unwraps it.
 * - `variables`: typing `{` suggests these; Enter or Tab inserts the token.
 * - Deleting one tag of a markup pair removes its partner and keeps the words.
 *
 * Undo is owned by the host: the editor keeps no history (⌘Z does nothing), so
 * it never conflicts with an app-level undo. To undo, restore the previous
 * pattern, call `forgetEdits()` and pass the variant again.
 *
 * @fires change - `ChangeEventDetail` with the updated variant on every edit.
 * @fires pattern-editor-focus
 * @fires pattern-editor-blur
 *
 * @cssprop --inlang-pattern-padding - Padding of the editable area (default 14px 12px).
 * @cssprop --inlang-pattern-min-height - Minimum height (default 44px).
 * @cssprop --inlang-pattern-background - Background (default #fff).
 * @cssprop --inlang-pattern-hover-background - Background on hover (default #f9f9f9).
 * @cssprop --inlang-pattern-font-size - Font size (default 14px).
 * @cssprop --inlang-pattern-color - Text color (default #242424).
 * @cssprop --inlang-pattern-focus-ring - Box shadow when focused.
 * @cssprop --inlang-pattern-border-width - Border width of the editable area (default 0).
 * @cssprop --inlang-pattern-border-color - Border color (default transparent).
 * @cssprop --inlang-pattern-hover-border-color - Border color on hover (default: the border color).
 * @cssprop --inlang-pattern-focus-border-color - Border color when focused (default: the border color).
 * @cssprop --inlang-pattern-border-radius - Corner radius of the editable area (default 0).
 * @cssprop --inlang-popover-font-size - Font size of the selection toolbar and suggestions (default 13px).
 * @cssprop --inlang-popover-radius - Corner radius of the toolbar and suggestions (default 8px / 10px).
 * @cssprop --inlang-popover-shadow - Shadow of the toolbar and suggestions.
 * @cssprop --inlang-token-font-size - Font size of expression tokens (default 0.86em).
 * @cssprop --inlang-token-radius - Corner radius of tokens (default 4px).
 * @cssprop --inlang-font-mono - Font family of tokens (default JetBrains Mono, monospace).
 * @cssprop --inlang-variable-color - Expression token text color.
 * @cssprop --inlang-variable-background - Expression token background.
 */
@customElement("inlang-pattern-editor")
export default class InlangPatternEditor extends LitElement {
	// refs
	contentEditableElementRef: Ref<HTMLDivElement> = createRef();

	// props
	@property({ type: Object })
	variant: VariantRow;

	/** Optional declarations, used for token tooltips such as "count · plural". */
	@property({ type: Array })
	declarations?: Declaration[];

	/** Placeholder shown while the pattern is empty. */
	@property({ type: String })
	placeholder = "Enter pattern ...";

	/** Accessible label of the text box (read from the `aria-label` attribute). */
	@property({ attribute: "aria-label" })
	accessibleLabel?: string;

	/** Markup a selection can be wrapped in, with a button label such as `Link like “docs”`. */
	@property({ type: Array })
	markupOptions: Array<{ part: MarkupStart; label: string }> = [];

	/** Variables suggested after typing `{`, in order (e.g. missing ones first). */
	@property({ type: Array })
	variables: Array<{ name: string; hint?: string }> = [];

	@state()
	private _toolbar?: { x: number; y: number; below?: number; ranged: boolean; active: string[] };

	/** Markup pairs around the cursor, so the toolbar and shortcuts can remove them again. */
	private _activePairs: { name: string; start: string; end: string }[] = [];

	@state()
	private _suggest?: { items: Array<{ name: string; hint?: string }>; index: number; x: number; y: number; target: { key: string; from: number; to: number } };

	/** Where the user dismissed suggestions with Escape, so they stay closed there. */
	private _dismissed?: string;

	// state
	@state()
	_patternState: Pattern | undefined;

	/**
	 * Patterns this editor emitted recently. Hosts that save asynchronously pass
	 * them back one by one while the user keeps typing; those echoes are older
	 * than the content and must not replace it.
	 */
	private _echoes = new EchoTracker();

	/** The id of the variant the content belongs to. */
	private _variantId?: string;

	/** Focus requested before the editable area was rendered. */
	private _pendingFocus?: FocusOptions;

	//disable shadow root -> because of contenteditable selection API
	override createRenderRoot() {
		return this;
	}

	// create editor
	editor = createEditor({
		namespace: "inlang-pattern-editor",
		onError: console.error,
		nodes: [PatternTokenNode],
		theme,
	});

	private _unregister?: () => void;

	// update editor state when variant prop changes
	override updated(changedProperties: PropertyValues<this>) {
		if (changedProperties.has("variant")) {
			// Another variant ("+ Add form" reuses the editor): its pattern replaces the content, and
			// pending echoes of the previous variant's text must never be taken for this one's.
			const id = this.variant?.id;
			const other = id !== this._variantId;
			this._variantId = id;
			if (other) this._echoes.clear();
			// Echoes of our own edits and copies of the pattern passed before keep what was typed.
			const decision = this._echoes.receive(
				this.variant?.pattern ?? [],
				this._patternState
			);
			if (other || decision === "replace") this._setEditorState();
		}
		if (changedProperties.has("declarations")) this._refreshTitles();
		if (this._pendingFocus) {
			const options = this._pendingFocus;
			this._pendingFocus = undefined;
			this.contentEditableElementRef.value?.focus(options);
		}
	}

	/** Replaces the content with the variant's pattern, keeping the caret if focused. */
	private _setEditorState = () => {
		const focused = this.contentEditableElementRef.value?.contains(
			document.activeElement
		);
		let caret: number | null = null;
		if (focused) caret = this.editor.getEditorState().read($getCaretOffset);
		this._patternState = this.variant?.pattern ?? [];
		const pattern = this._patternState;
		this.editor.update(
			() => {
				$setPattern(pattern);
				// Without focus, keep no selection so Lexical doesn't pull focus back here.
				if (caret !== null) $setCaretOffset(caret);
				else $setSelection(null);
			},
			{ discrete: true, tag: SET_PATTERN_TAG }
		);
		this._refreshTitles();
	};

	/** Sets tooltips ("count · plural") on expression tokens. */
	private _refreshTitles() {
		if (!this.contentEditableElementRef.value) return;
		this.editor.getEditorState().read(() => {
			for (const block of $getRoot().getChildren()) {
				if (!$isElementNode(block)) continue;
				for (const child of block.getChildren()) {
					if (!$isPatternTokenNode(child)) continue;
					const element = this.editor.getElementByKey(child.getKey());
					if (element)
						element.title = tokenTitle(child.getPart(), this.declarations);
				}
			}
		});
	}

	override firstUpdated() {
		const contentEditableElement = this.contentEditableElementRef.value;
		if (!contentEditableElement) return;
		this.editor.setRootElement(contentEditableElement);
		this._attach();
		// Lexical replaces a token when text is typed with the caret inside it.
		// Move the caret to the token's edge before Lexical handles the input.
		// Lexical replaces a token when text is typed with the caret inside it
		// (native insertion writes into the token's DOM text). The DOM selection
		// can be ahead of Lexical's (selectionchange is async), so read it here.
		const tokenCaret = () => {
			const selection = window.getSelection();
			const anchor = selection?.anchorNode;
			if (!selection || !anchor || !selection.isCollapsed) return undefined;
			const element = (
				anchor.nodeType === Node.TEXT_NODE
					? anchor.parentElement
					: (anchor as Element)
			)?.closest("[data-inlang-token]");
			if (!element || !contentEditableElement.contains(element))
				return undefined;
			const length = element.textContent?.length ?? 0;
			const offset = selection.anchorOffset;
			if (anchor.nodeType !== Node.TEXT_NODE || offset <= 0 || offset >= length)
				return undefined;
			return { element, edge: offset < length / 2 ? 0 : length };
		};
		const moveCaret = (caret: { element: Element; edge: number }) => {
			const node = $getNearestNodeFromDOMNode(caret.element);
			if (!$isPatternTokenNode(node)) return false;
			const selection = $createRangeSelection();
			selection.anchor.set(node.getKey(), caret.edge, "text");
			selection.focus.set(node.getKey(), caret.edge, "text");
			$setSelection(selection);
			return true;
		};
		contentEditableElement.addEventListener(
			"beforeinput",
			(event: InputEvent) => {
				const caret = tokenCaret();
				if (!caret) return;
				if (
					(event.inputType === "insertText" ||
						event.inputType === "insertReplacementText") &&
					typeof event.data === "string"
				) {
					event.preventDefault();
					event.stopImmediatePropagation();
					const text = event.data;
					this.editor.update(() => {
						if (!moveCaret(caret)) return;
						const selection = $getSelection();
						if ($isRangeSelection(selection)) selection.insertText(text);
					});
				} else {
					this.editor.update(() => void moveCaret(caret), { discrete: true });
				}
			},
			{ capture: true }
		);
		contentEditableElement.addEventListener(
			"compositionstart",
			() => {
				const caret = tokenCaret();
				if (caret)
					this.editor.update(() => void moveCaret(caret), { discrete: true });
			},
			{ capture: true }
		);
		contentEditableElement.addEventListener(
			"keydown",
			(event: KeyboardEvent) => {
				if (!this._onKey(event)) return;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			{ capture: true }
		);
		contentEditableElement.addEventListener("focus", () => {
			this.dispatchEvent(new CustomEvent("pattern-editor-focus"));
		});
		contentEditableElement.addEventListener("blur", () => {
			this._toolbar = undefined;
			this._suggest = undefined;
			this.dispatchEvent(new CustomEvent("pattern-editor-blur"));
		});
	}

	/** Registers lexical behaviour (plain text, tokens, change events). */
	private _attach() {
		if (this._unregister) return;
		this._unregister = mergeRegister(
			registerPlainText(this.editor),
			this.editor.registerNodeTransform(TextNode, $transformVariableText),
			this.editor.registerCommand(
				SELECTION_CHANGE_COMMAND,
				() => {
					$keepCaretOutOfTokens();
					queueMicrotask(() => this._updatePopups());
					return false;
				},
				COMMAND_PRIORITY_LOW
			),
			this.editor.registerUpdateListener(({ editorState, prevEditorState, tags }) => {
				if (editorState.read($markupFormatsOutOfSync)) {
					this.editor.update($syncMarkupFormats, { tag: SYNC_FORMAT_TAG });
				}
				this._refreshTitles();
				if (tags.has(SET_PATTERN_TAG)) return;
				// One tag of a pair was deleted: drop its partner before reporting the edit. Markup that
				// had no partner before (a lone markup-start, valid MF2) stays.
				const lost = editorState.read(() =>
					$lostPartnerKeys(prevEditorState.read($pairedMarkupKeys))
				);
				if (lost.size) {
					this.editor.update(() => $removeOrphanMarkup(lost));
					return;
				}
				queueMicrotask(() => this._updatePopups());
				const pattern = editorState.read($readPattern);
				if (canonicalJson(pattern) === canonicalJson(this._patternState ?? []))
					return;
				this._patternState = pattern;
				this._echoes.record(pattern);
				this.dispatchEvent(
					createChangeEvent({
						entityId: this.variant.id,
						entity: "variant",
						newData: { ...this.variant, pattern } as VariantRow,
					})
				);
			})
		);
	}

	override connectedCallback() {
		super.connectedCallback();
		// re-attach after the element was moved in the DOM
		if (this.hasUpdated) this._attach();
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this._unregister?.();
		this._unregister = undefined;
	}

	/**
	 * Inserts an expression token `{name}` at the caret (or at the end when the
	 * editor has no selection) and focuses the editor. Emits a `change` event.
	 */
	insertExpression(name: string) {
		this.editor.update(
			() => {
				let selection = $getSelection();
				let atEnd = false;
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
					atEnd = true;
				}
				if (!$isRangeSelection(selection)) return;
				const token = $createPatternTokenNode({
					type: "expression",
					arg: { type: "variable-reference", name },
				});
				// Appended to existing text, a variable gets a space in front ("belegt {total}").
				const text = $getRoot().getTextContent();
				if (atEnd && text && !/\s$/.test(text)) (selection as RangeSelection).insertText(" ");
				(selection as RangeSelection).insertNodes([token]);
				token.selectNext(0, 0);
			},
			{ discrete: true }
		);
		this.contentEditableElementRef.value?.focus();
	}

	/** Wraps the selected text in markup, e.g. the reference's link; without a selection, inserts it around `placeholder`. */
	wrapSelection(start: MarkupStart, placeholder?: string): boolean {
		let wrapped = false;
		this.editor.update(() => {
			// Lexical reads the DOM selection asynchronously; a shortcut right after a keyboard
			// selection must use the selection the user sees.
			const dom = window.getSelection();
			if (dom && this.contentEditableElementRef.value?.contains(dom.anchorNode)) {
				const live = $createRangeSelectionFromDom(dom, this.editor);
				if (live) $setSelection(live);
			}
			// Unfocused editors have no selection: wrap at the end.
			if (placeholder && !$isRangeSelection($getSelection())) $getRoot().selectEnd();
			wrapped = $wrapSelection(start, placeholder);
		}, { discrete: true });
		this._toolbar = undefined;
		this.contentEditableElementRef.value?.focus();
		return wrapped;
	}

	/** Removes the markup `name` around the cursor and keeps its words, e.g. unlinks a link. Returns false if there is none. */
	unwrapMarkup(name: string): boolean {
		const pair = [...this._activePairs].reverse().find((value) => value.name === name);
		if (!pair) return false;
		this.editor.update(() => {
			$getNodeByKey(pair.start)?.remove();
			$getNodeByKey(pair.end)?.remove();
		}, { discrete: true });
		this._toolbar = undefined;
		this.contentEditableElementRef.value?.focus();
		return true;
	}

	/** Inserts a standalone markup tag (a line break, an icon) at the caret, or at the end. */
	insertMarkup(part: MarkupStandalone) {
		this.editor.update(
			() => {
				let selection = $getSelection();
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
				}
				if (!$isRangeSelection(selection)) return;
				const token = $createPatternTokenNode(structuredClone(part));
				(selection as RangeSelection).insertNodes([token]);
				token.selectNext(0, 0);
			},
			{ discrete: true }
		);
		this.contentEditableElementRef.value?.focus();
	}

	/** Position of the DOM selection relative to the editor, for the toolbar and suggestions. */
	private _selectionBox(): DOMRect | undefined {
		const selection = window.getSelection();
		const wrapper = this.querySelector(".inlang-pattern-editor-wrapper");
		if (!selection?.rangeCount || !wrapper || !this.contentEditableElementRef.value?.contains(selection.anchorNode)) return undefined;
		const rect = selection.getRangeAt(0).getBoundingClientRect();
		const base = wrapper.getBoundingClientRect();
		return new DOMRect(rect.left - base.left, rect.top - base.top, rect.width, rect.height);
	}

	/** Shows the markup toolbar over a selection and variable suggestions after `{`. */
	private _updatePopups() {
		const focused = this.contentEditableElementRef.value?.contains(document.activeElement) ?? false;
		const state = this.editor.getEditorState();
		const ranged = state.read(() => { const selection = $getSelection(); return $isRangeSelection(selection) && !selection.isCollapsed(); });
		const box = focused ? this._selectionBox() : undefined;
		this._markActiveMarkup(focused);
		const width = this.querySelector(".inlang-pattern-editor-wrapper")?.clientWidth ?? 0;
		// Offered markup the cursor is inside: the toolbar offers to remove it, also without a selection.
		const active = this._activePairs.map((pair) => pair.name).filter((name) => this.markupOptions.some((option) => option.part.name === name));
		// Above the selection, or below it when that would cover the content above the editor.
		this._toolbar =
			focused && box && this.markupOptions.length && (ranged || active.length)
				? { x: Math.max(0, Math.min(box.x, width - 220)), y: box.y, below: box.y < 36 ? box.y + box.height + 6 : undefined, ranged, active }
				: undefined;
		const query = focused && this.variables.length ? state.read($caretQuery) : undefined;
		const spot = query && `${query.key}:${query.from}`;
		const items = query ? this.variables.filter((item) => item.name.toLowerCase().startsWith(query.query.toLowerCase())) : [];
		if (!query || !box || !items.length || spot === this._dismissed) { this._suggest = undefined; return; }
		const index = this._suggest && this._suggest.target.key === query.key && this._suggest.target.from === query.from ? Math.min(this._suggest.index, items.length - 1) : 0;
		this._suggest = { items, index, x: Math.max(0, Math.min(box.x, width - 240)), y: box.y + box.height, target: query };
	}

	/**
	 * Markup tags for known formatting (bold, italic, links) are hidden so translators see formatted
	 * text; the tags of the markup around the cursor are shown so it is clear what it is.
	 */
	private _markActiveMarkup(focused: boolean) {
		const active = new Set<string>();
		const pairs: { name: string; start: string; end: string }[] = [];
		if (focused)
			this.editor.getEditorState().read(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				const anchor = selection.anchor.getNode();
				const block = anchor.getTopLevelElement();
				if (!block || !$isElementNode(block)) return;
				const children = block.getChildren();
				const at = children.findIndex((child) => child.getKey() === anchor.getKey() || child.isParentOf(anchor));
				const open: PatternTokenNode[] = [];
				children.forEach((child, index) => {
					if (!$isPatternTokenNode(child)) return;
					const part = child.getPart();
					if (part.type === "markup-start") open.push(child);
					else if (part.type === "markup-end") {
						const start = open.map((node) => node.getPart().type === "markup-start" && (node.getPart() as MarkupStart).name).lastIndexOf(part.name);
						if (start === -1) return;
						const [opening] = open.splice(start, 1);
						const from = children.indexOf(opening!);
						if (at >= from && at <= index) {
							active.add(opening!.getKey());
							active.add(child.getKey());
							pairs.push({ name: part.name, start: opening!.getKey(), end: child.getKey() });
						}
					}
				});
			});
		this._activePairs = pairs;
		const elements = new Set([...active].map((key) => this.editor.getElementByKey(key)));
		this.querySelectorAll<HTMLElement>(".inlang-token-markup").forEach((element) =>
			element.classList.toggle("inlang-token-active", elements.has(element))
		);
	}

	private _choose(name: string) {
		const target = this._suggest?.target;
		if (!target) return;
		this._suggest = undefined;
		this.editor.update(() => $insertVariableAt(target, name), { discrete: true });
	}

	/** Shortcut keys for markup and suggestion navigation; returns true when handled. */
	private _onKey(event: KeyboardEvent): boolean {
		// Enter, Tab, Escape and shortcuts confirm or cancel an IME composition: leave them to the IME.
		if (event.isComposing || event.keyCode === 229) return false;
		const suggest = this._suggest;
		if (suggest) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				const step = event.key === "ArrowDown" ? 1 : -1;
				this._suggest = { ...suggest, index: (suggest.index + step + suggest.items.length) % suggest.items.length };
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") { this._choose(suggest.items[suggest.index]!.name); return true; }
			if (event.key === "Escape") { this._dismissed = `${suggest.target.key}:${suggest.target.from}`; this._suggest = undefined; return true; }
		}
		if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
			const kind = { k: "underline", b: "bold", i: "italic" }[event.key.toLowerCase()];
			const option = kind && this.markupOptions.find((value) => markupKind(value.part.name) === kind);
			// The same shortcut removes the markup when the cursor is already inside it.
			if (option) return this.unwrapMarkup(option.part.name) || this.wrapSelection(option.part) || true;
		}
		return false;
	}

	/**
	 * Accept the next `variant` even if it matches text this editor typed earlier, e.g. after the
	 * host undoes an edit. The content is replaced in place and the caret kept, so focus stays.
	 */
	forgetEdits() {
		this._echoes.clear();
	}

	/**
	 * Focuses the editable area. Right after the editor was created or got a
	 * new `variant`, it focuses once that is rendered, so keys typed right away
	 * (after "+ Add form") land in the editor.
	 */
	override focus(options?: FocusOptions) {
		const element = this.contentEditableElementRef.value;
		if (element && this.hasUpdated && !this.isUpdatePending)
			element.focus(options);
		else this._pendingFocus = options ?? {};
	}

	private get _isEmpty() {
		const pattern = this._patternState;
		return (
			pattern === undefined ||
			pattern.length === 0 ||
			(pattern.length === 1 &&
				pattern[0]!.type === "text" &&
				pattern[0]!.value.length === 0)
		);
	}

	override render() {
		return html`
			<style>
				inlang-pattern-editor {
					display: block;
					width: 100%;
				}
				inlang-pattern-editor .inlang-pattern-editor-wrapper {
					box-sizing: border-box;
					min-height: var(--inlang-pattern-min-height, 44px);
					width: 100%;
					position: relative;
				}
				inlang-pattern-editor .inlang-pattern-editor-wrapper:focus-within {
					z-index: 1;
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable {
					box-sizing: border-box;
					background-color: var(--inlang-pattern-background, #ffffff);
					padding: var(--inlang-pattern-padding, 14px 12px);
					min-height: var(--inlang-pattern-min-height, 44px);
					width: 100%;
					font-size: var(--inlang-pattern-font-size, 14px);
					line-height: var(--inlang-pattern-line-height, 1.5);
					color: var(--inlang-pattern-color, #242424);
					border: var(--inlang-pattern-border-width, 0px) solid
						var(--inlang-pattern-border-color, transparent);
					border-radius: var(--inlang-pattern-border-radius, 0);
					outline: none;
					white-space: pre-wrap;
					overflow-wrap: anywhere;
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable p {
					margin: 0;
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable:focus {
					border-color: var(
						--inlang-pattern-focus-border-color,
						var(--inlang-pattern-border-color, transparent)
					);
					box-shadow: var(
						--inlang-pattern-focus-ring,
						0 0 0 var(--sl-focus-ring-width, 3px)
							var(--sl-input-focus-ring-color, rgb(37 99 235 / 0.2))
					);
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable:hover:not(:focus) {
					border-color: var(
						--inlang-pattern-hover-border-color,
						var(--inlang-pattern-border-color, transparent)
					);
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable:hover {
					background-color: var(
						--inlang-pattern-hover-background,
						var(--inlang-pattern-background, #f9f9f9)
					);
				}
				inlang-pattern-editor .inlang-pattern-editor-placeholder {
					margin: 0;
					color: var(--inlang-text-subtle, #71717a);
					position: absolute;
					inset: 0;
					/* the same box as the editable area, so the placeholder sits where the text starts */
					border: var(--inlang-pattern-border-width, 0px) solid transparent;
					padding: var(--inlang-pattern-padding, 14px 12px);
					font-size: var(--inlang-pattern-font-size, 14px);
					line-height: var(--inlang-pattern-line-height, 1.5);
					pointer-events: none;
					overflow: hidden;
					white-space: nowrap;
					text-overflow: ellipsis;
				}
				inlang-pattern-editor .inlang-pattern-editor-bold {
					font-weight: 600;
				}
				inlang-pattern-editor .inlang-pattern-editor-italic {
					font-style: italic;
				}
				inlang-pattern-editor .inlang-pattern-editor-underline {
					text-decoration: underline;
					text-decoration-color: var(--inlang-link-color, #1d4ed8);
					text-decoration-thickness: 1.5px;
					text-underline-offset: 3px;
				}
				/* Known formatting shows as formatted text; its tags appear while the cursor is inside. */
				inlang-pattern-editor .inlang-token-markup-bold:not(.inlang-token-active),
				inlang-pattern-editor .inlang-token-markup-italic:not(.inlang-token-active),
				inlang-pattern-editor .inlang-token-markup-underline:not(.inlang-token-active) {
					font-size: 0;
					padding: 0;
					margin: 0;
					border: 0;
				}
				inlang-pattern-editor .inlang-token {
					font-family: var(
						--inlang-font-mono,
						"JetBrains Mono",
						ui-monospace,
						SFMono-Regular,
						Menlo,
						monospace
					);
					border-radius: var(--inlang-token-radius, 4px);
					white-space: nowrap;
					cursor: default;
				}
				inlang-pattern-editor .inlang-token-variable {
					font-size: var(--inlang-token-font-size, 0.86em);
					color: var(--inlang-variable-color, #1d4ed8);
					background: var(--inlang-variable-background, #eff6ff);
					padding: 0 3px;
				}
				inlang-pattern-editor .inlang-token-markup {
					font-size: 0.72em;
					font-weight: 400;
					font-style: normal;
					text-decoration: none;
					color: var(--inlang-markup-color, #52525b);
					background: var(--inlang-markup-background, #f4f4f5);
					border: 1px solid var(--inlang-border, #e4e4e7);
					padding: 0 3px;
					margin: 0 1px;
					vertical-align: 0.1em;
				}
				inlang-pattern-editor .inlang-pattern-editor-toolbar {
					position: absolute;
					z-index: 20;
					transform: translateY(calc(-100% - 6px));
					display: flex;
					gap: 2px;
					padding: 3px;
					border-radius: var(--inlang-popover-radius, 8px);
					background: var(--inlang-toolbar-background, #18181b);
					box-shadow: var(--inlang-popover-shadow, 0 10px 24px -8px rgb(24 24 27 / 0.5));
				}
				inlang-pattern-editor .inlang-pattern-editor-toolbar.below {
					transform: none;
				}
				inlang-pattern-editor .inlang-pattern-editor-toolbar button {
					border: 0;
					background: transparent;
					color: var(--inlang-toolbar-color, #fff);
					font: inherit;
					font-size: var(--inlang-popover-font-size, 13px);
					line-height: 1.3;
					padding: 5px 9px;
					border-radius: 5px;
					cursor: pointer;
					white-space: nowrap;
					box-shadow: none;
					min-height: 0;
				}
				inlang-pattern-editor .inlang-pattern-editor-toolbar button:hover,
				inlang-pattern-editor .inlang-pattern-editor-toolbar button:focus-visible {
					background: rgb(255 255 255 / 0.16);
				}
				inlang-pattern-editor .inlang-pattern-editor-suggest {
					position: absolute;
					z-index: 20;
					margin-top: 4px;
					min-width: 220px;
					padding: 4px;
					border-radius: var(--inlang-popover-radius, 10px);
					background: var(--inlang-surface, #fff);
					border: 1px solid var(--inlang-border, #e4e4e7);
					box-shadow: var(--inlang-popover-shadow, 0 14px 36px -10px rgb(24 24 27 / 0.3));
					font-size: var(--inlang-popover-font-size, 13px);
				}
				inlang-pattern-editor .inlang-pattern-editor-suggest [role="option"] {
					display: flex;
					align-items: center;
					gap: 10px;
					padding: 6px 8px;
					border-radius: 6px;
					cursor: pointer;
				}
				inlang-pattern-editor .inlang-pattern-editor-suggest [role="option"].on {
					background: var(--inlang-hover, #f4f4f5);
				}
				inlang-pattern-editor .inlang-pattern-editor-suggest small {
					margin-left: auto;
					color: var(--inlang-text-muted, #71717a);
				}
				inlang-pattern-editor .inlang-pattern-editor-suggest p {
					margin: 2px 8px 4px;
					font-size: 11px;
					color: var(--inlang-text-subtle, #71717a);
				}
			</style>
			<div class="inlang-pattern-editor-wrapper">
				<div
					class="inlang-pattern-editor-contenteditable"
					part="editor"
					contenteditable
					role="textbox"
					aria-multiline="true"
					aria-label=${this.accessibleLabel || nothing}
					aria-placeholder=${this.placeholder || nothing}
					dir="auto"
					${ref(this.contentEditableElementRef)}
				></div>
				${this._toolbar
					? html`<div class=${this._toolbar.below === undefined ? "inlang-pattern-editor-toolbar" : "inlang-pattern-editor-toolbar below"} role="toolbar" aria-label="Format selection" style="left: ${this._toolbar.x}px; top: ${this._toolbar.below ?? this._toolbar.y}px" @mousedown=${(event: Event) => event.preventDefault()}>
							${this.markupOptions.map((option) =>
								this._toolbar!.active.includes(option.part.name)
									? html`<button type="button" @click=${() => this.unwrapMarkup(option.part.name)}>${removeLabel(option.part.name)}</button>`
									: this._toolbar!.ranged
										? html`<button type="button" @click=${() => this.wrapSelection(option.part)}>${option.label}</button>`
										: ""
							)}
						</div>`
					: ""}
				${this._suggest
					? html`<div class="inlang-pattern-editor-suggest" role="listbox" aria-label="Variables" style="left: ${this._suggest.x}px; top: ${this._suggest.y}px" @mousedown=${(event: Event) => event.preventDefault()}>
							${this._suggest.items.map((item, index) => html`<div role="option" aria-selected=${index === this._suggest!.index} class=${index === this._suggest!.index ? "on" : ""} @click=${() => this._choose(item.name)}><span class="inlang-token inlang-token-variable">{${item.name}}</span>${item.hint ? html`<small>${item.hint}</small>` : ""}</div>`)}
							<p>↵ insert · Esc type a plain {</p>
						</div>`
					: ""}
				${this._isEmpty && this.placeholder
					? html`<p
							class="inlang-pattern-editor-placeholder"
							aria-hidden="true"
						>
							${this.placeholder}
						</p>`
					: ""}
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-pattern-editor": InlangPatternEditor;
	}
}
