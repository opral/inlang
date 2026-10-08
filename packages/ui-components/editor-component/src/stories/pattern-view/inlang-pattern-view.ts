import type { Declaration, Pattern } from "@inlang/sdk";
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { tokens, partStyles } from "../../styling/tokens.js";
import { tokenText, tokenTitle } from "../pattern-editor/patternNodes.js";
import { renderParts, type RenderItem } from "./renderParts.js";

/**
 * Read-only rendering of a pattern.
 *
 * Expressions render as atomic `{name}` tokens (monospace, quiet blue; the
 * tooltip names the annotation, e.g. "count · plural"). Known markup
 * (b/strong/bold, i/em/italic, a/link/u) renders as real formatting, unknown
 * markup as small neutral tag markers.
 *
 * @csspart variable - An expression token.
 * @csspart markup - A formatted markup span or an unknown-markup marker.
 * @csspart placeholder - The placeholder shown for an empty pattern.
 * @cssprop --inlang-variable-color - Token text color (default #1d4ed8).
 * @cssprop --inlang-variable-background - Token background (default transparent).
 * @cssprop --inlang-search-highlight - Background of text ranges a host registers
 *   as the `inlang-search` CSS custom highlight (default #fde68a). Text lives in
 *   the open shadow root, so walk `shadowRoot` to build the ranges.
 */
@customElement("inlang-pattern-view")
export default class InlangPatternView extends LitElement {
	static override styles = [
		tokens,
		partStyles,
		css`
			:host {
				display: inline;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}
			:host([hidden]) {
				display: none;
			}
			.placeholder {
				color: var(--_text-subtle);
			}
			::highlight(inlang-search) {
				background-color: var(--inlang-search-highlight, #fde68a);
				color: inherit;
			}
		`,
	];

	/** The pattern to render. */
	@property({ type: Array })
	pattern: Pattern = [];

	/** Optional declarations, used to describe tokens ("count · plural"). */
	@property({ type: Array })
	declarations?: Declaration[];

	/** Text shown when the pattern is empty. */
	@property({ type: String })
	placeholder = "";

	override render() {
		const pattern = this.pattern ?? [];
		if (pattern.every((part) => part.type === "text" && part.value === "")) {
			return this.placeholder
				? html`<span class="placeholder" part="placeholder"
						>${this.placeholder}</span
					>`
				: html``;
		}
		const items: RenderItem[] = pattern.map((part) =>
			part.type === "expression"
				? {
						type: "token",
						template: html`<span
							class="variable"
							part="variable"
							title=${tokenTitle(part, this.declarations)}
							>${tokenText(part)}</span
						>`,
					}
				: part
		);
		return renderParts(items);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-pattern-view": InlangPatternView;
	}
}
