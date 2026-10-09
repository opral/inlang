import { expect, test } from "vitest";
import { newProject } from "../project/newProject.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { insertBundleNested } from "./insertBundleNested.js";
import { upsertBundleNested } from "./upsertBundleNested.js";
import { selectBundleNested } from "./selectBundleNested.js";
import { createMessage, createVariant } from "../helper.js";
import type { NewBundleNested } from "../database/schema.js";

const texts = Array.from({ length: 30 }, (_, index) => `variant ${index}`);

/** A bundle whose messages and variants have no ids, in creation order. */
function bundleWithoutIds(): NewBundleNested {
	return {
		id: "bundle",
		declarations: [],
		messages: ["en", "de", "fr"].map((locale) => ({
			bundle_id: "bundle",
			locale,
			selectors: [],
			variants: texts.map((text) => ({
				matches: [{ type: "literal-match" as const, key: "n", value: text }],
				pattern: [{ type: "text" as const, value: text }],
			})),
		})) as NewBundleNested["messages"],
	};
}

test.each([
	["insertBundleNested", insertBundleNested],
	["upsertBundleNested", upsertBundleNested],
])(
	"%s: new messages and variants keep the order they were created in",
	async (_, write) => {
		const project = await loadProjectInMemory({ blob: await newProject() });
		await write(project.db, bundleWithoutIds());

		const [bundle] = await selectBundleNested(project.db).execute();
		expect(bundle!.messages.map((message) => message.locale)).toEqual([
			"en",
			"de",
			"fr",
		]);
		for (const message of bundle!.messages) {
			expect(message.variants.map((variant) => variant.pattern[0])).toEqual(
				texts.map((text) => ({ type: "text", value: text }))
			);
		}
	}
);

test("a variant added to an existing message goes after its variants", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	await insertBundleNested(project.db, bundleWithoutIds());
	const [bundle] = await selectBundleNested(project.db).execute();
	const message = bundle!.messages[0]!;
	message.variants.push({
		message_id: message.id,
		matches: [{ type: "catchall-match", key: "n" }],
		pattern: [{ type: "text", value: "last" }],
	} as any);

	await upsertBundleNested(project.db, bundle as NewBundleNested);

	const [after] = await selectBundleNested(project.db).execute();
	expect(after!.messages[0]!.variants.at(-1)!.pattern).toEqual([
		{ type: "text", value: "last" },
	]);
});

test("the helpers create ids that sort in creation order", () => {
	const variants = texts.map(() => createVariant({ messageId: "m" }).id);
	expect([...variants].sort()).toEqual(variants);
	const messages = texts.map(
		() => createMessage({ bundleId: "b", locale: "en", text: "" }).id
	);
	expect([...messages].sort()).toEqual(messages);
});
