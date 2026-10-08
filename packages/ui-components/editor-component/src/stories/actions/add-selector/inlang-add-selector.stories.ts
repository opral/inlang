import "./inlang-add-selector.ts";
import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { examplePlural } from "../../../mock/pluralBundle.ts";

const meta: Meta = {
  component: "inlang-add-selector",
  title: "Public/Actions/inlang-add-selector",
  argTypes: {
    message: { control: "object" },
    messages: { control: "array" },
  },
};

export default meta;

const bundle = examplePlural.bundles[0];
const message = examplePlural.messages.find((m) => m.bundle_id === bundle.id);
const variants = examplePlural.variants.filter(
  (v) => message?.id === v.message_id,
);

export const Example: StoryObj = {
  render: () => {
    return html`
      <inlang-add-selector
        .bundle=${bundle}
        .message=${message}
        .variants=${variants}
        @change=${(e) => console.info(e.detail)}
      ></inlang-add-selector>
    `;
  },
};
