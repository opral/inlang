import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import overridePrimitiveColors from "../helper/overridePrimitiveColors.js";
import type { BundleRow } from "@inlang/sdk";
import { createChangeEvent } from "../helper/event.js";

// //shoelace components
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js";
import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js";
import SlMenu from "@shoelace-style/shoelace/dist/components/menu/menu.component.js";
import SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.component.js";

// // in case an app defines it's own set of shoelace components, prevent double registering
if (!customElements.get("sl-button"))
  customElements.define("sl-button", SlButton);
if (!customElements.get("sl-dropdown"))
  customElements.define("sl-dropdown", SlDropdown);
if (!customElements.get("sl-menu")) customElements.define("sl-menu", SlMenu);
if (!customElements.get("sl-menu-item"))
  customElements.define("sl-menu-item", SlMenuItem);

//components
import "./actions/add-variable/inlang-add-variable.js";

//helpers
import { baseStyling } from "../styling/base.js";

@customElement("inlang-bundle")
export default class InlangBundle extends LitElement {
  static override styles = [
    baseStyling,
    css`
      div {
        box-sizing: border-box;
        font-size: 14px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        background-color: var(--sl-color-neutral-300);
        padding: 0 12px;
        min-height: 44px;
      }
      .header-left {
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 44px;
        color: var(--sl-input-color);
      }
      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
      }
      .separator {
        height: 20px;
        width: 1px;
        background-color: var(--sl-input-border-color-hover);
        opacity: 0.7;
        border-radius: 1px;
      }
      .slotted-menu-wrapper {
        display: flex;
        flex-direction: column;
      }
      .variables-wrapper {
        display: flex;
        align-items: center;
        min-height: 44px;
        gap: 8px;
        color: var(--sl-input-color);
      }
      .variables {
        display: flex;
        align-items: center;
        min-height: 44px;
        gap: 1px;
      }
      .variable-tag::part(base) {
        height: 28px;
        font-weight: 500;
        cursor: pointer;
      }
      .text-button::part(base) {
        background-color: transparent;
        border: 1px solid transparent;
      }
      .text-button::part(base):hover {
        background-color: var(--sl-panel-border-color);
        border: 1px solid transparent;
        color: var(--sl-input-color-hover);
      }
      .alias-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .alias {
        font-weight: 400;
        color: var(--sl-input-placeholder-color);
      }
      .alias-counter {
        height: 20px;
        width: 24px;
        font-weight: 500;
        font-size: 11px;
        color: var(--sl-input-color-hover);
        padding: 4px;
        border-radius: 4px;
        background-color: var(--sl-input-background-color-hover);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      sl-button::part(base) {
        background-color: var(--sl-input-background-color);
        color: var(--sl-input-color);
        border: 1px solid var(--sl-input-border-color);
        font-size: 13px;
      }
      sl-button::part(base):hover {
        background-color: var(--sl-input-background-color-hover);
        color: var(--sl-input-color-hover);
        border: 1px solid var(--sl-input-border-color-hover);
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
    `,
  ];
  //props
  @property({ type: Object })
  bundle: BundleRow;

  @state()
  private _bundleActionsPresent = false;

  override async firstUpdated() {
    await this.updateComplete;

    if (
      // @ts-expect-error - children is not in the types
      [...this.children].some(
        (child: Element) => child.tagName === "INLANG-BUNDLE-ACTION"
      )
    ) {
      this._bundleActionsPresent = true;
    }

    // override primitive colors to match the design system
    overridePrimitiveColors();
  }

  override render() {
    return html`
      <div>
        <div class=${`header`} part="base">
          <div class="header-left">
            <span># ${this.bundle.id}</span>
          </div>

          <div class="header-right">
            ${this.bundle.declarations.length > 0
              ? html`<div class="variables-wrapper">
                  Variables:
                  <div class="variables">
                    ${this.bundle.declarations.map(
                      (declaration) =>
                        html`<sl-dropdown
                          ><sl-button
                            exportparts="base:variable"
                            slot="trigger"
                            class="variable-tag"
                            variant="neutral"
                            size="small"
                            >${declaration.name}</sl-button
                          ><sl-menu>
                            <sl-menu-item
                              value="delete"
                              @click=${() => {
                                const filtered =
                                  this.bundle.declarations.filter(
                                    (d) => d.name !== declaration.name
                                  );
                                this.dispatchEvent(
                                  createChangeEvent({
                                    entityId: this.bundle.id,
                                    entity: "bundle",
                                    newData: {
                                      ...this.bundle,
                                      declarations: filtered,
                                    },
                                  })
                                );
                              }}
                              >Delete</sl-menu-item
                            >
                          </sl-menu>
                        </sl-dropdown>`
                    )}
                    <inlang-add-variable
                      .bundle=${this.bundle}
                      part="add-variable"
                    >
                      <sl-tooltip content="Add a variable to this bundle">
                        <sl-button
                          class="text-button"
                          variant="neutral"
                          size="small"
                          ><svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            style="margin: 0 -2px"
                            slot="prefix"
                          >
                            <path
                              fill="currentColor"
                              d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"
                            ></path></svg
                        ></sl-button>
                      </sl-tooltip>
                    </inlang-add-variable>
                  </div>
                </div>`
              : html`<div class="variables-wrapper">
                  <inlang-add-variable .bundle=${this.bundle}>
                    <sl-tooltip content="Add a variable to this bundle">
                      <sl-button class="text-button" variant="text" size="small"
                        ><svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          slot="prefix"
                          style="margin-right: -2px"
                        >
                          <path
                            fill="currentColor"
                            d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"
                          ></path></svg
                        >New variable</sl-button
                      >
                    </sl-tooltip>
                  </inlang-add-variable>
                </div>`}
            ${this._bundleActionsPresent
              ? html`<div class="separator"></div>
                  <sl-dropdown class="bundle-actions">
                    <sl-button
                      class="text-button"
                      variant="text"
                      size="small"
                      slot="trigger"
                      ><svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        slot="prefix"
                        style="margin: 0 -2px"
                      >
                        <path
                          fill="currentColor"
                          d="M7 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0m7 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0m7 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0"
                        /></svg
                    ></sl-button>
                    <sl-menu>
                      <slot name="bundle-action"></slot>
                    </sl-menu>
                  </sl-dropdown>`
              : ``}
          </div>
        </div>
        <slot name="message"></slot>
        <!-- TODO: workaround for slot needs a better solution | when conditionally rendered, the slot doesn't get passed into the dom and then can not be queried. That's why we put it here additionally. Will never be renedered under a message. -->
        <slot name="bundle-action"></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "inlang-bundle": InlangBundle;
  }
}
