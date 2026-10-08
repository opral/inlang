import type { Declaration, MessageRow, Pattern, VariantRow } from "@inlang/sdk";
import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tokens, partStyles } from "../../styling/tokens.js";
import { resolveInputVariable } from "@inlang/sdk/browser";
import {
	previewInputs,
	type PreviewInput,
} from "../../helper/previewInputs.js";
import { selectVariant } from "../../helper/selectVariant.js";
import { formatPattern } from "../../helper/formatPattern.js";
import { languageName } from "../../helper/languageName.js";
import { pluralExamples } from "../../helper/pluralExamples.js";
import { renderParts, type RenderItem } from "../pattern-view/renderParts.js";

export type ValuesChangeEventDetail = { values: Record<string, unknown> };
export type VariantMatchEventDetail = { variantId: string | undefined };

type MessageLike = Pick<MessageRow, "selectors"> & { variants?: VariantRow[] };

function today(withTime: boolean): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	return withTime
		? `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}`
		: date;
}

/**
 * Live preview of a message: inputs for the bundle's input variables and the
 * formatted result (with real bold/italic for markup), plus which form
 * (variant) was used. Optionally shows the reference language's output too.
 *
 * @fires values-change - `{ values }` whenever an input changes.
 * @fires variant-match - `{ variantId }` when the matched variant changes (also initially).
 * @csspart inputs
 * @csspart output
 * @csspart form - The "Form: …" line.
 * @csspart variable
 * @csspart markup
 */
@customElement("inlang-message-preview")
export default class InlangMessagePreview extends LitElement {
	static override styles = [
		tokens,
		partStyles,
		css`
			:host {
				display: block;
				background: var(--_surface-muted);
				border-radius: var(--_radius);
				padding: 10px 12px;
				font-size: var(--_font-size-large);
			}
			:host([hidden]) {
				display: none;
			}
			.heading {
				margin: 0 0 8px;
				font-size: var(--_font-size-small);
				font-weight: 500;
				color: var(--_text-muted);
			}
			.inputs {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr));
				gap: 8px;
				margin-bottom: 10px;
			}
			.chips {
				display: flex;
				flex-wrap: wrap;
				gap: 4px;
			}
			.chips button {
				height: 24px;
				min-width: 28px;
				padding: 0 8px;
				border: 1px solid var(--_border-strong, #d4d4d8);
				border-radius: 999px;
				background: var(--_surface, #fff);
				color: var(--_text);
				font: inherit;
				font-size: var(--_font-size-small);
				cursor: pointer;
			}
			.chips button[aria-pressed="true"] {
				background: var(--_text);
				border-color: var(--_text);
				color: var(--_surface, #fff);
			}
			label {
				display: flex;
				flex-direction: column;
				gap: 3px;
				font-size: var(--_font-size-caption);
				color: var(--_text-muted);
				min-width: 0;
			}
			label span {
				font-family: var(--_mono);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			input,
			select {
				height: 30px;
				width: 100%;
				min-width: 0;
				border: 1px solid var(--_border-strong);
				border-radius: var(--_radius-small);
				padding: 0 8px;
				font: inherit;
				font-size: var(--_font-size);
				color: var(--_text);
				background: var(--_surface);
			}
			input:focus-visible,
			select:focus-visible {
				outline: 2px solid var(--_accent);
				outline-offset: 0;
				border-color: var(--_accent);
			}
			.outputs {
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
			.output {
				margin: 0;
				color: var(--_text-muted);
				overflow-wrap: anywhere;
			}
			.output .text {
				white-space: pre-wrap;
			}
			.output .lang {
				display: block;
				font-size: var(--_font-size-caption);
				color: var(--_text-subtle);
			}
			.output .markup-bold {
				color: var(--_text);
			}
			.form {
				margin: 6px 0 0;
				font-size: var(--_font-size-small);
				color: var(--_text-subtle);
			}
			.none {
				font-style: italic;
				color: var(--_text-subtle);
			}
		`,
	];

	@property({ type: Array })
	declarations: Declaration[] = [];

