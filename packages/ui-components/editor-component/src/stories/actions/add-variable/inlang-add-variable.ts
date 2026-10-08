import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createChangeEvent } from "../../../helper/event.js";
import type { BundleRow, Declaration } from "@inlang/sdk";
import { baseStyling } from "../../../styling/base.js";

import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js";
import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js";
import SlCheckbox from "@shoelace-style/shoelace/dist/components/checkbox/checkbox.component.js";
import SlSelect from "@shoelace-style/shoelace/dist/components/select/select.component.js";
import SlOption from "@shoelace-style/shoelace/dist/components/option/option.component.js";
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js";

if (!customElements.get("sl-dropdown"))
  customElements.define("sl-dropdown", SlDropdown);
if (!customElements.get("sl-input")) customElements.define("sl-input", SlInput);
if (!customElements.get("sl-checkbox"))
  customElements.define("sl-checkbox", SlCheckbox);
if (!customElements.get("sl-select"))
  customElements.define("sl-select", SlSelect);
if (!customElements.get("sl-option"))
  customElements.define("sl-option", SlOption);
if (!customElements.get("sl-button"))
  customElements.define("sl-button", SlButton);

@customElement("inlang-add-variable")
export default class InlangAddVariable extends LitElement {
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
        width: 240px;
        background-color: var(--sl-panel-background-color);
        border: 1px solid var(--sl-input-border-color);
        padding: 12px 0;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .dropdown-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 12px;
      }
      .dropdown-item.nested {
        padding-left: 24px;
      }
      .dropdown-item.disable {
        opacity: 0.5;
        pointer-events: none;
      }
      .dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--sl-input-color);
        font-size: 12px;
      }
      .dropdown-title {
        font-size: 12px;
        font-weight: 500;
        margin: 6px 0;
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
      .actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .separator {
        height: 1px;
        background-color: var(--sl-input-border-color);
      }
      sl-checkbox::part(form-control-help-text) {
        font-size: 13px;
        padding-top: 6px;
        line-height: 1.3;
        color: var(--sl-input-help-text-color);
      }
      sl-checkbox::part(base) {
        font-size: 14px;
      }
      sl-input::part(input) {
        height: 32px;
        font-size: 14px;
        padding-bottom: 2px;
      }
      sl-input::part(base) {
        height: 32px;
      }
      sl-select::part(form-control-label) {
        font-size: 14px;
        padding-bottom: 4px;
      }
      sl-select::part(combobox) {
        height: 32px;
        min-height: 32px;
      }
      sl-select::part(display-input) {
        font-size: 14px;
      }
    `,
  ];

  @property({ type: Object })
  bundle: BundleRow;

  //state
  @state()
  private _newVariable: string = "";

  //state
  @state()
  private _localVariableDerivedFrom: Declaration | undefined = undefined;

  //state
  @state()
  private _isLocalVariable: boolean = false;

  override async firstUpdated() {
    await this.updateComplete;
    if (this.bundle) {
      this._localVariableDerivedFrom = this.bundle.declarations[0];
      this._newVariable = "";
      this._isLocalVariable = false;
    }
  }

  override render() {
    return html`
      <sl-dropdown
        distance="-4"
        class="dropdown"
        @sl-show=${() => {
          this._localVariableDerivedFrom = this.bundle.declarations[0];
        }}
      >
        <div slot="trigger" class="button-wrapper">
          <slot></slot>
        </div>
        <div class="dropdown-container">
          <div class="dropdown-item">
            <sl-input
              size="small"
              value=${this._newVariable}
              placeholder="Enter name"
              @input=${(e: Event) => {
                this._newVariable = (e.target as HTMLInputElement).value;
              }}
            >
            </sl-input>
          </div>
          <div class="separator"></div>
          <div
            class=${this.bundle?.declarations &&
            this.bundle?.declarations.length > 0
              ? "dropdown-item"
              : "dropdown-item disable"}
          >
            <sl-checkbox
              ?checked=${this._isLocalVariable}
              help-text=${this.bundle?.declarations &&
              this.bundle?.declarations.length > 0
                ? "Set to true, if you want to derive a local variable from a input variable."
                : "No input variables available."}
              @sl-change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                this._isLocalVariable = target.checked;
              }}
              >local</sl-checkbox
            >
          </div>
          ${this._isLocalVariable
            ? html`<div class="dropdown-item">
                <sl-select
                  label="Derive from"
                  value=${this._localVariableDerivedFrom?.name}
                  @sl-change=${(e: Event) => {
                    this._localVariableDerivedFrom =
                      this.bundle.declarations.find(
                        (declaration) =>
                          declaration.name ===
                          (e.target as HTMLSelectElement).value
                      );
                  }}
                >
                  ${this.bundle.declarations.map((declaration) => {
                    return html`<sl-option value=${declaration.name}
                      >${declaration.name}</sl-option
                    >`;
                  })}
                </sl-select>
              </div>`
            : ``}
          ${this._isLocalVariable
            ? html`<div class="dropdown-item nested">
                <sl-checkbox checked disabled>plural</sl-checkbox>
              </div>`
            : ``}
          <div class="separator"></div>
          <div class="dropdown-item">
            <sl-button
              variant="primary"
              @click=${() => {
                if (this._isLocalVariable && this._localVariableDerivedFrom) {
                  if (
                    this._newVariable &&
                    this._newVariable.trim() !== "" &&
                    this.bundle
                  ) {
                    this.dispatchEvent(
                      createChangeEvent({
                        entityId: this.bundle.id,
                        entity: "bundle",
                        newData: {
                          ...this.bundle,
                          declarations: [
                            ...(this.bundle.declarations as Declaration[]),
                            {
                              type: "local-variable",
                              name: this._newVariable,
                              value: {
                                type: "expression",
                                arg: {
                                  type: "variable-reference",
                                  name: this._localVariableDerivedFrom.name,
                                },
                                annotation: {
                                  type: "function-reference",
                                  name: "plural",
                                  options: [],
                                },
                              },
                            } as Declaration,
                          ],
                        },
                      })
                    );
                  }
                } else {
                  if (
                    this._newVariable &&
                    this._newVariable.trim() !== "" &&
                    this.bundle
                  ) {
                    this.dispatchEvent(
                      createChangeEvent({
                        entityId: this.bundle.id,
                        entity: "bundle",
                        newData: {
                          ...this.bundle,
                          declarations: [
                            ...this.bundle.declarations,
                            {
                              name: this._newVariable,
                              type: "input-variable",
                            },
                          ],
                        },
                      })
                    );
                  }
                }

                this._newVariable = "";
                this._isLocalVariable = false;
                this._localVariableDerivedFrom = undefined;

                const dropdown = this.shadowRoot?.querySelector(
                  ".dropdown"
                ) as SlDropdown;
                dropdown.hide();
              }}
              >Add variable</sl-button
            >
          </div>
        </div>
      </sl-dropdown>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "inlang-add-variable": InlangAddVariable;
  }
}
