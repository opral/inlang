import { expect, test } from "vitest";
import { loadProjectInMemory } from "./loadProjectInMemory.js";
import { newProject } from "./newProject.js";
import {
	applyBundleDescriptions,
	mergeBundleDescriptions,
	encodeBundleDescriptions,
} from "./bundleDescriptions.js";
import type { InlangPlugin } from "../plugin/schema.js";

const json: InlangPlugin = {
	key: "test-json",
	importFiles: () => ({
		bundles: [{ id: "save" }],
		messages: [],
		variants: [],
	}),
	exportFiles: () => [
		{
			name: "en.json",
			locale: "en",
			content: new TextEncoder().encode('{"save":"Save"}'),
		},
	],
};
const native: InlangPlugin = {
	...json,
	key: "test-native",
	supportsBundleDescriptions: true,
};

async function fixture() {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "en", locales: ["en"], modules: [] },
		}),
		providePlugins: [json, native],
	});
	await project.db
		.insertInto("inlang_bundle")
		.values({ id: "save", description: "Old guidance" })
		.execute();
	await project.db
		.insertInto("inlang_message")
		.values({ id: "en", bundle_id: "save", locale: "en" })
		.execute();
	return project;
}

const companion = (description: string) => ({
	locale: "",
	content: encodeBundleDescriptions(new Map([["save", description]])),
	toBeImportedFilesMetadata: { inlangDescriptions: true },
});

test("portable JSON export retains descriptions even when a native plugin is available", async () => {
	const project = await fixture();
	try {
		const files = await project.exportFiles({ pluginKey: json.key });
		expect(
			await project.lix.queryOne(
				"SELECT path FROM lix_file WHERE path = '/descriptions.json'"
			)
		).toBeUndefined();
		const descriptionFile = files.find(
			(file) => file.metadata?.inlangDescriptions
		);
		expect(descriptionFile).toBeDefined();
		expect(
			JSON.parse(new TextDecoder().decode(descriptionFile!.content))
		).toEqual({ version: 1, descriptions: { save: "Old guidance" } });
	} finally {
		await project.close();
	}
});

test("translation imports retain current descriptions instead of reapplying stale companion content", async () => {
	const project = await fixture();
	try {
		await project.importFiles({
			pluginKey: json.key,
			files: [companion("Old guidance")],
		});
		await project.db
			.updateTable("inlang_bundle")
			.set({ description: "Edited guidance" })
			.where("id", "=", "save")
			.execute();
		await project.importFiles({
			pluginKey: json.key,
			files: [{ locale: "de", content: new TextEncoder().encode("{}") }],
		});
		expect(
			(
				await project.db
					.selectFrom("inlang_bundle")
					.select("description")
					.where("id", "=", "save")
					.executeTakeFirstOrThrow()
			).description
		).toBe("Edited guidance");
	} finally {
		await project.close();
	}
});

test.each(["new companion", null])(
	"companion edit %s reports conflicting native changes",
	async (description) => {
		const project = await fixture();
		try {
			await project.db
				.updateTable("inlang_bundle")
				.set({ description: "New native guidance" })
				.where("id", "=", "save")
				.execute();
			await expect(
				applyBundleDescriptions(
					project,
					description ? new Map([["save", description]]) : new Map(),
					new Map([["save", "Old guidance"]])
				)
			).rejects.toThrow("Conflicting native and companion descriptions");
			expect(
				(
					await project.db
						.selectFrom("inlang_bundle")
						.select("description")
						.executeTakeFirstOrThrow()
				).description
			).toBe("New native guidance");
		} finally {
			await project.close();
		}
	}
);

test("companion metadata retains empty bundles without inventing locale messages", async () => {
	const project = await fixture();
	try {
		const descriptions = new Map([
			["metadata-only", "Explain a string before authoring translations"],
		]);
		await applyBundleDescriptions(project, descriptions);
		expect(
			await project.db
				.selectFrom("inlang_bundle")
				.select(["id", "description"])
				.where("id", "=", "metadata-only")
				.executeTakeFirst()
		).toEqual({
			id: "metadata-only",
			description: descriptions.get("metadata-only"),
		});
		expect(
			await project.db
				.selectFrom("inlang_message")
				.select("id")
				.where("bundle_id", "=", "metadata-only")
				.execute()
		).toEqual([]);
		expect(mergeBundleDescriptions([], descriptions)).toEqual([
			{
				id: "metadata-only",
				description: descriptions.get("metadata-only"),
				declarations: [],
				messages: [],
			},
		]);
	} finally {
		await project.close();
	}
});

test.each([false, true])(
	"combined native and companion conflict rolls back resource changes (fresh %s)",
	async (fresh) => {
		const atomicNative: InlangPlugin = {
			key: "atomic-native",
			supportsBundleDescriptions: true,
			importFiles: () => ({
				bundles: [{ id: "save", description: "New native guidance" }],
				messages: [{ id: "en", bundleId: "save", locale: "en" }],
				variants: [
					{
						id: "v",
						messageId: "en",
						pattern: [{ type: "text", value: "Edited text" }],
					},
				],
			}),
		};
		const project = await loadProjectInMemory({
			blob: await newProject({
				settings: { baseLocale: "en", locales: ["en"], modules: [] },
			}),
			providePlugins: [atomicNative],
		});
		try {
			if (!fresh) {
				await project.db
					.insertInto("inlang_bundle")
					.values({ id: "save", description: "Original guidance" })
					.execute();
				await project.db
					.insertInto("inlang_message")
					.values({ id: "en", bundle_id: "save", locale: "en" })
					.execute();
				await project.db
					.insertInto("inlang_variant")
					.values({
						id: "v",
						message_id: "en",
						pattern: [{ type: "text", value: "Original text" }],
					})
					.execute();
			}
			await expect(
				project.importFiles({
					pluginKey: atomicNative.key,
					allowPartialImport: true,
					files: [
						{ locale: "en", content: new TextEncoder().encode("{}") },
						companion("Conflicting companion guidance"),
					],
				})
			).rejects.toThrow("Conflicting native and companion descriptions");
			const bundle = await project.db
				.selectFrom("inlang_bundle")
				.select("description")
				.where("id", "=", "save")
				.executeTakeFirst();
			const variant = await project.db
				.selectFrom("inlang_variant")
				.select("pattern")
				.where("id", "=", "v")
				.executeTakeFirst();
			expect(bundle?.description).toBe(fresh ? undefined : "Original guidance");
			expect(variant?.pattern).toEqual(
				fresh ? undefined : [{ type: "text", value: "Original text" }]
			);
			expect(
				await project.lix.queryOne(
					"SELECT path FROM lix_file WHERE path = '/descriptions.json'"
				)
			).toBeUndefined();
		} finally {
			await project.close();
		}
	}
);
