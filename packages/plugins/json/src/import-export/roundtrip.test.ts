import { expect, test } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { plugin } from "../plugin.js";
import { exportFiles } from "./exportFiles.js";
import { importFiles } from "./importFiles.js";

test("imports and exports generic JSON while preserving nested and dotted keys", async () => {
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({
						title: "Hello {name}",
						nested: { body: "Welcome" },
						"a.": { b: "Keep dotted path segments" },
						"flat.dotted": "Stay flat",
						empty: "",
					})
				),
			},
		],
	});

	expect(imported.bundles).toEqual([
		{
			id: "title",
			declarations: [{ type: "input-variable", name: "name" }],
		},
		{ id: "nested.body", declarations: [] },
		{ id: "a..b", declarations: [] },
		{ id: "flat.dotted", declarations: [] },
		{ id: "empty", declarations: [] },
	]);
	expect(imported.variants[0]?.pattern).toEqual([
		{ type: "text", value: "Hello " },
		{ type: "expression", arg: { type: "variable-reference", name: "name" } },
	]);

	const exported = await exportImported(imported);
	expect(parseFile(exported[0]!)).toEqual({
		title: "Hello {name}",
		nested: { body: "Welcome" },
		"a.": { b: "Keep dotted path segments" },
		"flat.dotted": "Stay flat",
		empty: "",
	});
});

test("keeps literal dotted and nested keys distinct through SDK import", async () => {
	const expected = {
		"a.b": "Flat",
		a: { b: "Nested" },
	};
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				"plugin.inlang.json": {
					pathPattern: "./{locale}.json",
				},
			},
		}),
		providePlugins: [plugin as any],
	});

	try {
		const files = [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(expected)),
			},
		];
		await project.importFiles({
			pluginKey: plugin.key,
			files,
		});
		await project.importFiles({ pluginKey: plugin.key, files });

		const messages = await project.db
			.selectFrom("inlang_message")
			.selectAll()
			.execute();
		const variants = await project.db
			.selectFrom("inlang_variant")
			.selectAll()
			.execute();
		expect(messages).toHaveLength(2);
		expect(variants).toHaveLength(2);
		expect(new Set(variants.map((variant) => variant.message_id))).toEqual(
			new Set(messages.map((message) => message.id))
		);

		const [file] = await project.exportFiles({ pluginKey: plugin.key });
		expect(parseFile(file!)).toEqual(expected);
	} finally {
		await project.close();
	}
});

test("uses colon-delimited legacy bundle IDs for namespaces", async () => {
	const settings = {
		"plugin.inlang.json": {
			pathPattern: {
				common: "./messages/{languageTag}/common.json",
				auth: "./messages/{languageTag}/auth.json",
			},
		},
	};
	const imported = await importFiles({
		settings: settings as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({ header: { title: "Welcome" } })
				),
				toBeImportedFilesMetadata: { namespace: "common" },
			},
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({ signIn: "Sign in" })
				),
				toBeImportedFilesMetadata: { namespace: "auth" },
			},
		],
	});

	expect(imported.bundles.map((bundle) => bundle.id)).toEqual([
		"common:header.title",
		"auth:signIn",
	]);

	const exported = await exportImported(imported, settings);
	const common = exported.find((file) => file.metadata?.namespace === "common");
	const auth = exported.find((file) => file.metadata?.namespace === "auth");
	expect(common?.metadata).toEqual({ namespace: "common" });
	expect(parseFile(common!)).toEqual({ header: { title: "Welcome" } });
	expect(auth?.metadata).toEqual({ namespace: "auth" });
	expect(parseFile(auth!)).toEqual({ signIn: "Sign in" });
});

test("uses the first legacy namespace for newly-created unprefixed bundles", async () => {
	const exported = await exportFiles({
		settings: {
			"plugin.inlang.json": {
				pathPattern: {
					common: "./messages/{locale}/common.json",
					auth: "./messages/{locale}/auth.json",
				},
			},
		} as any,
		bundles: [{ id: "new.message", declarations: [] }] as any,
		messages: [
			{
				id: "message-1",
				bundleId: "new.message",
				locale: "en",
				selectors: [],
			},
		] as any,
		variants: [
			{
				id: "variant-1",
				messageId: "message-1",
				matches: [],
				pattern: [{ type: "text", value: "New message" }],
			},
		] as any,
	});

	expect(exported).toHaveLength(1);
	expect(exported[0]?.metadata).toEqual({ namespace: "common" });
	expect(parseFile(exported[0]!)).toEqual({ "new.message": "New message" });
});

test("supports one-sided variable-reference patterns", async () => {
	const settings = {
		"plugin.inlang.json": {
			pathPattern: "./messages/{locale}.json",
			variableReferencePattern: ["@"],
		},
	};
	const imported = await importFiles({
		settings: settings as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({ greeting: "Hello @name" })
				),
			},
		],
	});

	expect(imported.variants[0]?.pattern).toEqual([
		{ type: "text", value: "Hello " },
		{ type: "expression", arg: { type: "variable-reference", name: "name" } },
	]);
	expect(parseFile((await exportImported(imported, settings))[0]!)).toEqual({
		greeting: "Hello @name",
	});
});

test("uses the import fallback for an empty variable-reference pattern", async () => {
	const settings = {
		"plugin.inlang.json": {
			pathPattern: "./messages/{locale}.json",
			variableReferencePattern: [],
		},
	};
	const imported = await importFiles({
		settings: settings as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({ greeting: "Hello {name" })
				),
			},
		],
	});

	expect(parseFile((await exportImported(imported, settings))[0]!)).toEqual({
		greeting: "Hello {name",
	});
});

test("rejects constructs generic JSON cannot represent", async () => {
	await expect(
		exportFiles({
			settings: {} as any,
			bundles: [{ id: "message", declarations: [] }] as any,
			messages: [
				{
					id: "message-1",
					bundleId: "message",
					locale: "en",
					selectors: [{ type: "variable-reference", name: "count" }],
				},
			] as any,
			variants: [] as any,
		})
	).rejects.toThrow(
		"Selectors, matches, and multiple variants are not supported"
	);

	await expect(
		exportFiles({
			settings: {} as any,
			bundles: [{ id: "message", declarations: [] }] as any,
			messages: [
				{
					id: "message-1",
					bundleId: "message",
					locale: "en",
					selectors: [],
				},
			] as any,
			variants: [
				{
					id: "variant-1",
					messageId: "message-1",
					matches: [{ type: "literal-match", key: "count", value: "one" }],
					pattern: [{ type: "text", value: "One message" }],
				},
			] as any,
		})
	).rejects.toThrow(
		"Selectors, matches, and multiple variants are not supported"
	);
});

async function exportImported(
	imported: Awaited<ReturnType<typeof importFiles>>,
	settings: Record<string, unknown> = {}
) {
	return exportFiles({
		settings: settings as any,
		bundles: imported.bundles as any,
		messages: imported.messages as any,
		variants: imported.variants as any,
	});
}

function parseFile(file: { content: Uint8Array }) {
	return JSON.parse(new TextDecoder().decode(file.content));
}
