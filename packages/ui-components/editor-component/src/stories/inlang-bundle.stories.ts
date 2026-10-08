import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { mockSettings } from "../mock/settings.ts";
import { exampleWithoutSelectors } from "../mock/messageBundle.ts";
import SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.component.js";
if (!customElements.get("sl-dialog"))
  customElements.define("sl-dialog", SlDialog);
//@ts-ignore
import { useArgs } from "@storybook/preview-api";
import { type BundleRow, type MessageRow, type VariantRow } from "@inlang/sdk";
import { type ChangeEventDetail } from "../helper/event.ts";
import { updateEntities } from "../mock/updateEntities.ts";

//components
import "./inlang-bundle.ts";
import "./message/inlang-message.ts";
import "./variant/inlang-variant.ts";
import "./pattern-editor/inlang-pattern-editor.ts";
import "./actions/bundle-action/inlang-bundle-action.ts";
import "./actions/add-selector/inlang-add-selector.ts";
import { examplePlural } from "../mock/pluralBundle.ts";

const meta: Meta = {
  component: "inlang-bundle",
  title: "Public/inlang-bundle",
  argTypes: {
    bundle: {
      control: { type: "object" },
      description: "Type MessageBundle: see sdk v2",
    },
  },
};

export default meta;

let stateBuffer = exampleWithoutSelectors;

export const Example: StoryObj = {
  args: {
    state: exampleWithoutSelectors,
  },
  render: () => {
    const [args, updateArgs] = useArgs();
    const { bundles, messages, variants } = args.state as {
      bundles: BundleRow[];
      messages: MessageRow[];
      variants: VariantRow[];
    };

    const handleSelectorModal = () => {
      const dialog = document.querySelector("sl-dialog") as SlDialog;
      dialog.show();
    };

    const handleChange = (e) => {
      const data = e.detail as ChangeEventDetail;
      const newBufferData = structuredClone(stateBuffer);
      const newData = updateEntities({ entities: newBufferData, change: data });
      updateArgs({
        state: newData,
      });
      stateBuffer = newData;
    };

    return html`<inlang-bundle .bundle=${bundles[0]} @change=${handleChange}>
      ${messages.map((message) => {
        const variantsOfMessage = variants.filter(
          (v) => v.message_id === message.id
        );
        return html`<inlang-message
          slot="message"
          .message=${message}
          .variants=${variantsOfMessage}
          .settings=${mockSettings}
        >
          ${variantsOfMessage.map((variant) => {
            return html` <inlang-variant slot="variant" .variant=${variant}>
              <inlang-pattern-editor slot="pattern-editor" .variant=${variant}>
              </inlang-pattern-editor>
              ${(message.selectors.length === 0 &&
                variantsOfMessage.length <= 1) ||
              !message.selectors
                ? html` <div
                      slot="variant-action"
                      @click=${handleSelectorModal}
                    >
                      Add selector
                    </div>
                    <sl-dialog slot="variant-action" label="Add Selector">
                      <inlang-add-selector
                        .bundle=${bundles[0]}
                        .message=${message}
                        .variants=${variantsOfMessage}
                      ></inlang-add-selector>
                    </sl-dialog>
                    <style>
                      sl-dialog::part(body) {
                        padding: 0;
                        margin-top: -16px;
                      }
                      sl-dialog::part(panel) {
                        border-radius: 8px;
                      }
                    </style>`
                : ``}
            </inlang-variant>`;
          })}
          <style>
            .add-selector {
              height: 44px;
              display: flex;
              align-items: center;
              margin-right: 12px;
            }
            sl-dialog::part(body) {
              padding: 0;
              margin-top: -16px;
            }
            sl-dialog::part(panel) {
              border-radius: 8px;
            }
          </style>
          <div
            slot="selector-button"
            class="add-selector"
            @click=${handleSelectorModal}
          >
            Add selector
          </div>
          <sl-dialog slot="selector-button" label="Add Selector">
            <inlang-add-selector
              .message=${message}
              .bundle=${bundles[0]}
              .variants=${variantsOfMessage}
            ></inlang-add-selector>
          </sl-dialog>
        </inlang-message>`;
      })}
    </inlang-bundle>`;
  },
};

