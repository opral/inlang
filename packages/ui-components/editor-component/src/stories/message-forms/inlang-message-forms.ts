import type { Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import {
	isNumericKey,
	matchValue,
	missingVariants,
	selectorGroups,
} from "@inlang/sdk/browser";
import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tokens } from "../../styling/tokens.js";
import type { Match } from "../../helper/declarations.js";
import { pluralExamples } from "../../helper/pluralExamples.js";
import { languageName } from "../../helper/languageName.js";
import patternToString from "../../helper/patternToString.js";
import "../pattern-view/inlang-pattern-view.js";

type SelectorInfo = {
	/** The selector names behind this choice: two for an exact number + plural category of one input. */
	names: string[];
	/** Display name: the input variable a selector reads from ("count" for "countPlural"). */
	label: string;
	plural?: { type: "cardinal" | "ordinal"; categories: string[] };
	keys: string[];
	examples: Record<string, string>;
	values(key: string): Record<string, string>;
	keyOf(variant: Pick<VariantRow, "matches">): string;
};

export type SelectVariantEventDetail = { variantId: string };
export type AddVariantEventDetail = { matches: Match[] };

/**
 * Compact overview of a message's variants ("forms") for picking one.
 *
 * - no selector: a single row
 * - 1 selector: a vertical list (match label, example numbers for plural
 *   categories, the variant's pattern)
 * - 2 selectors: a grid; rows are the first selector's keys ("any other" for
 *   `*`), columns the second selector's keys with plural examples in the header
 * - 3+ selectors: segmented tabs for each extra leading selector, a grid for
 *   the last two
 *
 * An exact number next to a plural category of the same input (ICU
 * `=0 {…} one {…} other {…}`, two selectors in the model) is shown as ONE
 * choice, see `selectorGroups` of `@inlang/sdk`.
 *
 * Forms the locale needs (`missingVariants` of `@inlang/sdk`, the rule behind
 * the `missing-variant` check) render as "+ Add form" buttons, other empty
 * combinations as a quiet "+ Add". Narrow containers scroll horizontally with a sticky
 * first column.
 *
 * @fires select-variant - `{ variantId }` when a form is clicked.
 * @fires add-variant - `{ matches }` when a missing form is clicked.
 * @slot caption - Replaces the one-line caption.
 * @csspart caption
 * @csspart list - The list (one selector).
 * @csspart table - The grid table (two or more selectors).
 * @csspart tabs - A segmented control for a leading selector.
 * @csspart form - A form button.
 * @csspart form-selected - The selected form button.
 * @cssprop --inlang-forms-row-min-height - Min. height of a form row (default 36px).
 * @cssprop --inlang-forms-row-padding - Padding of a form row (default 8px 10px).
 * @cssprop --inlang-control-height - Min. height of the segmented tabs (default 32px).
 * @cssprop --inlang-radius-small - Corner radius of form rows (default 6px).
 * @cssprop --inlang-font-size - Base text size (default 13px).
 * @cssprop --inlang-font-size-small - Caption and labels (default 12px).
 * @cssprop --inlang-font-size-caption - Example numbers (default 11px).
 * @csspart form-missing - An add-form button.
 */
