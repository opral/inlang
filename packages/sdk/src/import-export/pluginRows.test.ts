import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { newProject } from "../project/newProject.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { Bundle, Message, Variant } from "../database/schema.js";

test("plugins exchange camelCase rows while the database uses canonical columns", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	let exported:
		| { bundles: Bundle[]; messages: Message[]; variants: Variant[] }
		| undefined;

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "greeting", declarations: [] }],
			messages: [
				{
					id: "greeting_en",
					bundleId: "greeting",
					locale: "en",
					selectors: [],
				},
			],
			variants: [
				{
					id: "greeting_en_1",
					messageId: "greeting_en",
					matches: [],
					pattern: [{ type: "text", value: "Hello" }],
				},
			],
		}),
		exportFiles: async ({ bundles, messages, variants }) => {
			exported = { bundles, messages, variants };
			return [];
		},
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "en" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	expect(
		await project.db
			.selectFrom("inlang_message")
			.select(["id", "bundle_id"])
			.execute()
	).toEqual([{ id: "greeting_en", bundle_id: "greeting" }]);
	expect(
		await project.db
			.selectFrom("inlang_variant")
			.select(["id", "message_id"])
			.execute()
	).toEqual([{ id: "greeting_en_1", message_id: "greeting_en" }]);

	await exportFiles({
		db: project.db,
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	expect(exported).toEqual({
		bundles: [{ id: "greeting", declarations: [] }],
		messages: [
			{ id: "greeting_en", bundleId: "greeting", locale: "en", selectors: [] },
		],
		variants: [
			{
				id: "greeting_en_1",
				messageId: "greeting_en",
				matches: [],
				pattern: [{ type: "text", value: "Hello" }],
			},
		],
	});
	await project.close();
});
