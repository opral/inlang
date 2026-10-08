import { type VariantRow, type Declaration } from "@inlang/sdk";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { baseStyling } from "../../styling/base.js";

//helpers
import overridePrimitiveColors from "../../helper/overridePrimitiveColors.js";
import { createChangeEvent } from "../../helper/event.js";

import { selectorMatches } from "../../helper/selectorMatches.js";

//components
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js";

import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js";
import SlMenu from "@shoelace-style/shoelace/dist/components/menu/menu.component.js";
import SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.component.js";
if (!customElements.get("sl-dropdown")) customElements.define("sl-dropdown", SlDropdown);
if (!customElements.get("sl-menu")) customElements.define("sl-menu", SlMenu);
if (!customElements.get("sl-menu-item")) customElements.define("sl-menu-item", SlMenuItem);

if (!customElements.get("sl-input")) customElements.define("sl-input", SlInput);
if (!customElements.get("sl-tooltip"))
  customElements.define("sl-tooltip", SlTooltip);
if (!customElements.get("sl-button"))
  customElements.define("sl-button", SlButton);

@customElement("inlang-variant")
export default class InlangVariant extends LitElement {
  static override styles = [
    baseStyling,
    css`
      div {
        box-sizing: border-box;
        font-size: 14px;
      }
      :host {
        border-top: 1px solid var(--sl-input-border-color) !important;
        direction: ltr;
      }
      :host(:first-child) {
        border-top: none !important;
      }
      .variant {
        position: relative;
        min-height: 44px;
        width: 100%;
        display: flex;
        align-items: stretch;
      }
      .match-cell { width: 120px; flex-shrink: 0; position: relative; }
      .match-cell:focus-within { z-index: 3; }
      .match-cell .match { width: 100%; }
      .match-menu { max-height: 280px; max-width: min(360px, calc(100vw - 32px)); overflow-y: auto; }
      .match-type { padding: 8px 12px; color: var(--sl-color-neutral-500); font-size: 12px; }
      .match-example { margin-left: 16px; color: var(--sl-color-neutral-500); font-size: 12px; }
      .match-error { padding: 4px 8px; color: var(--sl-color-danger-600); font-size: 12px; }
      .suggestion-trigger { border: none; background: transparent; color: inherit; padding: 0 4px; min-height: 24px; cursor: pointer; }
      .match {
        min-height: 44px;
        width: 120px;
        background-color: var(--sl-input-background-color);
        border-right: 1px solid var(--sl-input-border-color);
        position: relative;
        z-index: 0;
      }
      .match:focus-within {
        z-index: 3;
      }
      .match::part(form-control-label) { display: none; }
      .match::part(base) {
        border: none;
        border-radius: 0;
        min-height: 44px;
        color: var(--sl-input-color);
      }
      .match::part(input) {
        min-height: 44px;
        background-color: var(--sl-input-background-color);
      }
      .match::part(input):hover {
        background-color: var(--sl-input-background-color-hover);
      }
      .variant {
        position: relative;
        z-index: 0;
      }
      .variant:focus-within {
        z-index: 3;
      }
      .actions {
        position: absolute;
        top: 0;
        right: 0;
        height: 44px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding-right: 12px;
        z-index: 1;
      }
      .add-selector::part(base) {
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }
      sl-button::part(base) {
        color: var(--sl-input-color);
        background-color: var(--sl-input-background-color);
        border: 1px solid var(--sl-input-border-color);
      }
      sl-button::part(base):hover {
        color: var(--sl-input-color-hover);
        background-color: var(--sl-input-background-color-hover);
        border: 1px solid var(--sl-input-border-color-hover);
      }
      .history-button {
        position: relative;
        z-index: 0;
      }
    `,
  ];

  @property()
  variant: VariantRow;

  /** Optional context; nested consumers inherit it from their bundle/message. */
  @property({ attribute: false }) declarations?: Declaration[];
  @property() locale?: string;
  @property({ attribute: false }) variants?: VariantRow[];
  @state() private errors: Record<string, string> = {};

