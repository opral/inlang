import type { Pattern, VariantRow } from "@inlang/sdk";
import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref, createRef, type Ref } from "lit/directives/ref.js";
import { createEditor } from "lexical";
import type { ElementNode, TextNode } from "lexical";
import { registerPlainText } from "@lexical/plain-text";
import {
	$getRoot,
	$createParagraphNode,
	$createTextNode,
	$getSelection,
	$createRangeSelection,
	$setSelection,
} from "lexical";
import patternToString from "../../helper/patternToString.js";
import stringToPattern from "../../helper/stringToPattern.js";
import { createChangeEvent } from "../../helper/event.js";

// Define interfaces for the selection data
interface SelectionPoint {
	key: string;
	offset: number;
	type: string;
}

interface SavedSelectionInfo {
	anchor: SelectionPoint;
	focus: SelectionPoint;
	type: string;
}

// Define a type for a selection with anchor and focus
interface RangeSelectionLike {
	anchor: { key: string; offset: number; type: string };
	focus: { key: string; offset: number; type: string };
}

//editor config
const config = {
	namespace: "MyEditor",
	onError: console.error,
};

@customElement("inlang-pattern-editor")
export default class InlangPatternEditor extends LitElement {
	// refs
	contentEditableElementRef: Ref<HTMLDivElement> = createRef();

	// props
	@property({ type: Object })
	variant: VariantRow;

	// state
	@state()
	_patternState: Pattern | undefined;

	//disable shadow root -> because of contenteditable selection API
	override createRenderRoot() {
		return this;
	}

	// create editor
	editor = createEditor(config);

	// update editor state when variant prop changes
	override updated(changedProperties: PropertyValues<this>) {
		if (
			changedProperties.has("variant") &&
			JSON.stringify(this.variant?.pattern as any) !==
				JSON.stringify(this._patternState)
		) {
			this._setEditorState();
		}
	}

	// set editor state
	private _setEditorState = () => {
		// Early return if editor doesn't have focus - no need to preserve selection
		if (
			!this.contentEditableElementRef.value?.contains(document.activeElement)
		) {
			this._updateEditorContent();
			return;
		}

		// Save current selection state using Lexical's API
		let selectionInfo: SavedSelectionInfo | null = null;
		this.editor.getEditorState().read(() => {
			const selection = $getSelection();
			// Check if selection has the properties of a RangeSelection
			if (selection && "anchor" in selection && "focus" in selection) {
				// Type assertion to treat selection as having anchor and focus properties
				const rangeSelection = selection as RangeSelectionLike;

				// This is a RangeSelection-like object, safe to use
				selectionInfo = {
					anchor: {
						key: rangeSelection.anchor.key,
						offset: rangeSelection.anchor.offset,
						type: rangeSelection.anchor.type,
					},
					focus: {
						key: rangeSelection.focus.key,
						offset: rangeSelection.focus.offset,
						type: rangeSelection.focus.type,
					},
					type: "range", // RangeSelection always has type 'range'
				};
			}
		});

		// Update the editor content
		this._updateEditorContent();

		// Restore selection if we had one
		if (selectionInfo) {
			setTimeout(() => {
				this.editor.update(() => {
					try {
						// Get the root node to find our target text node
						const root = $getRoot();
						if (root.getChildrenSize() > 0) {
							const paragraph = root.getFirstChild() as ElementNode | null;
							if (paragraph) {
								const textNode = paragraph.getFirstChild() as TextNode | null;
								if (textNode) {
									// Create a new range selection
									const selection = $createRangeSelection();

									// Set both points to the saved offset or to the end of text
									// if our saved position is beyond text length
									const textLength = textNode.getTextContent().length;
									const anchorOffset = Math.min(
										selectionInfo!.anchor.offset,
										textLength
									);
									const focusOffset = Math.min(
										selectionInfo!.focus.offset,
										textLength
									);

									selection.anchor.set(textNode.getKey(), anchorOffset, "text");
									selection.focus.set(textNode.getKey(), focusOffset, "text");

									// Apply the selection
									$setSelection(selection);
								}
							}
						}
					} catch (e) {
						console.error("Failed to restore selection:", e);
					}
				});
			}, 0);
		}
	};

