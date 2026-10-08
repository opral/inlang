import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { selectorMatches } from "../../../helper/selectorMatches.js";
import { createChangeEvent } from "../../../helper/event.js";
import { baseStyling } from "../../../styling/base.js";
import {
	type MessageRow,
	type BundleRow,
	type VariantRow,
	Declaration,
	type Match,
} from "@inlang/sdk";
import { v7 } from "uuid";

import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js";
import SlSelect from "@shoelace-style/shoelace/dist/components/select/select.component.js";
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js";
import SlOption from "@shoelace-style/shoelace/dist/components/option/option.component.js";
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js";
import SlTooltip from "@shoelace-style/shoelace/dist/components/tooltip/tooltip.component.js";

if (!customElements.get("sl-dropdown"))
  customElements.define("sl-dropdown", SlDropdown);
if (!customElements.get("sl-select"))
  customElements.define("sl-select", SlSelect);
if (!customElements.get("sl-input")) customElements.define("sl-input", SlInput);
if (!customElements.get("sl-option"))
  customElements.define("sl-option", SlOption);
if (!customElements.get("sl-button"))
  customElements.define("sl-button", SlButton);
if (!customElements.get("sl-tooltip"))
  customElements.define("sl-tooltip", SlTooltip);

@customElement("inlang-add-selector")
export default class InlangAddSelector extends LitElement {
  static override styles = [
    baseStyling,
    css`
      .button-wrapper {
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dropdown-container {
        font-size: 14px;
        width: full;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .dropdown-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--sl-input-color);
        font-size: 12px;
      }
      .dropdown-title {
        font-size: 14px;
        font-weight: 500;
        margin: 6px 0;
      }
      .add-input::part(base) {
        color: var(--sl-color-neutral-500);
      }
      .add-input::part(base):hover {
        background-color: var(--sl-input-background-color-hover);
        color: var(--sl-input-color-hover);
      }
      sl-select::part(form-control-label) {
        font-size: 14px;
      }
      sl-select::part(display-input) {
        font-size: 14px;
      }
      sl-option::part(label) {
        font-size: 14px;
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
      .options-title {
        font-size: 14px;
        color: var(--sl-input-color);
        background-color: var(--sl-input-background-color);
        margin: 0;
        padding-bottom: 4px;
      }
      .options-wrapper {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .option {
        width: 100%;
      }
      .option::part(base) {
        background-color: var(--sl-input-background-color-hover);
        border-radius: var(--sl-input-border-radius-small);
      }
      .option {
        width: 100%;
        background-color: var(--sl-input-background-color-hover);
      }
      .delete-icon {
        color: var(--sl-color-neutral-400);
        cursor: pointer;
      }
      .delete-icon:hover {
        color: var(--sl-input-color-hover);
      }
      .help-text {
        display: flex;
        gap: 8px;
        color: var(--sl-input-help-text-color);
      }
      .help-text p {
        flex: 1;
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
      }
      .empty-image {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 12px;
      }
      .actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .actions.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      sl-input::part(base) {
        font-size: 14px;
      }
      .add-selector::part(base) {
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      .add-selector::part(base):hover {
        background-color: var(--sl-input-background-color-hover);
        color: var(--sl-input-color-hover);
        border: 1px solid var(--sl-input-border-color-hover);
      }
      .no-variable-available-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
        padding-top: 24px;
        background-color: var(--sl-input-background-color-hover);
        border: 1px solid var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-small);
        color: var(--sl-input-color);
      }
    `,
  ];

  @property()
  bundle: BundleRow;

  @property()
  message: MessageRow;

  @property()
  variants: VariantRow[];

  @state()
  private _variable: Declaration | undefined;

  @state()
  private _matchers: string[] | undefined;

  @state()
  private _oldDeclarations: Declaration[] | undefined;

  @state() private _matchError = "";

  private _getPluralCategories = (): string[] | undefined => {
    if (!this._variable || !this.message) return;
    return selectorMatches(this._variable.name, this.bundle.declarations, this.message.locale, this.variants).allowed;
  };

  private _getAvailablevariables = () => {
    const variables: Declaration[] = [];
    for (const declaration of this.bundle.declarations) {
      if (!variables.some((d) => d.name === declaration.name) && !this.message?.selectors.some(selector => selector.name === declaration.name)) {
        variables.push(declaration);
      }
    }
    return variables;
  };