  private _options(name: string) {
    return selectorMatches(name,
      this.declarations ?? (this.closest("inlang-bundle") as (HTMLElement & { bundle?: { declarations: Declaration[] } }) | null)?.bundle?.declarations ?? [],
      this.locale ?? (this.closest("inlang-message") as (HTMLElement & { message?: { locale: string } }) | null)?.message?.locale ?? "",
      this.variants ?? (this.closest("inlang-message") as (HTMLElement & { variants?: VariantRow[] }) | null)?.variants ?? []);
  }

  private _updateMatch = (selectorName: string, value: string) => {
    const options = this._options(selectorName);
    if (options.allowed && !options.allowed.includes(value)) {
      this.errors = { ...this.errors, [selectorName]: `Choose ${options.allowed.join(", ")}.` };
      return;
    }
    this.errors = { ...this.errors, [selectorName]: "" };
    const existing = this.variant?.matches.find(match => match.key === selectorName);
    if (existing && (existing.type === "catchall-match" ? "*" : existing.value) === value) return;
    if (this.variant) {
      const newVariant = structuredClone(this.variant);

      // filter the match if it already exists
      const matches = newVariant.matches.filter((m) => m.key !== selectorName);

      // update the match with value (mutates variant)
      if (value === "*") {
        matches.push({
          type: "catchall-match",
          key: selectorName,
        });
      } else {
        matches.push({
          type: "literal-match",
          key: selectorName,
          value,
        });
      }

      this.dispatchEvent(
        createChangeEvent({
          entityId: this.variant.id,
          entity: "variant",
          newData: {
            ...newVariant,
            matches,
          },
        })
      );
    }
  };

  //hooks
  override async firstUpdated() {
    await this.updateComplete;

    //get all sl-inputs and set the color to the inlang colors
    overridePrimitiveColors();
    await this._syncMatchInputDirections();
  }

  override updated() {
    void this._syncMatchInputDirections();
  }

  private async _syncMatchInputDirections() {
    const inputs = Array.from(
      this.shadowRoot?.querySelectorAll<SlInput>(".match") ?? []
    );

    await Promise.all(inputs.map((input) => input.updateComplete));

    for (const input of inputs) {
      input.input?.setAttribute("dir", "auto");
    }
  }

  override render() {
    return this.variant
      ? html`<div class="variant">
          ${this.variant
            ? this.variant.matches.map((match) => {
                const options = this._options(match.key);
                return html`<div class="match-cell">
                  <sl-input
                    exportparts="input:match"
                    id="${this.variant.id}-${match.key}"
                    class="match"
                    size="small"
                    label=${`Match ${match.key}`}
                    title=${options.label}
                    aria-invalid=${this.errors[match.key] ? "true" : "false"}
                    dir="auto"
                    value=${match.type === "literal-match" ? match.value : "*"}
                    @sl-blur=${(e: Event) => {
											const element = this.shadowRoot?.getElementById(
												`${this.variant.id}-${match.key}`
											);
                      if (element && e.target === element) {
                        this._updateMatch(
                          match.key,
                          (e.target as HTMLInputElement).value
                        );
                      }
                    }}
                  ><sl-dropdown part="match-options" slot="suffix" placement="bottom-start" hoist>
                    <button slot="trigger" class="suggestion-trigger" type="button" aria-label=${`Match options for ${match.key}`}>⌄</button>
                    <sl-menu class="match-menu" @sl-select=${(event: CustomEvent) => {
                      const value = event.detail.item.value as string;
                      const input = this.shadowRoot?.getElementById(`${this.variant.id}-${match.key}`) as SlInput;
                      if (input) input.value = value;
                      this._updateMatch(match.key, value);
                    }}>
                      <div class="match-type">${options.label}</div>
                      ${options.suggestions.map(option => html`<sl-menu-item value=${option.value}>${option.value}<span slot="suffix" class="match-example">${option.description}</span></sl-menu-item>`)}
                    </sl-menu>
                  </sl-dropdown></sl-input>
                  ${this.errors[match.key] ? html`<div class="match-error" role="alert">${this.errors[match.key]}</div>` : undefined}
                </div>
                `;
              })
            : undefined}

          <slot name="pattern-editor" class="pattern-editor"></slot>
          <div class="actions">
            <slot name="variant-action"></slot>
          </div>
        </div>`
      : undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "inlang-variant": InlangVariant;
  }
}