@customElement("inlang-message-forms")
export default class InlangMessageForms extends LitElement {
	static override styles = [
		tokens,
		css`
			:host {
				display: block;
				font-size: var(--_font-size);
				line-height: 1.45;
			}
			:host([hidden]) {
				display: none;
			}
			.caption {
				margin: 0 0 6px;
				font-size: var(--_font-size-small);
				color: var(--_text-subtle);
			}
			button {
				font: inherit;
				color: inherit;
				cursor: pointer;
			}
			button:focus-visible {
				outline: 2px solid var(--_accent);
				outline-offset: -2px;
			}
			.form {
				display: block;
				width: 100%;
				min-height: var(--inlang-forms-row-min-height, 36px);
				border: 0;
				background: var(--_surface);
				border-radius: var(--_radius-small);
				padding: var(--inlang-forms-row-padding, 8px 10px);
				text-align: left;
				color: var(--_text-muted);
			}
			.form:hover {
				background: var(--_hover);
			}
			.form[aria-pressed="true"] {
				outline: 1.5px solid var(--_accent);
				outline-offset: -1.5px;
				background: var(--_accent-soft);
				color: var(--_text);
			}
			.form.missing {
				color: var(--_warning);
				font-weight: 500;
			}
			.form.optional {
				color: var(--_text-subtle);
			}
			.empty {
				color: var(--_text-subtle);
				font-style: italic;
			}
			.label {
				font-size: var(--_font-size-small);
				color: var(--_text-muted);
			}
			.label small,
			th small {
				display: block;
				font-size: var(--_font-size-caption);
				font-weight: 400;
				color: var(--_text-subtle);
			}
			/* one selector */
			.list {
				display: flex;
				flex-direction: column;
				gap: 2px;
			}
			.list .form {
				display: grid;
				grid-template-columns: var(--inlang-forms-label-width, 96px) minmax(
						0,
						1fr
					);
				gap: 10px;
				align-items: baseline;
			}
			/* tabs */
			.tabs {
				display: inline-flex;
				flex-wrap: wrap;
				border: 1px solid var(--_border-strong);
				border-radius: var(--_radius);
				overflow: hidden;
				background: var(--_surface);
				margin: 0 0 8px;
			}
			.tabs button {
				border: 0;
				background: var(--_surface);
				padding: 0 12px;
				min-height: var(--inlang-control-height, 32px);
				color: var(--_text-muted);
			}
			.tabs button + button {
				border-left: 1px solid var(--_border);
			}
			.tabs button[aria-pressed="true"] {
				background: var(--_hover);
				color: var(--_text);
				font-weight: 500;
			}
			.tabs .count {
				margin-left: 6px;
				color: var(--_warning);
				font-variant-numeric: tabular-nums;
			}
			.tabs-label {
				display: block;
				font-size: var(--_font-size-caption);
				color: var(--_text-subtle);
				margin-bottom: 4px;
			}
			/* grid */
			.scroll {
				overflow-x: auto;
			}
			table {
				border-collapse: separate;
				border-spacing: 0;
				width: 100%;
				table-layout: fixed;
			}
			th,
			td {
				padding: 2px;
				border-top: 1px solid var(--_hover);
				text-align: left;
				vertical-align: top;
			}
			thead th {
				border-top: 0;
				padding: 0 10px 6px;
				font-size: var(--_font-size-small);
				font-weight: 600;
				color: var(--_text-muted);
				vertical-align: bottom;
			}
			thead th.corner {
				position: sticky;
				left: 0;
				z-index: 1;
				background: var(--_surface);
			}
			.form {
				overflow: hidden;
			}
			inlang-pattern-view::part(variable) {
				white-space: normal;
				overflow-wrap: anywhere;
			}
			thead th.corner span {
				display: block;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			thead th.corner {
				font-size: var(--_font-size-caption);
				font-weight: 400;
				color: var(--_text-subtle);
			}
			tbody th {
				position: sticky;
				left: 0;
				z-index: 1;
				background: var(--_surface);
				padding: 10px 10px 8px;
				font-size: var(--_font-size-small);
				font-weight: 400;
				color: var(--_text-muted);
			}
			col.rowhead {
				width: var(--inlang-forms-label-width, 96px);
			}
		`,
	];

	/** The message (selectors). A nested message's `variants` are used when `variants` is not set. */
	@property({ type: Object })
	message?: MessageRow & { variants?: VariantRow[] };

	@property({ type: Array })
	variants?: VariantRow[];

	@property({ type: Array })
	declarations: Declaration[] = [];

	/**
	 * Variants of the reference language. Their literal keys of select selectors
	 * (e.g. female / male) are also required in this locale, so a translation that
	 * has no variants yet is asked for the same forms as the source.
	 */
	@property({ type: Array, attribute: false })
	referenceVariants?: VariantRow[];

	/** Defaults to `message.locale`. */
	@property({ type: String })
	locale?: string;

	@property({ type: String, attribute: "selected-variant-id" })
	selectedVariantId?: string;

	/** One-line caption. Defaults to e.g. "Russian uses 4 plural forms. The numbers are examples."; "" hides it. */
	@property({ type: String })
	caption?: string;

	/** Active key per leading selector (3+ selectors). */
	@state()
	private _active: Record<string, string> = {};

	private get _variants(): VariantRow[] {
		return this.variants ?? this.message?.variants ?? [];
	}

	private get _locale(): string {
		return this.locale ?? this.message?.locale ?? "en";
	}

	private get _message() {
		return this.message ? { ...this.message, locale: this._locale } : undefined;
	}

	private get _options() {
		return {
			variants: this._variants,
			referenceVariants: this.referenceVariants,
		};
	}

	private _infos(): SelectorInfo[] {
		if (!this._message) return [];
		return selectorGroups(this._message, this.declarations, this._options).map(
			(group) => ({
				names: group.names,
				label: group.input,
				plural: group.plural,
				keys: group.keys,
				values: group.values,
				keyOf: group.keyOf,
				examples: group.plural
					? pluralExamples(this._locale, group.plural.type)
					: {},
			})
		);
	}

