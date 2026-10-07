import type { Message, ProjectSettings, Variant, Declaration } from "@inlang/sdk";
import { LitElement, css, html } from "lit";
import { v7 as uuidV7 } from "uuid";
import { customElement, property } from "lit/decorators.js";
import { baseStyling } from "../../styling/base.js";
import { selectorMatches } from "../../helper/selectorMatches.js";
import { createChangeEvent } from "../../helper/event.js";

import SlTag from "@shoelace-style/shoelace/dist/components/tag/tag.component.js";
import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js";
import SlMenu from "@shoelace-style/shoelace/dist/components/menu/menu.component.js";
import SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.component.js";

if (!customElements.get("sl-tag")) customElements.define("sl-tag", SlTag);
if (!customElements.get("sl-dropdown"))
	customElements.define("sl-dropdown", SlDropdown);
if (!customElements.get("sl-menu")) customElements.define("sl-menu", SlMenu);
if (!customElements.get("sl-menu-item"))
	customElements.define("sl-menu-item", SlMenuItem);

@customElement("inlang-message")
export default class InlangMessage extends LitElement {
	static override styles = [
		baseStyling,
		css`
			div {
				box-sizing: border-box;
				font-size: 14px;
			}
			:host {
				position: relative;
				display: flex;
				direction: ltr;
				min-height: 44px;
				border: 1px solid var(--sl-input-border-color) !important;
				border-top: none !important;
			}
			.message:first-child {
				border-top: 1px solid var(--sl-input-border-color) !important;
			}
			.language-container {
				font-weight: 500;
				width: 80px;
				min-height: 44px;
				padding-top: 12px;
				padding-left: 12px;
				padding-right: 12px;
				background-color: var(--sl-input-background-color-disabled);
				border-right: 1px solid var(--sl-input-border-color);
				color: var(--sl-input-color);
			}
			.message-body {
				flex: 1;
				display: flex;
				flex-direction: column;
			}
			.message-header {
				width: 100%;
				min-height: 44px;
				display: flex;
				justify-content: space-between;
				background-color: var(--sl-input-background-color-disabled);
				color: var(--sl-input-color);
				border-bottom: 1px solid var(--sl-input-border-color);
			}
			.no-bottom-border {
				border-bottom: none;
			}
			.selector-container {
				min-height: 44px;
				display: flex;
			}
			.selector-type { font-size: 10px; font-weight: 400; color: var(--sl-color-neutral-500); }
			.selector {
				height: 44px;
				width: 120px;
				display: flex;
				align-items: flex-start;
				justify-content: center;
				flex-direction: column;
				padding: 6px 12px;
				border-right: 1px solid var(--sl-input-border-color);
				font-weight: 500;
				cursor: pointer;
			}
			sl-menu-item::part(label) {
				font-size: 14px;
				padding-left: 12px;
			}
			sl-menu-item::part(base) {
				color: var(--sl-input-color);
			}
			sl-menu-item::part(base):hover {
				background-color: var(--sl-input-background-color-hover);
			}
			sl-menu-item::part(checked-icon) {
				display: none;
			}
			.selector:hover {
				background-color: var(--sl-input-background-color-hover);
			}
			.add-selector-container {
				height: 44px;
				width: 44px;
				display: flex;
				align-items: center;
				padding: 12px;
			}
			.add-selector::part(base) {
				height: 28px;
				width: 28px;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 4px;
				cursor: pointer;
				font-size: 13px;
			}
			.message-actions {
				height: 44px;
				display: flex;
				align-items: center;
				padding: 12px;
				gap: 8px;
			}
			sl-button::part(base) {
				background-color: var(--sl-input-background-color);
				color: var(--sl-input-color);
				border: 1px solid var(--sl-input-border-color);
			}
			sl-button::part(base):hover {
				background-color: var(--sl-input-background-color-hover);
				color: var(--sl-input-color-hover);
				border: 1px solid var(--sl-input-border-color-hover);
			}
			.variants-container {
				width: 100%;
				height: 44px;
				display: flex;
				flex-direction: column;
				height: auto;
			}
			.new-variant {
				box-sizing: border-box;
				min-height: 44px;
				width: 100%;
				display: flex;
				gap: 4px;
				align-items: center;
				padding-left: 12px;
				margin: 0;
				background-color: var(--sl-input-background-color);
				color: var(--sl-input-placeholder-color);
				border-top: 1px solid var(--sl-input-border-color);
				cursor: pointer;
				transitions: all 0.5s;
			}
			.new-variant:hover {
				background-color: var(--sl-input-background-color-hover);
				color: var(--sl-input-color-hover);
			}
			.ref-tag::part(base) {
				background-color: var(--sl-input-placeholder-color);
				color: var(--sl-input-background-color);
				height: 22px;
				border: none;
			}
			.selector-button {
				margin-left: 8px;
			}
		`,
	];