	/** The message to preview. A nested message's `variants` are used when `variants` is not set. */
	@property({ type: Object })
	message?: MessageRow & { variants?: VariantRow[] };

	@property({ type: Array })
	variants?: VariantRow[];

	/** Defaults to `message.locale`. */
	@property({ type: String })
	locale?: string;

	/** Initial or controlled values of input variables. Missing values get defaults. */
	@property({ type: Object })
	values?: Record<string, unknown>;

	/** Also show the reference language's output for the same values. */
	@property({ type: Object })
	reference?: { message: MessageLike; variants?: VariantRow[]; locale: string };

	/** Heading text; "" hides it. */
	@property({ type: String })
	heading = "Preview";

	@state()
	private _edits: Record<string, unknown> = {};

	private _lastVariantId: string | undefined | null = null;

	private get _variants(): VariantRow[] {
		return this.variants ?? this.message?.variants ?? [];
	}

	private get _locale(): string {
		return this.locale ?? this.message?.locale ?? "en";
	}

	private get _referenceVariants(): VariantRow[] {
		return this.reference?.variants ?? this.reference?.message.variants ?? [];
	}

	private _inputs(): PreviewInput[] {
		const messages: Array<{ message: MessageLike; variants: VariantRow[] }> =
			[];
		if (this.message)
			messages.push({ message: this.message, variants: this._variants });
		if (this.reference)
			messages.push({
				message: this.reference.message,
				variants: this._referenceVariants,
			});
		return previewInputs(this.declarations ?? [], messages);
	}

	/** The effective values: defaults, then `values`, then edits made in the inputs. */
	get currentValues(): Record<string, unknown> {
		const defaults: Record<string, unknown> = {};
		for (const input of this._inputs()) {
			defaults[input.name] =
				input.kind === "number"
					? 3
					: input.kind === "date"
						? today(false)
						: input.kind === "datetime"
							? today(true)
							: input.kind === "select"
								? input.options![0]
								: sampleText(input.name);
		}
		return { ...defaults, ...(this.values ?? {}), ...this._edits };
	}