	private _find(combination: Record<string, string>): VariantRow | undefined {
		const names = Object.keys(combination);
		return this._variants.find((variant) =>
			names.every((name) => matchValue(variant, name) === combination[name])
		);
	}

	/** The match values of the selected keys of several choices. */
	private _combination(
		keys: Iterable<[SelectorInfo, string]>
	): Record<string, string> {
		const combination: Record<string, string> = {};
		for (const [info, key] of keys)
			Object.assign(combination, info.values(key));
		return combination;
	}

	private _toMatches(combination: Record<string, string>): Match[] {
		return (this.message?.selectors ?? []).map(({ name }) =>
			combination[name] === "*" || combination[name] === undefined
				? { type: "catchall-match", key: name }
				: { type: "literal-match", key: name, value: combination[name]! }
		);
	}

	/** The forms the locale needs that no variant covers (as in the `missing-variant` check). */
	private _missing(): Match[][] {
		if (!this._message) return [];
		return missingVariants(this._message, this.declarations, this._options);
	}

	private _formKey(values: (selector: string) => string): string {
		return JSON.stringify(
			(this.message?.selectors ?? []).map(({ name }) => values(name))
		);
	}

	private _keyLabel(info: SelectorInfo, key: string): string {
		if (key === "*") return info.plural ? "other" : "any other";
		return key;
	}

	private _keyHint(info: SelectorInfo, key: string): string | undefined {
		if (!info.plural) return undefined;
		if (isNumericKey(key)) return "exactly";
		return info.examples[key === "*" ? "other" : key];
	}

	private _emit(
		name: string,
		detail: SelectVariantEventDetail | AddVariantEventDetail
	) {
		this.dispatchEvent(
			new CustomEvent(name, { detail, bubbles: true, composed: true })
		);
	}

	private _cell(
		combination: Record<string, string>,
		required: Set<string>,
		labels: string[],
		prefix?: TemplateResult
	): TemplateResult {
		const variant = this._find(combination);
		const description = labels.join(" · ");
		if (variant) {
			const selected = variant.id === this.selectedVariantId;
			const isEmpty = variant.pattern.every(
				(part) => part.type === "text" && part.value.trim() === ""
			);
			return html`<button
				type="button"
				class="form"
				part=${selected ? "form form-selected" : "form"}
				aria-pressed=${selected ? "true" : "false"}
				aria-label=${`${description}: ${isEmpty ? "empty" : patternToString({ pattern: variant.pattern })}`}
				@click=${() => this._emit("select-variant", { variantId: variant.id })}
			>
				${prefix ?? nothing}${isEmpty
					? html`<span class="empty">Empty</span>`
					: html`<inlang-pattern-view
							.pattern=${variant.pattern}
							.declarations=${this.declarations}
						></inlang-pattern-view>`}
			</button>`;
		}
		const isRequired = required.has(
			this._formKey((name) => combination[name] ?? "*")
		);
		return html`<button
			type="button"
			class=${isRequired ? "form missing" : "form optional"}
			part="form form-missing"
			aria-label=${`Add form ${description}`}
			@click=${() =>
				this._emit("add-variant", { matches: this._toMatches(combination) })}
		>
			${prefix ?? nothing}<span>${isRequired ? "+ Add form" : "+ Add"}</span>
		</button>`;
	}

	private _caption(infos: SelectorInfo[]): string {
		if (this.caption !== undefined) return this.caption;
		const plural = infos.find((info) => info.plural)?.plural;
		if (!plural) return "";
		const count = plural.categories.length;
		const kind = plural.type === "ordinal" ? "ordinal" : "plural";
		return `${languageName(this._locale)} uses ${count} ${kind} form${count === 1 ? "" : "s"}. The numbers are examples.`;
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (
			changed.has("selectedVariantId") ||
			changed.has("message") ||
			changed.has("variants")
		) {
			const selected = this._variants.find(
				(v) => v.id === this.selectedVariantId
			);
			if (selected) {
				const active = { ...this._active };
				for (const info of this._infos().slice(0, -2)) {
					active[info.names[0]!] = info.keyOf(selected);
				}
				this._active = active;
			}
		}
	}

