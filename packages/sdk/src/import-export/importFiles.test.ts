import { test, expect } from "vitest";
import { importFiles } from "./importFiles.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { newProject } from "../project/newProject.js";
import type { InlangPlugin } from "../plugin/schema.js";

test("batch imports an unambiguous fresh project", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "mock-bundle" }],
			messages: [
				{ bundleId: "mock-bundle", locale: "en" },
				{ bundleId: "mock-bundle", locale: "de" },
			],
			variants: [
				{ messageBundleId: "mock-bundle", messageLocale: "en" },
				{ messageBundleId: "mock-bundle", messageLocale: "de" },
			],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db.selectFrom("message").selectAll().execute();
	const variants = await project.db.selectFrom("variant").selectAll().execute();

	expect(messages).toHaveLength(2);
	expect(variants).toHaveLength(2);
	expect(new Set(variants.map((variant) => variant.messageId))).toEqual(
		new Set(messages.map((message) => message.id))
	);
});

test("it should insert a message as is if the id is provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "mock-bundle" }],
			messages: [{ id: "alfa23", bundleId: "mock-bundle", locale: "en" }],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db.selectFrom("message").selectAll().execute();

	expect(messages.length).toBe(1);
	expect(messages[0]?.id).toBe("alfa23");
});

test("it should match an existing message if the id is not provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db.insertInto("bundle").values({ id: "mock-bundle" }).execute();
	await project.db
		.insertInto("message")
		.values({
			id: "alfa23",
			bundleId: "mock-bundle",
			locale: "en",
			selectors: [],
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [
				{
					bundleId: "mock-bundle",
					locale: "en",
					selectors: [{ type: "variable-reference", name: "platform" }],
				},
			],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db.selectFrom("message").selectAll().execute();

	expect(messages.length).toBe(1);
	expect(messages[0]?.id).toBe("alfa23");
	expect(messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "platform" },
	]);
});

test("it should create a bundle for a message if the bundle does not exist to avoid foreign key conflicts and enable partial imports", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [{ bundleId: "non-existent-bundle", locale: "en" }],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const bundles = await project.db.selectFrom("bundle").selectAll().execute();

	expect(bundles.length).toBe(1);
	expect(bundles[0]?.id).toBe("non-existent-bundle");
});

test("it should insert a variant as is if the id is provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db.insertInto("bundle").values({ id: "mock-bundle" }).execute();
	await project.db
		.insertInto("message")
		.values({
			id: "mock-message",
			bundleId: "mock-bundle",
			locale: "en",
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ id: "variant-id-23", messageId: "mock-message" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const variants = await project.db.selectFrom("variant").selectAll().execute();

	expect(variants.length).toBe(1);
	expect(variants[0]?.id).toBe("variant-id-23");
});

test("it should match an existing variant if the id is not provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db.insertInto("bundle").values({ id: "mock-bundle" }).execute();
	await project.db
		.insertInto("message")
		.values({
			id: "mock-message",
			bundleId: "mock-bundle",
			locale: "en",
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ messageBundleId: "mock-bundle", messageLocale: "en" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const variants = await project.db.selectFrom("variant").selectAll().execute();

	expect(variants.length).toBe(1);
	expect(variants[0]?.messageId).toBe("mock-message");
	expect(variants[0]?.id).toBeDefined();
});

test("it should create a message for a variant if the message does not exist to avoid foreign key conflicts and enable partial imports", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db.insertInto("bundle").values({ id: "mock-bundle" }).execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ messageBundleId: "mock-bundle", messageLocale: "en" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const bundles = await project.db.selectFrom("bundle").selectAll().execute();
	const messages = await project.db.selectFrom("message").selectAll().execute();
	const variants = await project.db.selectFrom("variant").selectAll().execute();

	expect(bundles.length).toBe(1);
	expect(messages.length).toBe(1);
	expect(variants.length).toBe(1);

	expect(messages[0]?.bundleId).toBe("mock-bundle");
	expect(messages[0]?.locale).toBe("en");
	expect(variants[0]?.messageId).toBe(messages[0]?.id);
});
