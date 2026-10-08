import type { Declaration, Message, Variant } from "@inlang/sdk";
import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { tokens } from "../../styling/tokens.js";
import {
	isNumericKey,
	literalKeys,
	matchFor,
	matchValue,
	resolveInputName,
	selectorPluralResolver,
	type Match,
	type PluralResolver,
} from "../../helper/declarations.js";
import { requiredForms } from "../../helper/requiredForms.js";
import { pluralExamples } from "../../helper/pluralExamples.js";
import { languageName } from "../../helper/languageName.js";
import patternToString from "../../helper/patternToString.js";
import "../pattern-view/inlang-pattern-view.js";

type SelectorInfo = {
	name: string;
	/** Display name: the input variable a selector reads from ("count" for "countPlural"). */
	label: string;
	plural?: PluralResolver;
	keys: string[];
	examples: Record<string, string>;
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
 * Required forms (see `requiredForms`) without a variant render as
 * "+ Add form" buttons. Narrow containers scroll horizontally with a sticky
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
 * @csspart form-missing - An add-form button.
 */
@customElement("inlang-message-forms")
export default class InlangMessageForms extends LitElement {
	static override styles = [
		tokens,
		css`
			:host {
				display: block;
				font-size: 13px;
				line-height: 1.45;
			}
			:host([hidden]) {
				display: none;
			}
			.caption {
				margin: 0 0 6px;
				font-size: 12px;
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
				min-height: 36px;
				border: 0;
				background: var(--_surface);
				border-radius: 6px;
				padding: 8px 10px;
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
				font-size: 12px;
				color: var(--_text-muted);
			}
			.label small,
			th small {
				display: block;
				font-size: 11px;
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
				min-height: 32px;
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
				font-size: 11px;
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
				font-size: 12px;
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
				font-size: 11px;
				font-weight: 400;
				color: var(--_text-subtle);
			}
			tbody th {
				position: sticky;
				left: 0;
				z-index: 1;
				background: var(--_surface);
				padding: 10px 10px 8px;
				font-size: 12px;
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
	message?: Message & { variants?: Variant[] };

	@property({ type: Array })
	variants?: Variant[];

	@property({ type: Array })
	declarations: Declaration[] = [];

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

	private get _variants(): Variant[] {
		return this.variants ?? this.message?.variants ?? [];
	}

	private get _locale(): string {
		return this.locale ?? this.message?.locale ?? "en";
	}

	private _selectorInfo(name: string): SelectorInfo {
		const variants = this._variants;
		const used = literalKeys(name, variants);
		const plural = selectorPluralResolver(
			name,
			this.declarations,
			this._locale
		);
		const label = resolveInputName(name, this.declarations) ?? name;
		if (plural) {
			const numbers = used
				.filter(isNumericKey)
				.sort((a, b) => Number(a) - Number(b));
			const others = used.filter(
				(key) => !isNumericKey(key) && !plural.categories.includes(key)
			);
			return {
				name,
				label,
				plural,
				// The catch-all is the "other" form; an explicit "other" variant is shown if present.
				keys: [
					...numbers,
					...plural.categories.filter((category) => category !== "other"),
					...(used.includes("other") ? ["other"] : []),
					...others,
					"*",
				],
				examples: pluralExamples(this._locale, plural.type),
			};
		}
		return { name, label, keys: [...used, "*"], examples: {} };
	}

	private _find(combination: Record<string, string>): Variant | undefined {
		const names = Object.keys(combination);
		return this._variants.find((variant) =>
			names.every(
				(name) => matchValue(matchFor(variant, name)) === combination[name]
			)
		);
	}

	private _toMatches(combination: Record<string, string>): Match[] {
		return (this.message?.selectors ?? []).map(({ name }) =>
			combination[name] === "*" || combination[name] === undefined
				? { type: "catchall-match", key: name }
				: { type: "literal-match", key: name, value: combination[name]! }
		);
	}

	private _required(): Set<string> {
		if (!this.message) return new Set();
		return new Set(
			requiredForms(
				this.message,
				this.declarations,
				this._locale,
				this._variants
			).map((form) => JSON.stringify(form.map(matchValue)))
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
		const key = JSON.stringify(
			(this.message?.selectors ?? []).map(
				({ name }) => combination[name] ?? "*"
			)
		);
		const isRequired = required.has(key);
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
				for (const { name } of (this.message?.selectors ?? []).slice(0, -2)) {
					active[name] = matchValue(matchFor(selected, name));
				}
				this._active = active;
			}
		}
	}

	override render() {
		const selectors = this.message?.selectors ?? [];
		const infos = selectors.map(({ name }) => this._selectorInfo(name));
		const required = this._required();
		const caption = this._caption(infos);
		const hasCaptionSlot = !!this.querySelector(":scope > [slot=caption]");
		const captionTemplate = html`<p
			class="caption"
			part="caption"
			?hidden=${!caption && !hasCaptionSlot}
		>
			<slot name="caption">${caption}</slot>
		</p>`;

		if (infos.length === 0) {
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
								{ [info.name]: key },
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
		const fixed: Record<string, string> = {};
		for (const info of leading) {
			const active = this._active[info.name];
			fixed[info.name] =
				active !== undefined && info.keys.includes(active)
					? active
					: info.keys[0]!;
		}

		return html`${captionTemplate}
			${leading.map((info) => this._tabs(info, fixed, required, infos))}
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
													...fixed,
													[rowInfo.name]: rowKey,
													[columnInfo.name]: columnKey,
												},
												required,
												[
													...leading.map((info) =>
														this._keyLabel(info, fixed[info.name]!)
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
		fixed: Record<string, string>,
		required: Set<string>,
		infos: SelectorInfo[]
	) {
		return html`<div>
			<span class="tabs-label" id=${`tabs-${info.name}`}>${info.label}</span>
			<div
				class="tabs"
				part="tabs"
				role="group"
				aria-labelledby=${`tabs-${info.name}`}
			>
				${info.keys.map((key) => {
					const missing = [...required].filter((form) => {
						const values = JSON.parse(form) as string[];
						const index = infos.indexOf(info);
						if (values[index] !== key) return false;
						const combination: Record<string, string> = {};
						infos.forEach((other, i) => (combination[other.name] = values[i]!));
						for (const leading of infos.slice(0, -2)) {
							if (
								leading !== info &&
								combination[leading.name] !== fixed[leading.name]
							)
								return false;
						}
						return !this._find(combination);
					}).length;
					return html`<button
						type="button"
						aria-pressed=${fixed[info.name] === key ? "true" : "false"}
						@click=${() =>
							(this._active = { ...this._active, [info.name]: key })}
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