	override render() {
		const selectors = this.message?.selectors ?? [];
		const infos = this._infos();
		const missing = this._missing();
		const required = new Set(
			missing.map((form) =>
				this._formKey((name) => matchValue({ matches: form }, name))
			)
		);
		const caption = this._caption(infos);
		const hasCaptionSlot = !!this.querySelector(":scope > [slot=caption]");
		const captionTemplate = html`<p
			class="caption"
			part="caption"
			?hidden=${!caption && !hasCaptionSlot}
		>
			<slot name="caption">${caption}</slot>
		</p>`;

		if (selectors.length === 0) {
			return html`${captionTemplate}
				<div class="list" part="list">
					${this._cell({}, required, ["Default"])}
				</div>`;
		}

		if (infos.length === 1) {
			const info = infos[0]!;
			return html`${captionTemplate}
				<div
					class="list"
					part="list"
					role="list"
					aria-label=${`Forms by ${info.label}`}
				>
					${info.keys.map((key) => {
						const hint = this._keyHint(info, key);
						const label = html`<span class="label"
							>${this._keyLabel(info, key)}${hint
								? html`<small>${hint}</small>`
								: nothing}</span
						>`;
						return html`<div role="listitem">
							${this._cell(
								info.values(key),
								required,
								[this._keyLabel(info, key)],
								label
							)}
						</div>`;
					})}
				</div>`;
		}

		const leading = infos.slice(0, -2);
		const rowInfo = infos[infos.length - 2]!;
		const columnInfo = infos[infos.length - 1]!;
		const fixed = new Map<SelectorInfo, string>();
		for (const info of leading) {
			const active = this._active[info.names[0]!];
			fixed.set(
				info,
				active !== undefined && info.keys.includes(active)
					? active
					: info.keys[0]!
			);
		}
		const fixedCombination = this._combination(fixed);

		return html`${captionTemplate}
			${leading.map((info) => this._tabs(info, fixed, missing, infos))}
			<div class="scroll">
				<table
					part="table"
					aria-label=${`Forms by ${rowInfo.label} and ${columnInfo.label}`}
					style=${`min-width: calc(var(--inlang-forms-label-width, 96px) + ${columnInfo.keys.length} * var(--inlang-forms-column-min-width, 120px))`}
				>
					<colgroup>
						<col class="rowhead" />
						${columnInfo.keys.map(() => html`<col />`)}
					</colgroup>
					<thead>
						<tr>
							<th class="corner" scope="col">
								<span title=${rowInfo.label}>${rowInfo.label} ↓</span>
								<span title=${columnInfo.label}>${columnInfo.label} →</span>
							</th>
							${columnInfo.keys.map((key) => {
								const hint = this._keyHint(columnInfo, key);
								return html`<th scope="col">
									${this._keyLabel(columnInfo, key)}${hint
										? html`<small>${hint}</small>`
										: nothing}
								</th>`;
							})}
						</tr>
					</thead>
					<tbody>
						${rowInfo.keys.map((rowKey) => {
							const rowHint = this._keyHint(rowInfo, rowKey);
							return html`<tr>
								<th scope="row">
									${this._keyLabel(rowInfo, rowKey)}${rowHint
										? html`<small>${rowHint}</small>`
										: nothing}
								</th>
								${columnInfo.keys.map(
									(columnKey) =>
										html`<td>
											${this._cell(
												{
													...fixedCombination,
													...rowInfo.values(rowKey),
													...columnInfo.values(columnKey),
												},
												required,
												[
													...leading.map((info) =>
														this._keyLabel(info, fixed.get(info)!)
													),
													this._keyLabel(rowInfo, rowKey),
													this._keyLabel(columnInfo, columnKey),
												]
											)}
										</td>`
								)}
							</tr>`;
						})}
					</tbody>
				</table>
			</div>`;
	}

	private _tabs(
		info: SelectorInfo,
		fixed: Map<SelectorInfo, string>,
		missingForms: Match[][],
		infos: SelectorInfo[]
	) {
		const id = info.names[0]!;
		return html`<div>
			<span class="tabs-label" id=${`tabs-${id}`}>${info.label}</span>
			<div
				class="tabs"
				part="tabs"
				role="group"
				aria-labelledby=${`tabs-${id}`}
			>
				${info.keys.map((key) => {
					const missing = missingForms.filter(
						(form) =>
							info.keyOf({ matches: form }) === key &&
							infos
								.slice(0, -2)
								.every(
									(leading) =>
										leading === info ||
										leading.keyOf({ matches: form }) === fixed.get(leading)
								)
					).length;
					return html`<button
						type="button"
						aria-pressed=${fixed.get(info) === key ? "true" : "false"}
						@click=${() => (this._active = { ...this._active, [id]: key })}
					>
						${this._keyLabel(info, key)}${missing
							? html`<span
									class="count"
									title=${`${missing} missing`}
									aria-label=${`, ${missing} missing`}
									>${missing}</span
								>`
							: nothing}
					</button>`;
				})}
			</div>
		</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"inlang-message-forms": InlangMessageForms;
	}
	interface HTMLElementEventMap {
		"select-variant": CustomEvent<SelectVariantEventDetail>;
		"add-variant": CustomEvent<AddVariantEventDetail>;
	}
}