	@property()
	message: Message;

	@property()
	variants: Variant[];

	@property({ type: Object })
	settings: ProjectSettings | undefined;

	private _refLocale = (): ProjectSettings["locales"][number] | undefined => {
		return this.settings?.baseLocale;
	};

	private _selectorType(name: string) {
		const bundle = this.closest("inlang-bundle") as (HTMLElement & { bundle?: { declarations: Declaration[] } }) | null;
		return selectorMatches(name, bundle?.bundle?.declarations ?? [], this.message?.locale ?? "", this.variants ?? []).label;
	}

	override render() {
		return html`
			<div class="language-container">
				<span>${this.message?.locale}</span>
				${this._refLocale() === this.message?.locale
					? html`<sl-tag class="ref-tag" size="small" variant="neutral"
							>ref</sl-tag
						>`
					: ``}
			</div>
			<div class="message-body">
				${(this.message && this.message.selectors.length > 0) ||
				(this.message &&
					this.variants &&
					this.variants.length > 1 &&
					this.message.selectors.length === 0)
					? html`<div
							class=${`message-header` +
							` ` +
							(this.variants && this.variants.length === 0
								? `no-bottom-border`
								: ``)}
						>
							<div class="selector-container">
								${this.message.selectors.map(
									(selector, index) =>
										html`<sl-dropdown>
											<div class="selector" part="selector" slot="trigger">
												<span>${selector.name}</span>
												<span class="selector-type" title=${this._selectorType(selector.name)}>${this._selectorType(selector.name).split(" · ")[0]}</span>
											</div>
											<sl-menu>
												<sl-menu-item
													value="delete"
													@click=${() => {
														if (this.message) {
															// remove matches from underlying variants
															for (const variant of this.variants) {
																this.dispatchEvent(
																	createChangeEvent({
																		entityId: variant.id,
																		entity: "variant",
																		newData: {
																			...variant,
																			matches: variant.matches.filter(
																				(match) =>
																					match["key"] !== selector.name
																			),
																		},
																	})
																);
															}
															// remove selector from message
															this.dispatchEvent(
																createChangeEvent({
																	entityId: this.message.id,
																	entity: "message",
																	newData: {
																		...this.message,

																		selectors: this.message.selectors.filter(
																			(_, i) => i !== index
																		),
																	},
																})
															);
														}
													}}
													><svg
														xmlns="http://www.w3.org/2000/svg"
														width="18px"
														height="18px"
														viewBox="0 0 24 24"
														slot="prefix"
														style="margin-right: -4px; margin-left: 12px"
													>
														<g fill="none">
															<path
																d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"
															/>
															<path
																fill="currentColor"
																d="M20 5a1 1 0 1 1 0 2h-1l-.003.071l-.933 13.071A2 2 0 0 1 16.069 22H7.93a2 2 0 0 1-1.995-1.858l-.933-13.07L5 7H4a1 1 0 0 1 0-2zm-3.003 2H7.003l.928 13h8.138zM14 2a1 1 0 1 1 0 2h-4a1 1 0 0 1 0-2z"
															/>
														</g></svg
													>Delete selector</sl-menu-item
												>
											</sl-menu>
										</sl-dropdown>`
								)}
								<div class="selector-button">
									<slot name="selector-button"></slot>
								</div>
							</div>
							<div class="message-actions"></div>
						</div>`
					: ``}
				<div class="variants-container">
					<slot name="variant"></slot>
					${this.message?.selectors && this.message.selectors.length > 0
						? html`<p
								part="new-variant"
								@click=${() => {
									const variant: Variant = {
										id: uuidV7(),
										messageId: this.message.id,
										// combine the matches that are already present with the new category -> like a matrix
										matches: this.message.selectors.map((selector) => ({
											type: "literal-match",
											key: selector.name,
											value: "",
										})),
										pattern: [],
									};
									this.dispatchEvent(
										createChangeEvent({
											entityId: variant.id,
											entity: "variant",
											newData: variant,
										})
									);
								}}
								class="new-variant"
							>
								<svg
									viewBox="0 0 24 24"
									width="18"
									height="18"
									slot="prefix"
									class="w-5 h-5 -mx-1"
								>
									<path
										fill="currentColor"
										d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"
									></path>
								</svg>
								New variant
							</p>`
						: ``}
				</div>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-message": InlangMessage;
	}
}