	override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("values")) this._edits = {};
	}

	override updated() {
		const variant = this.message
			? selectVariant({
					message: this.message,
					variants: this._variants,
					declarations: this.declarations,
					values: this.currentValues,
					locale: this._locale,
				})
			: undefined;
		if (variant?.id !== this._lastVariantId) {
			this._lastVariantId = variant?.id;
			this.dispatchEvent(
				new CustomEvent<VariantMatchEventDetail>("variant-match", {
					detail: { variantId: variant?.id },
					bubbles: true,
					composed: true,
				})
			);
		}
	}

	private _set(name: string, value: unknown) {
		this._edits = { ...this._edits, [name]: value };
		this.dispatchEvent(
			new CustomEvent<ValuesChangeEventDetail>("values-change", {
				detail: { values: this.currentValues },
				bubbles: true,
				composed: true,
			})
		);
	}

	/** One example number per plural form of the locale, when `name` feeds a plural selector. */
	private _numberChips(name: string): number[] {
		const plural = (this.declarations ?? []).some(
			(declaration) =>
				declaration.type === "local-variable" &&
				declaration.value.annotation?.name === "plural" &&
				declaration.value.arg.type === "variable-reference" &&
				declaration.value.arg.name === name
		);
		if (!plural) return [];
		const numbers = Object.values(pluralExamples(this._locale)).map((example) =>
			Number(/\d+(?:\.\d+)?/.exec(example)?.[0])
		);
		return [...new Set(numbers.filter((value) => Number.isFinite(value)))];
	}

	private _input(input: PreviewInput, value: unknown) {
		const name = input.name;
		switch (input.kind) {
			case "number":
				return html`${this._numberChips(name).length
						? html`<span
								class="chips"
								role="group"
								aria-label=${`Example values for ${name}`}
								>${this._numberChips(name).map(
									(number) =>
										html`<button
											type="button"
											part="chip"
											aria-pressed=${value === number}
											@click=${() => this._set(name, number)}
										>
											${number}
										</button>`
								)}</span
							>`
						: nothing}<input
						type="number"
						step="any"
						inputmode="decimal"
						.value=${value === undefined || value === null ? "" : String(value)}
						@input=${(e: Event) => {
							const raw = (e.target as HTMLInputElement).value;
							this._set(name, raw === "" ? undefined : Number(raw));
						}}
					/>`;
			case "date":
			case "datetime":
				return html`<input
					type=${input.kind === "date" ? "date" : "datetime-local"}
					.value=${typeof value === "string" ? value : ""}
					@input=${(e: Event) => {
						const raw = (e.target as HTMLInputElement).value;
						this._set(name, raw === "" ? undefined : raw);
					}}
				/>`;
			case "select":
				return html`<select
					@change=${(e: Event) =>
						this._set(name, (e.target as HTMLSelectElement).value)}
				>
					${input.options!.map(
						(option) =>
							html`<option
								value=${option}
								?selected=${String(value) === option}
							>
								${option}
							</option>`
					)}
				</select>`;
			default:
				return html`<input
					type="text"
					.value=${value === undefined || value === null ? "" : String(value)}
					@input=${(e: Event) =>
						this._set(name, (e.target as HTMLInputElement).value)}
				/>`;
		}
	}

	private _output(
		message: MessageLike,
		variants: VariantRow[],
		locale: string,
		values: Record<string, unknown>,
		label?: string
	) {
		const variant = selectVariant({
			message,
			variants,
			declarations: this.declarations,
			values,
			locale,
		});
		const parts = variant
			? formatPattern({
					pattern: variant.pattern,
					declarations: this.declarations,
					values,
					locale,
				})
			: [];
		const items: RenderItem[] = parts;
		const body = variant
			? parts.length
				? renderParts(items, { unknownMarkers: false })
				: html`<span class="none">Empty</span>`
			: html`<span class="none">No form matches these values</span>`;
		return {
			variant,
			template: html`<p class="output" part="output" lang=${locale}>
				${label ? html`<span class="lang">${label}</span>` : nothing}
				<span class="text">${body}</span>
			</p>`,
		};
	}

	override render() {
		const inputs = this._inputs();
		const values = this.currentValues;
		const target = this.message
			? this._output(
					this.message,
					this._variants,
					this._locale,
					values,
					this.reference ? languageName(this._locale) : undefined
				)
			: undefined;
		const reference = this.reference
			? this._output(
					this.reference.message,
					this._referenceVariants,
					this.reference.locale,
					values,
					languageName(this.reference.locale)
				)
			: undefined;
		const formLabel =
			target?.variant && (this.message?.selectors.length ?? 0) > 0
				? (this.message?.selectors ?? [])
						.map(({ name }) => {
							const match = target.variant!.matches.find((m) => m.key === name);
							return match?.type === "literal-match"
								? match.value
								: `any ${resolveInputVariable(name, this.declarations)}`;
						})
						.join(" · ")
				: undefined;
		return html`
			${this.heading ? html`<p class="heading">${this.heading}</p>` : nothing}
			${inputs.length
				? html`<div class="inputs" part="inputs">
						${inputs.map(
							(input) =>
								html`<label
									><span title=${input.name}>${input.name}</span>${this._input(
										input,
										values[input.name]
									)}</label
								>`
						)}
					</div>`
				: nothing}
			<div class="outputs" aria-live="polite">
				${reference?.template ?? nothing} ${target?.template ?? nothing}
			</div>
			${formLabel
				? html`<p class="form" part="form">Form: ${formLabel}</p>`
				: nothing}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-message-preview": InlangMessagePreview;
	}
	interface HTMLElementEventMap {
		"values-change": CustomEvent<ValuesChangeEventDetail>;
		"variant-match": CustomEvent<VariantMatchEventDetail>;
	}
}

/** A readable sample for a text input: a name for name-like variables, else the variable name. */
function sampleText(name: string): string {
	if (/name|user|actor|author|sender|recipient|person|member|owner/i.test(name))
		return "Alex";
	return name;
}