	// Update editor content without affecting selection
	private _updateEditorContent = () => {
		// remove text content listener
		this._removeTextContentListener?.();

		// override pattern state
		this._patternState = this.variant?.pattern;

		// update editor
		this.editor.update(
			() => {
				const root = $getRoot();
				if (root.getChildren().length === 0) {
					const paragraphNode = $createParagraphNode();
					const textNode = $createTextNode(
						this.variant?.pattern
							? patternToString({ pattern: this.variant?.pattern })
							: ""
					);
					paragraphNode.append(textNode);
					root.append(paragraphNode);
				} else {
					const paragraphNode = root.getChildren()[0]!;
					paragraphNode.remove();
					const newpParagraphNode = $createParagraphNode();
					const textNode = $createTextNode(
						this.variant?.pattern
							? patternToString({ pattern: this.variant?.pattern })
							: ""
					);
					newpParagraphNode.append(textNode);
					root.append(newpParagraphNode);
				}
			},
			{
				discrete: true,
			}
		);

		// readd text content listener
		this._removeTextContentListener = this.editor.registerTextContentListener(
			(textContent: any) => {
				this._handleListenToTextContent(textContent);
			}
		);
	};

	override async firstUpdated() {
		// initialize editor
		const contentEditableElement = this.contentEditableElementRef.value;
		if (contentEditableElement) {
			// set root element of editor and register plain text
			this.editor.setRootElement(contentEditableElement);
			registerPlainText(this.editor);

			// listen to text content changes and dispatch `change` event
			this._removeTextContentListener = this.editor.registerTextContentListener(
				(textContent: any) => {
					this._handleListenToTextContent(textContent);
				}
			);

			contentEditableElement.addEventListener("focus", () => {
				const onPatternEditorFocus = new CustomEvent("pattern-editor-focus");
				this.dispatchEvent(onPatternEditorFocus);
			});
			contentEditableElement.addEventListener("blur", () => {
				const onPatternEditorBlur = new CustomEvent("pattern-editor-blur");
				this.dispatchEvent(onPatternEditorBlur);
			});
		}
	}

	private _handleListenToTextContent = (textContent: any) => {
		this._patternState = stringToPattern({ text: textContent });
		this.dispatchEvent(
			createChangeEvent({
				entityId: this.variant.id,
				entity: "variant",
				newData: { ...this.variant, pattern: this._patternState } as VariantRow,
			})
		);
	};

	private _removeTextContentListener: undefined | (() => void);

	override render() {
		return html`
			<style>
				div {
					box-sizing: border-box;
					font-size: 14px;
				}
				p {
					margin: 0;
				}
				inlang-pattern-editor {
					width: 100%;
				}
				.inlang-pattern-editor-wrapper {
					min-height: 44px;
					width: 100%;
					position: relative;
				}
				.inlang-pattern-editor-wrapper:focus-within {
					z-index: 1;
				}
				.inlang-pattern-editor-contenteditable {
					background-color: #ffffff;
					padding: 14px 12px;
					min-height: 44px;
					width: 100%;
					color: #242424;
					outline: none;
				}
				.inlang-pattern-editor-contenteditable:focus {
					box-shadow: 0 0 0 var(--sl-focus-ring-width)
						var(--sl-input-focus-ring-color);
				}
				.inlang-pattern-editor-contenteditable:hover {
					background-color: #f9f9f9;
					color: #000;
				}
				.inlang-pattern-editor-placeholder {
					opacity: 0.5;
					position: absolute;
					top: 14px;
					left: 12px;
					font-size: 14px;
					font-weight: 500;
					pointer-events: none;
					font-family: var(--sl-font-sans);
				}
			</style>
			<div class="inlang-pattern-editor-wrapper">
				<div
					class="inlang-pattern-editor-contenteditable"
					contenteditable
					dir="auto"
					${ref(this.contentEditableElementRef)}
				></div>
				${this._patternState === undefined ||
				this._patternState.length === 0 ||
				(this._patternState.length === 1 &&
					(this._patternState[0]! as { type: string; value: string }).value
						.length === 0)
					? html`<p class="inlang-pattern-editor-placeholder">
							Enter pattern ...
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