export const Complex: StoryObj = {
  args: {
    state: examplePlural,
  },
  render: () => {
    const [args, updateArgs] = useArgs();
    const { bundles, messages, variants } = args.state as {
      bundles: BundleRow[];
      messages: MessageRow[];
      variants: VariantRow[];
    };

    const handleChange = (e) => {
      const data = e.detail as ChangeEventDetail;
      updateArgs({
        state: updateEntities({ entities: args.state, change: data }),
      });
    };

    return html`<inlang-bundle .bundle=${bundles[0]} @change=${handleChange}>
      ${messages.map((message) => {
        const variantsOfMessage = variants.filter(
          (v) => v.message_id === message.id
        );
        return html`<inlang-message
          slot="message"
          .message=${message}
          .variants=${variantsOfMessage}
          .settings=${mockSettings}
        >
          ${variantsOfMessage.map((variant) => {
            return html`<inlang-variant slot="variant" .variant=${variant}>
              <inlang-pattern-editor slot="pattern-editor" .variant=${variant}>
              </inlang-pattern-editor>
            </inlang-variant>`;
          })}
        </inlang-message>`;
      })}
    </inlang-bundle>`;
  },
};

export const Complex_Highlighted: StoryObj = {
  args: {
    state: examplePlural,
  },
  render: () => {
    const [args, updateArgs] = useArgs();
    const { bundles, messages, variants } = args.state as {
      bundles: BundleRow[];
      messages: MessageRow[];
      variants: VariantRow[];
    };

    const handleChange = (e) => {
      const data = e.detail as ChangeEventDetail;
      updateArgs({
        state: updateEntities({ entities: args.state, change: data }),
      });
    };

    return html`
      <style>
        .highlighted-bundle inlang-message::part(new-variant) {
          display: none;
        }
        .highlighted-bundle::part(add-variable) {
          display: none;
        }
        .highlighted-bundle
          .highlight-red
          .inlang-pattern-editor-contenteditable,
        .highlighted-bundle .highlight-match-red::part(match),
        .highlighted-bundle .highlight-selector-red::part(selector),
        .highlighted-bundle.highlight-variables-red::part(variable) {
          background-color: #ffe8e8 !important;
          border: 1px solid red !important;
        }
      </style>
      <h2>Highlighted pattern</h2>
      <inlang-bundle
        class="highlighted-bundle"
        .bundle=${bundles[0]}
        @change=${handleChange}
      >
        ${messages.map((message) => {
          const variantsOfMessage = variants.filter(
            (v) => v.message_id === message.id
          );
          return html` <inlang-message
            slot="message"
            .message=${message}
            .variants=${variantsOfMessage}
            .settings=${mockSettings}
          >
            ${variantsOfMessage.map((variant) => {
              return html`<inlang-variant slot="variant" .variant=${variant}>
                <inlang-pattern-editor
                  class="highlight-red"
                  slot="pattern-editor"
                  .variant=${variant}
                >
                </inlang-pattern-editor>
              </inlang-variant>`;
            })}
          </inlang-message>`;
        })}
      </inlang-bundle>
      <h2>Highlighted match</h2>
      <inlang-bundle
        class="highlighted-bundle"
        .bundle=${bundles[0]}
        @change=${handleChange}
      >
        ${messages.map((message) => {
          const variantsOfMessage = variants.filter(
            (v) => v.message_id === message.id
          );
          return html` <inlang-message
            slot="message"
            .message=${message}
            .variants=${variantsOfMessage}
            .settings=${mockSettings}
          >
            ${variantsOfMessage.map((variant) => {
              return html`<inlang-variant
                class="highlight-match-red"
                slot="variant"
                .variant=${variant}
              >
                <inlang-pattern-editor
                  slot="pattern-editor"
                  .variant=${variant}
                >
                </inlang-pattern-editor>
              </inlang-variant>`;
            })}
          </inlang-message>`;
        })}
      </inlang-bundle>
      <h2>Highlighted selector</h2>
      <inlang-bundle
        class="highlighted-bundle"
        .bundle=${bundles[0]}
        @change=${handleChange}
      >
        ${messages.map((message) => {
          const variantsOfMessage = variants.filter(
            (v) => v.message_id === message.id
          );
          return html` <inlang-message
            class="highlight-selector-red"
            slot="message"
            .message=${message}
            .variants=${variantsOfMessage}
            .settings=${mockSettings}
          >
            ${variantsOfMessage.map((variant) => {
              return html`<inlang-variant slot="variant" .variant=${variant}>
                <inlang-pattern-editor
                  slot="pattern-editor"
                  .variant=${variant}
                >
                </inlang-pattern-editor>
              </inlang-variant>`;
            })}
          </inlang-message>`;
        })}
      </inlang-bundle>
      <h2>Highlighted variables</h2>
      <inlang-bundle
        class="highlighted-bundle highlight-variables-red"
        .bundle=${bundles[0]}
        @change=${handleChange}
      >
        ${messages.map((message) => {
          const variantsOfMessage = variants.filter(
            (v) => v.message_id === message.id
          );
          return html` <inlang-message
            slot="message"
            .message=${message}
            .variants=${variantsOfMessage}
            .settings=${mockSettings}
          >
            ${variantsOfMessage.map((variant) => {
              return html`<inlang-variant slot="variant" .variant=${variant}>
                <inlang-pattern-editor
                  slot="pattern-editor"
                  .variant=${variant}
                >
                </inlang-pattern-editor>
              </inlang-variant>`;
            })}
          </inlang-message>`;
        })}
      </inlang-bundle>
    `;
  },
};

