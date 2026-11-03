import type { BundleRow } from "@inlang/sdk";
import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createChangeEvent } from "../../helper/event.js";

/** Guidance beside the bundle key; related source actions use the context slot. */
@customElement("inlang-bundle-description")
export default class InlangBundleDescription extends LitElement {
	@property({ type: Object }) bundle!: BundleRow;
	@property({ type: Boolean, reflect: true }) disabled = false;
	@state() private editing = false;
	@state() private draft = "";
	@state() private value: string | null = null;
	@state() private hasContext = false;

	static override styles = css`
		:host {
			display: block;
			font: inherit;
			color: var(--inlang-text-muted, inherit);
			line-height: 1.5;
			overflow-wrap: anywhere;
		}
		button,
		textarea {
			font: inherit;
			color: inherit;
		}
		button {
			cursor: pointer;
		}
		.trigger,
		.cancel,
		.clear {
			border: 0;
			background: transparent;
			padding: 0;
			text-align: start;
		}
		.trigger,
		.copy {
			white-space: pre-wrap;
		}
		.trigger {
			display: inline;
		}
		.trigger:hover,
		.cancel:hover,
		.clear:hover {
			text-decoration: underline;
		}
		.empty {
			color: var(--inlang-text-subtle, var(--inlang-text-muted, inherit));
		}
		.context {
			white-space: nowrap;
		}
		.editing {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 6px;
		}
		.editing textarea {
			grid-column: 1 / -1;
		}
		.editing .context {
			align-self: center;
		}
		.editing .actions {
			margin-top: 0;
		}
		.separator {
			padding: 0 0.35em;
		}
		textarea {
			box-sizing: border-box;
			display: block;
			width: 100%;
			min-height: 76px;
			resize: vertical;
			padding: var(--inlang-pattern-padding, 8px);
			color: var(--inlang-pattern-color, var(--inlang-text, inherit));
			background: var(
				--inlang-pattern-background,
				var(--inlang-surface, transparent)
			);
			border: 1px solid var(--inlang-border-strong, var(--inlang-border, #aaa));
			border-radius: var(--inlang-radius-small, 4px);
		}
		button:focus-visible,
		textarea:focus-visible {
			outline: 2px solid var(--inlang-accent, #2563eb);
			outline-offset: 2px;
		}
		.actions {
			display: flex;
			align-items: center;
			gap: 12px;
			flex-wrap: wrap;
			margin-top: 6px;
		}
		.save {
			border: 1px solid var(--inlang-border, #aaa);
			border-radius: var(--inlang-radius-small, 4px);
			background: var(--inlang-surface, transparent);
			color: var(--inlang-text, inherit);
			padding: 3px 8px;
		}
		.save:hover {
			background: var(--inlang-hover, var(--inlang-surface-muted, transparent));
		}
		.clear {
			margin-inline-start: auto;
		}
		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		@media (pointer: coarse) {
			button {
				min-height: 44px;
			}
			textarea {
				font-size: max(16px, 1em);
			}
		}
	`;

	protected override willUpdate(changes: PropertyValues<this>) {
		if (changes.has("bundle")) {
			const previous = changes.get("bundle") as BundleRow | undefined;
			this.value = this.bundle?.description ?? null;
			if (previous?.id !== this.bundle?.id) this.editing = false;
		}
		if (this.disabled) this.editing = false;
	}

	private async edit() {
		this.draft = this.value ?? "";
		this.editing = true;
		await this.updateComplete;
		this.renderRoot.querySelector("textarea")?.focus();
	}

	private async close() {
		this.editing = false;
		await this.updateComplete;
		this.renderRoot.querySelector<HTMLButtonElement>(".trigger")?.focus();
	}

	private save(value = this.draft) {
		if (this.disabled) return;
		const description = value.trim() ? value : null;
		if (description !== this.value) {
			this.value = description;
			this.dispatchEvent(
				createChangeEvent({
					entity: "bundle",
					entityId: this.bundle.id,
					newData: {
						id: this.bundle.id,
						declarations: this.bundle.declarations,
						description,
					},
				})
			);
		}
		void this.close();
	}

	override render() {
		return html`
			<div class=${this.editing ? "editing" : "reading"}>
				${this.editing
					? html`
							<label class="sr-only" for="description">Description</label>
							<textarea
								id="description"
								.value=${this.draft}
								placeholder="Help translators understand this string"
								@input=${(event: Event) => {
									this.draft = (event.target as HTMLTextAreaElement).value;
								}}
								@change=${(event: Event) => event.stopPropagation()}
								@keydown=${(event: KeyboardEvent) => {
									if (event.key === "Escape") {
										event.preventDefault();
										event.stopPropagation();
										void this.close();
									}
									if (
										event.key === "Enter" &&
										(event.metaKey || event.ctrlKey)
									) {
										event.preventDefault();
										event.stopPropagation();
										this.save();
									}
								}}
							></textarea>
							<div class="actions">
								<button class="save" type="button" @click=${() => this.save()}>
									Save
								</button>
								<button
									class="cancel"
									type="button"
									@click=${() => this.close()}
								>
									Cancel
								</button>
								${this.value
									? html`<button
											class="clear"
											type="button"
											@click=${() => this.save("")}
										>
											Clear
										</button>`
									: nothing}
							</div>
						`
					: html`
							${this.disabled
								? this.value
									? html`<span class="copy">${this.value}</span>`
									: nothing
								: html`
										<button
											class=${this.value ? "trigger" : "trigger empty"}
											type="button"
											aria-label=${this.value
												? `Edit description: ${this.value}`
												: "Add description"}
											title=${this.value
												? "Edit description"
												: "Add description"}
											@click=${this.edit}
											.textContent=${this.value ?? "Add description"}
										></button>
									`}
						`}
				<span class="context">
					${this.hasContext && !this.editing && (this.value || !this.disabled)
						? html`<span class="separator" aria-hidden="true">·</span>`
						: nothing}
					<slot
						name="context"
						@slotchange=${(event: Event) => {
							this.hasContext =
								(event.target as HTMLSlotElement).assignedElements().length > 0;
						}}
					></slot>
				</span>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-bundle-description": InlangBundleDescription;
	}
}
