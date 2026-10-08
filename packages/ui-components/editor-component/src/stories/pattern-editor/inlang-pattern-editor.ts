import type { Declaration, Pattern, Variant } from "@inlang/sdk";
import { LitElement, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref, createRef, type Ref } from "lit/directives/ref.js";
import {
	$getRoot,
	$createRangeSelection,
	$getNearestNodeFromDOMNode,
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
import {
	$createPatternTokenNode,
	$getCaretOffset,
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
 * @cssprop --inlang-variable-color - Expression token text color.
 * @cssprop --inlang-variable-background - Expression token background.
 */
@customElement("inlang-pattern-editor")
export default class InlangPatternEditor extends LitElement {
	// refs
	contentEditableElementRef: Ref<HTMLDivElement> = createRef();

	// props
	@property({ type: Object })
	variant: Variant;

	/** Optional declarations, used for token tooltips such as "count · plural". */
	@property({ type: Array })
	declarations?: Declaration[];

	/** Placeholder shown while the pattern is empty. */
	@property({ type: String })
	placeholder = "Enter pattern ...";

	/** Accessible label of the text box (read from the `aria-label` attribute). */
	@property({ attribute: "aria-label" })
	accessibleLabel?: string;

	// state
	@state()
	_patternState: Pattern | undefined;

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
		if (
			changedProperties.has("variant") &&
			JSON.stringify(this.variant?.pattern ?? []) !==
				JSON.stringify(this._patternState ?? [])
		) {
			this._setEditorState();
		} else if (
			changedProperties.has("variant") &&
			this._patternState === undefined
		) {
			this._setEditorState();
		}
		if (changedProperties.has("declarations")) this._refreshTitles();
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
				if (caret !== null) $setCaretOffset(caret);
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
		contentEditableElement.addEventListener("focus", () => {
			this.dispatchEvent(new CustomEvent("pattern-editor-focus"));
		});
		contentEditableElement.addEventListener("blur", () => {
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
					return false;
				},
				COMMAND_PRIORITY_LOW
			),
			this.editor.registerUpdateListener(({ editorState, tags }) => {
				if (editorState.read($markupFormatsOutOfSync)) {
					this.editor.update($syncMarkupFormats, { tag: SYNC_FORMAT_TAG });
				}
				this._refreshTitles();
				if (tags.has(SET_PATTERN_TAG)) return;
				const pattern = editorState.read($readPattern);
				if (
					JSON.stringify(pattern) === JSON.stringify(this._patternState ?? [])
				)
					return;
				this._patternState = pattern;
				this.dispatchEvent(
					createChangeEvent({
						entityId: this.variant.id,
						entity: "variant",
						newData: { ...this.variant, pattern } as Variant,
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
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
				}
				if (!$isRangeSelection(selection)) return;
				const token = $createPatternTokenNode({
					type: "expression",
					arg: { type: "variable-reference", name },
				});
				(selection as RangeSelection).insertNodes([token]);
				token.selectNext(0, 0);
			},
			{ discrete: true }
		);
		this.contentEditableElementRef.value?.focus();
	}

	/** Focuses the editable area. */
	override focus(options?: FocusOptions) {
		this.contentEditableElementRef.value?.focus(options);
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
					outline: none;
					white-space: pre-wrap;
					overflow-wrap: anywhere;
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable p {
					margin: 0;
				}
				inlang-pattern-editor .inlang-pattern-editor-contenteditable:focus {
					box-shadow: var(
						--inlang-pattern-focus-ring,
						0 0 0 var(--sl-focus-ring-width, 3px)
							var(--sl-input-focus-ring-color, rgb(37 99 235 / 0.2))
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
					text-underline-offset: 2px;
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
					border-radius: 4px;
					white-space: nowrap;
					cursor: default;
				}
				inlang-pattern-editor .inlang-token-variable {
					font-size: 0.86em;
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