export const Themed: StoryObj = {
  args: {
    state: examplePlural,
  },
  render: () => {
    const [args] = useArgs();
    const { bundles, messages, variants } = args.state as {
      bundles: BundleRow[];
      messages: MessageRow[];
      variants: VariantRow[];
    };

    return html` <style>
        .inlang-pattern-editor-contenteditable {
          background-color: #2f2a33 !important;
          color: #fcfafc !important;
        }
        .inlang-pattern-editor-contenteditable:hover {
          background-color: #4a474d !important;
        }
        .inlang-pattern-editor-placeholder {
          color: #fcfafc !important;
        }
        inlang-variant {
          --sl-input-border-color: #9e9d9e;
          --sl-input-background-color: #2f2a33;
          --sl-input-background-color-focus: #4a474d;
          --sl-input-background-color-hover: #4a474d;
          --sl-input-border-color-hover: #9e9d9e;
          --sl-input-color: #fcfafc;
          --sl-input-color-focus: #fcfafc;
          --sl-input-color-hover: #fcfafc;
        }
        inlang-message {
          --sl-input-border-color: #9e9d9e;
          --sl-input-background-color: #2f2a33;
          --sl-input-background-color-focus: #4a474d;
          --sl-input-background-color-hover: #4a474d;
          --sl-input-border-color-hover: #9e9d9e;
          --sl-input-color: #fcfafc;
          --sl-input-color-focus: #fcfafc;
          --sl-input-color-hover: #fcfafc;
          --sl-input-background-color-disabled: #211f23;
          --sl-input-placeholder-color: #fcfafc;
        }
        inlang-bundle {
          --sl-input-border-color: #9e9d9e;
          --sl-input-background-color: #2f2a33;
          --sl-input-background-color-focus: #4a474d;
          --sl-input-background-color-hover: #4a474d;
          --sl-input-border-color-hover: #9e9d9e;
          --sl-input-color: #fcfafc;
          --sl-input-color-focus: #fcfafc;
          --sl-input-color-hover: #fcfafc;
          --sl-input-background-color-disabled: #211f23;
          --sl-input-placeholder-color: #fcfafc;
        }
        inlang-bundle::part(base) {
          background-color: #18161a;
        }
      </style>
      <inlang-bundle .bundle=${bundles[0]}>
        ${messages.map((message) => {
          const variantsOfMessage = variants.filter(
            (v) => v.message_id === message.id
          );
          return html`<inlang-message
            slot="message"
            .message=${message}
            .variants=${variantsOfMessage}
            .settings=${mockSettings}
          >
            ${variantsOfMessage.map((variant) => {
              return html`<inlang-variant slot="variant" .variant=${variant}>
                <inlang-pattern-editor
                  slot="pattern-editor"
                  .variant=${variant}
                >
                </inlang-pattern-editor>
                ${(message.selectors.length === 0 &&
                  variantsOfMessage.length <= 1) ||
                !message.selectors
                  ? html`<style>
                        sl-dialog::part(body) {
                          padding: 0;
                          margin-top: -16px;
                        }
                        sl-dialog::part(panel) {
                          border-radius: 8px;
                        }
                      </style>
                      <div slot="variant-action">Add selector</div>
                      <sl-dialog slot="variant-action" label="Add Selector">
                        <inlang-add-selector
                          .message=${message}
                          .messages=${messages}
                        ></inlang-add-selector>
                      </sl-dialog>`
                  : ``}
              </inlang-variant>`;
            })}
            <style>
              .add-selector {
                height: 44px;
                display: flex;
                align-items: center;
                margin-right: 12px;
              }
              sl-dialog::part(body) {
                padding: 0;
                margin-top: -16px;
              }
              sl-dialog::part(panel) {
                border-radius: 8px;
              }
            </style>
            <div slot="selector-button" class="add-selector">Add selector</div>
            <sl-dialog slot="selector-button" label="Add Selector">
              <inlang-add-selector
                .message=${message}
                .messages=${messages}
              ></inlang-add-selector>
            </sl-dialog>
          </inlang-message>`;
        })}
      </inlang-bundle>`;
  },
};