  private _handleAddSelector = (newMatchers: string[]) => {
    if (this._variable && this.message) {
      if (this.message.selectors.some(selector => selector.name === this._variable!.name)) return;
      const allowed = this._getPluralCategories();
      if (allowed && newMatchers.some(value => !allowed.includes(value))) {
        this._matchError = `Choose ${allowed.join(", ")}.`;
        return;
      }
      this._matchError = "";
      // get variant matcher
      const message = structuredClone(this.message);
      const variants = structuredClone(this.variants);

      const _variantsMatcher = (message ? variants : [])?.map(
        (variant) => variant.matches
      );

      // Step 1 | add selector to message
      this._updateSelector();

      // Step 2 | add "*" to existing variants
      this._addMatchToExistingVariants();

      // Step 3 | get newCombinations and add new variants
      const newCombinations = this._generateNewMatcherCombinations({
        variantsMatcher: _variantsMatcher,
        newMatchers: newMatchers,
        newSelectorName: this._variable.name,
      });
      this._addVariantsFromNewCombinations(newCombinations);

      this.dispatchEvent(new CustomEvent("submit"));
    }
  };

  private _updateSelector = () => {
    if (this.message && this._variable) {
      this.message.selectors.push({
        type: "variable-reference",
        name: this._variable.name,
      });
      this.dispatchEvent(
        createChangeEvent({
          entityId: this.message.id,
          entity: "message",
          newData: this.message,
        })
      );
    }
  };

  private _addMatchToExistingVariants = () => {
    if (this.message && this._variable && this.variants) {
      for (const variant of this.variants) {
        const newVariant = structuredClone(variant);
        newVariant.matches.push({
          type: "catchall-match",
          key: this._variable.name,
        });
        this.dispatchEvent(
          createChangeEvent({
            entityId: newVariant.id,
            entity: "variant",
            newData: newVariant,
          })
        );
      }
    }
  };

  // TODO verify if this is needed from UX perspective.
  private _addVariantsFromNewCombinations = (newCombinations: Match[][]) => {
    if (this.message) {
      for (const combination of newCombinations) {
        const newVariant: VariantRow = {
					id: v7(),
					pattern: [],
					message_id: this.message.id,
					matches: combination,
				};

        this.dispatchEvent(
          createChangeEvent({
            entityId: newVariant.id,
            entity: "variant",
            newData: newVariant,
          })
        );
      }
    }
  };

  private _generateNewMatcherCombinations = (props: {
    variantsMatcher: Match[][];
    newMatchers: string[];
    newSelectorName: string;
  }): Match[][] => {
    const newMatchers = props.newMatchers.filter(
      (category) => category !== "*"
    );

    const newCombinations: Match[][] = [];
    // Loop over each variant matcher (current combinations)
    for (const variantMatcher of props.variantsMatcher) {
      // Now we generate new combinations by replacing the wildcard (*) with each new matcher
      for (const newMatch of newMatchers) {
        if (variantMatcher) {
          const newCombination = [
            ...variantMatcher,
            {
              type: "literal-match",
              key: props.newSelectorName,
              value: newMatch,
            },
          ] as Match[];

          newCombinations.push(newCombination);
        }
      }
    }
    return newCombinations;
  };

