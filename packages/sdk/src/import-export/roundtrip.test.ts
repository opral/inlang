import { test, expect } from "vitest";
import type {
	BundleImport,
	InlangPlugin,
	MessageImport,
	VariantImport,
} from "../plugin/schema.js";
import type { Message } from "../database/schema.js";
import type { Text } from "../json-schema/pattern.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { newProject } from "../project/newProject.js";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

test("the file should be identical after a roundtrip if no modifications occured", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	const enResource = JSON.stringify({
		hello_world: "value1",
	});

	await importFiles({
		files: [{ content: new TextEncoder().encode(enResource), locale: "en" }],
		pluginKey: "mock",
		plugins: [mockPluginSimple],
		settings: await project.settings.get(),
		db: project.db,
	});

	const importedBundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();
	const importedMessages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const importedVariants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(importedBundles.length).toBe(1);
	expect(importedMessages.length).toBe(1);
	expect(importedVariants.length).toBe(1);
	expect(importedBundles[0]?.id).toBe("hello_world");
	expect(importedMessages[0]?.bundle_id).toBe("hello_world");
	expect(importedVariants[0]?.message_id).toBe(importedMessages[0]?.id);

	const exportedFiles = await exportFiles({
		pluginKey: "mock",
		plugins: [mockPluginSimple],
		settings: await project.settings.get(),
		db: project.db,
	});

	expect(exportedFiles.length).toBe(1);
	expect(exportedFiles[0]?.name).toBe("en.json");
	expect(new TextDecoder().decode(exportedFiles[0]?.content)).toBe(enResource);
});

test("a variant with an existing match should update the existing variant and not create a new one to enable roundtrips", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	const existing = {
		bundles: [
			{
				id: "mock-bundle-id",
				declarations: [],
			},
		],
		messages: [
			{
				id: "mock-message-id",
				locale: "en",
				selectors: [],
				bundleId: "mock-bundle-id",
			},
		],
		variants: [
			{
				id: "mock-variant-id",
				messageId: "mock-message-id",
				matches: [
					{
						type: "literal-match",
						key: "color",
						value: "blue",
					},
				],
				pattern: [
					{
						type: "text",
						value: "You have blue eyes.",
					},
				],
			},
		],
	};

	const updated = structuredClone(existing);
	// @ts-expect-error - we know this is a text pattern
	updated.variants[0].pattern[0].value = "You have beautiful blue eyes.";

	const enResource = JSON.stringify(updated);

	await importFiles({
		files: [{ content: new TextEncoder().encode(enResource), locale: "en" }],
		pluginKey: "mock",
		plugins: [mockPluginAst],
		settings: await project.settings.get(),
		db: project.db,
	});

	const bundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();
	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(bundles.length).toBe(1);
	expect(messages.length).toBe(1);
	expect(variants.length).toBe(1);
	// @ts-expect-error - we know this is a text pattern
	expect(variants[0]?.pattern[0].value).toBe("You have beautiful blue eyes.");
});

test("if a message for the bundle id and locale already exists, update it. don't create a new message", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	const existing: any = {
		bundles: [{ id: "mock-bundle-id", declarations: [] }],
		messages: [
			{
				id: "mock-message-id",
				locale: "en",
				selectors: [],
				bundleId: "mock-bundle-id",
			},
		],
		variants: [],
	};

	const updated = structuredClone(existing);
	updated.messages[0]!.selectors = [
		{
			type: "variable-reference",
			name: "variable2",
		},
	] satisfies Message["selectors"];

	const enResource = new TextEncoder().encode(JSON.stringify(updated));

	await importFiles({
		files: [{ content: enResource, locale: "en" }],
		pluginKey: "mock",
		plugins: [mockPluginAst],
		settings: await project.settings.get(),
		db: project.db,
	});

	const bundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();
	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();

	expect(bundles.length).toBe(1);
	expect(messages.length).toBe(1);

	expect(messages[0]?.selectors).toStrictEqual([
		{
			type: "variable-reference",
			name: "variable2",
		},
	]);
});

test("keys should be ordered alphabetically for .json to minimize git diffs", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	const enResource = JSON.stringify({
		a: "value1",
		b: "value2",
		d: "value4",
	});

	await importFiles({
		files: [{ content: new TextEncoder().encode(enResource), locale: "en" }],
		pluginKey: "mock",
		plugins: [mockPluginSimple],
		settings: await project.settings.get(),
		db: project.db,
	});

	await project.db.insertInto("inlang_bundle").values({ id: "c" }).execute();
	await project.db
		.insertInto("inlang_message")
		.values({ id: "c-en", bundle_id: "c", locale: "en" })
		.execute();
	await project.db
		.insertInto("inlang_variant")
		.values({
			message_id: "c-en",
			pattern: [{ type: "text", value: "value3" }],
		})
		.execute();

	const exportedFiles = await exportFiles({
		pluginKey: "mock",
		plugins: [mockPluginSimple],
		settings: await project.settings.get(),
		db: project.db,
	});

	expect(
		JSON.parse(new TextDecoder().decode(exportedFiles[0]?.content))
	).toStrictEqual({
		a: "value1",
		b: "value2",
		c: "value3",
		d: "value4",
	});
});

const mockPluginAst: InlangPlugin = {
	key: "mock",
	exportFiles: async ({ bundles, messages, variants }) => {
		return [
			{
				locale: "every",
				name: "x.json",
				content: new TextEncoder().encode(
					JSON.stringify({ bundles, messages, variants })
				),
			},
		];
	},
	importFiles: async ({ files }) => {
		let bundles: any[] = [];
		let messages: any[] = [];
		let variants: any[] = [];
		for (const file of files) {
			const parsed = JSON.parse(new TextDecoder().decode(file.content));
			bundles = [...bundles, ...parsed.bundles];
			messages = [...messages, ...parsed.messages];
			variants = [...variants, ...parsed.variants];
		}
		return { bundles, messages, variants };
	},
};

// a simple mock plugin to test roundtrips
//
// purposefully not imported a real plugin
// to keep the interdepenedencies low and
// increase maintainability
const mockPluginSimple: InlangPlugin = {
	key: "mock",
	exportFiles: async ({ messages, variants }) => {
		const jsons: any = {};
		for (const message of messages) {
			const key = message.bundleId;
			const value = (
				variants.find((v) => v.messageId === message.id)?.pattern[0] as Text
			).value;
			if (!jsons[message.locale]) {
				jsons[message.locale] = {};
			}
			jsons[message.locale][key] = value;
		}
		return Object.entries(jsons).map(([locale, json]) => ({
			locale,
			name: locale + ".json",
			content: new TextEncoder().encode(JSON.stringify(json)),
		}));
	},
	importFiles: async ({ files }) => {
		const bundles: BundleImport[] = [];
		const messages: MessageImport[] = [];
		const variants: VariantImport[] = [];
		for (const file of files) {
			const parsed = JSON.parse(new TextDecoder().decode(file.content));
			for (const key in parsed) {
				bundles.push({
					id: key,
					declarations: [],
				});
				messages.push({
					bundleId: key,
					locale: file.locale,
					selectors: [],
				});
				variants.push({
					messageBundleId: key,
					messageLocale: file.locale,
					matches: [],
					pattern: [
						{
							type: "text",
							value: parsed[key],
						},
					],
				});
			}
		}
		return {
			bundles,
			messages,
			variants,
		};
	},
};
