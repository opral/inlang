import "./inlang-variant.ts";
import "../message/inlang-message.ts";
import "../pattern-editor/inlang-pattern-editor.ts";
import type { Meta, StoryObj } from "@storybook/web-components";
//@ts-ignore
import { useArgs } from "@storybook/preview-api";
import { html } from "lit";
import { type VariantRow } from "@inlang/sdk";
import { type ChangeEventDetail } from "../../helper/event.ts";
import { examplePlural } from "../../mock/pluralBundle.ts";

const meta: Meta = {
	component: "inlang-variant",
	title: "Public/inlang-variant",
	argTypes: {
		variant: { control: "object" }, // Control the variant object through Storybook
	},
};

export default meta;

export const Example: StoryObj = {
	args: {
		variant: examplePlural.variants[2],
	},
	render: () => {
		const [{ variant }, updateArgs] = useArgs();
		const handleChange = (e) => {
			const change = e.detail as ChangeEventDetail;
			// delete variant
			if (change.newData === undefined) {
				updateArgs({ variant: undefined });
			} else {
				updateArgs({ variant: change.newData as VariantRow });
			}
			console.info(change);
		};

		return html`<inlang-variant .variant=${variant} @change=${handleChange}>
			<inlang-pattern-editor
				slot="pattern-editor"
				.variant="${variant}"
			></inlang-pattern-editor>
		</inlang-variant>`;
	},
};

export const VariantInMessage: StoryObj = {
	args: {
		variant: examplePlural.variants[2],
	},
	render: () => {
		const [{ variant }, updateArgs] = useArgs();
		const handleChange = (e) => {
			const change = e.detail as ChangeEventDetail;
			// delete variant
			if (change.newData === undefined) {
				updateArgs({ variant: undefined });
			} else {
				updateArgs({ variant: change.newData as VariantRow });
			}
			console.info(change);
		};

		return html`<inlang-message>
			<inlang-variant
				slot="variant"
				.variant=${variant}
				@change=${handleChange}
			>
				<inlang-pattern-editor slot="pattern-editor" .variant="${variant}">
				</inlang-pattern-editor> </inlang-variant
		></inlang-message>`;
	},
};