  override updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("bundle") &&
      JSON.stringify(this.bundle.declarations) !==
        JSON.stringify(this._oldDeclarations)
    ) {
      //check if bundle.declarations has changed
      this._oldDeclarations = this.bundle.declarations;
      this._variable = this._getAvailablevariables()?.[0];
    }
    if (changedProperties.has("message") && this.message?.selectors.some(selector => selector.name === this._variable?.name)) {
      this._variable = this._getAvailablevariables()[0];
    }
    if (changedProperties.has("message") || changedProperties.has("_variable")) {
      this._matchError = "";
      this._matchers = this._getPluralCategories() || ["*"];
    }
  }

  override async firstUpdated() {
    await this.updateComplete;
    this._variable = this._getAvailablevariables()?.[0];
    this._matchers = this._getPluralCategories() || ["*"];
  }

  override render() {
    return html`
			<div class="dropdown-container">${this._matchError ? html`<p role="alert" style="color: var(--sl-color-danger-600)">${this._matchError}</p>` : undefined}
				${
          this._variable && this._variable.name.length > 0
            ? html`<div class="dropdown-item">
					<div class="dropdown-header">
							<p class="dropdown-title">Input</p>
						</div>
						<sl-select
							@sl-change=${(e: CustomEvent) => {
                const inputElement = e.target as HTMLInputElement;
                this._variable = this._getAvailablevariables()?.find(
                  (input) => input.name === inputElement.value
                );
              }}
							size="medium"
							value=${this._variable.name || this._getAvailablevariables()?.[0]?.name}
						>
							${
                this._getAvailablevariables() &&
                this._getAvailablevariables().map((input) => {
                  return html`<sl-option value=${input.name}
                    >${input.name}</sl-option
                  >`;
                })
              }
						</sl-select>
					</div> 
				</div>`
            : html`<div class="dropdown-item">
                <div class="no-variable-available-card">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24px"
                    height="24px"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="currentColor"
                      fill-rule="evenodd"
                      d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10m-4.906-3.68L18.32 7.094A8 8 0 0 1 7.094 18.32M5.68 16.906A8 8 0 0 1 16.906 5.68z"
                    />
                  </svg>
                  <p>
                    No variable present. Add a new variable to create a
                    selector.
                  </p>
                </div>
              </div>`
        }
					${
            this._variable
              ? html`<div class="options-container">
                    <div class="dropdown-header">
                      <p class="dropdown-title">Match · ${selectorMatches(this._variable.name, this.bundle.declarations, this.message.locale, this.variants).label}</p>
                      <sl-tooltip content="Add a match to this selector">
                        <sl-button
                          class="add-input"
                          variant="text"
                          size="small"
                          @click=${() => {
                            this._matchers?.push("");
                            this.requestUpdate();
                            // get the last input element and focus it
                            setTimeout(() => {
                              const inputs =
                                this.shadowRoot?.querySelectorAll(".option");
                              const lastInput =
                                // @ts-expect-error -- .at seems not to be available in the type? @NilsJacobsen
                                inputs && (inputs.at(-1) as HTMLInputElement);
                              lastInput?.focus(), 100;
                            });
                          }}
                          ><svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            slot="prefix"
                            style="margin: 0 -2px"
                          >
                            <path
                              fill="currentColor"
                              d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"
                            ></path></svg
                        ></sl-button>
                      </sl-tooltip>
                    </div>
                    <div class="options-wrapper">
                      ${this._matchers?.map((category, index) => {
                        return html`<sl-input
                          class="option"
                          size="small"
                          value=${category}
                          filled
                          @input=${(e: Event) => {
                            this._matchers = this._matchers || [];
                            this._matchers[index] = (
                              e.target as HTMLInputElement
                            ).value;
                          }}
                          ><svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18px"
                            height="18px"
                            viewBox="0 0 24 24"
                            slot="suffix"
                            class="delete-icon"
                            style="margin-left: -4px; margin-right: 8px"
                            @click=${() => {
                              //delete with splic
                              this._matchers = this._matchers || [];
                              this._matchers.splice(index, 1);
                              this.requestUpdate();
                            }}
                          >
                            <path
                              fill="currentColor"
                              d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
                            /></svg
                        ></sl-input>`;
                      })}
                    </div>
                  </div>
                  <div class="help-text">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24px"
                      height="24px"
                      viewBox="0 0 256 256"
                    >
                      <path
                        fill="currentColor"
                        d="M140 180a12 12 0 1 1-12-12a12 12 0 0 1 12 12M128 72c-22.06 0-40 16.15-40 36v4a8 8 0 0 0 16 0v-4c0-11 10.77-20 24-20s24 9 24 20s-10.77 20-24 20a8 8 0 0 0-8 8v8a8 8 0 0 0 16 0v-.72c18.24-3.35 32-17.9 32-35.28c0-19.85-17.94-36-40-36m104 56A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104m-16 0a88 88 0 1 0-88 88a88.1 88.1 0 0 0 88-88"
                      />
                    </svg>
                    <p>
                      The selector automatically adds the variants from the list
                      of matchers.
                    </p>
                  </div>`
              : ``
          }
					
					<div class=${this._variable ? "actions" : "actions disabled"}>
						<sl-button
							@click=${() => {
                if (this._matchers) {
                  this._handleAddSelector(this._matchers);
                } else {
                  console.info("No matchers present");
                }
              }}
							size="medium"
							variant="primary"
							>Add selector</sl-button
						>
					</div>
				</div>
			</div>
		`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "inlang-add-selector": InlangAddSelector;
  }
}
