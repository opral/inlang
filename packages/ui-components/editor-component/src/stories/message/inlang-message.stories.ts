import "./inlang-message.ts";
import "../variant/inlang-variant.ts";
import "../pattern-editor/inlang-pattern-editor.ts";
import "../inlang-bundle.ts";

import type { Meta, StoryObj } from "@storybook/web-components";
//@ts-ignore
import { useArgs } from "@storybook/preview-api";
import { html } from "lit";
import { type MessageRow, type VariantRow } from "@inlang/sdk";
import { mockSettings } from "../../mock/settings.ts";
import { type ChangeEventDetail } from "../../helper/event.ts";
import { updateEntities } from "../../mock/updateEntities.ts";
import { examplePlural } from "../../mock/pluralBundle.ts";

const meta: Meta = {
	component: "inlang-message",
	title: "Public/inlang-message",
	argTypes: {
		message: { control: "object" }, // Control the variant object through Storybook
	},
};

export default meta;

export const Example: StoryObj = {
	args: {
		entities: {
			message: examplePlural.messages[1],
			variants: examplePlural.variants.filter(
				(v) => v.message_id === examplePlural.messages[1].id
			),
		},
		settings: mockSettings,
	},
	render: () => {
		const [{ entities, settings }, updateArgs] = useArgs();
		const { message, variants } = entities as {
			message: MessageRow;
			variants: VariantRow[];
		};
		const handleChange = (e) => {
			const change = e.detail as ChangeEventDetail;
			updateArgs({
				entities: updateEntities({
					entities: { bundles: [], messages: [message], variants },
					change,
				}),
				settings,
			});
		};

		return html`<inlang-message
			.message=${message}
			.variants=${variants}
			.settings=${settings}
			@change=${handleChange}
		>
			${variants.map((variant) => {
				return html`
				<inlang-variant slot="variant" .variant=${variant}>
					<inlang-pattern-editor slot="pattern-editor" .variant="${variant}">
				</inlang-variant>`;
			})}
		</inlang-message>`;
	},
};

export const MessageInBundle: StoryObj = {
	args: {
		entities: {
			message: examplePlural.messages[1],
			variants: examplePlural.variants.filter(
				(v) => v.message_id === examplePlural.messages[1].id
			),
		},
		settings: mockSettings,
	},
	render: () => {
		const [{ entities, settings }, updateArgs] = useArgs();
		const { message, variants } = entities as {
			message: MessageRow;
			variants: VariantRow[];
		};
		const handleChange = (e) => {
			const change = e.detail as ChangeEventDetail;
			updateArgs({
				entities: updateEntities({
					entities: { bundles: [], messages: [message], variants },
					change,
				}),
				settings,
			});
		};

		return html`<inlang-bundle .bundle=${examplePlural.bundles[0]}>
			<inlang-message
				slot="message"
				.message=${message}
				.variants=${variants}
				.settings=${settings}
				@change=${handleChange}
			>
				${variants.map((variant) => {
					return html`<inlang-variant slot="variant" .variant=${variant}>
                    <inlang-pattern-editor slot="pattern-editor" .variant="${variant}">
                </inlang-variant>`;
				})}
			</inlang-message>
		</inlang-bundle>`;
	},
};
