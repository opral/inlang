import { afterEach, expect, test, vi } from "vitest";
import { Volume } from "memfs";
import * as directoryPlugins from "./directoryPlugins.js";
import type nodeFs from "node:fs";
import {
	createCatalogLoader,
	type CreateCatalogLoaderArgs,
} from "./createCatalogLoader.js";

// Existing directory-loading parity checks exercise the first reset.
async function initialCatalog(args: CreateCatalogLoaderArgs) {
	const result = await createCatalogLoader(args).load();
	if (result.type !== "reset") throw new Error("Expected first load to reset");
	return result;
}
import {
	ResourceFileImportError,
	WarningDeprecatedLintRule,
} from "./directoryPlugins.js";
import type { InlangPlugin } from "../plugin/schema.js";
import { pluginCachePath } from "../plugin/cache.js";
import { createMessageV1 } from "../migrations/v2/createMessageV1.js";

vi.mock("@lix-js/sdk", async () => {
	const actual =
		await vi.importActual<typeof import("@lix-js/sdk")>("@lix-js/sdk");
	return {
		...actual,
		openLix: vi.fn(() => {
			throw new Error("Catalog loading must not open Lix");
		}),
	};
});
import { openLix } from "@lix-js/sdk";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
const settings = {
	baseLocale: "en",
	locales: ["en", "de"],
	modules: [] as string[],
};
const migrated = {
	...settings,
	sourceLanguageTag: "en",
	languageTags: ["en", "de"],
};
function filesystem(
	extra: Record<string, string> = {},
	config: unknown = settings
) {
	return Volume.fromJSON({
		"/project.inlang/settings.json": JSON.stringify(config),
		...extra,
	}) as unknown as typeof nodeFs;
}
const empty = () => ({ bundles: [], messages: [], variants: [] });
function importer(key = "test"): InlangPlugin {
	return {
		key,
		toBeImportedFiles: async () => [
			{ path: "./en.json", locale: "en", metadata: { namespace: "app" } },
		],
		importFiles: ({ files }) => ({
			bundles: [{ id: "greeting" }],
			messages: files.map((file) => ({
				bundleId: "greeting",
				locale: file.locale,
			})),
			variants: files.map((file) => ({
				messageBundleId: "greeting",
				messageLocale: file.locale,
				pattern: [
					{
						type: "text" as const,
						value: new TextDecoder().decode(file.content),
					},
				],
			})),
		}),
	};
}
const pluginSource = (key: string) =>
	`export default {key:${JSON.stringify(key)},importFiles(){return {bundles:[{id:${JSON.stringify(key)}}],messages:[],variants:[]}}}`;

test("loads a detached catalog without database initialization or filesystem writes", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const writes = vi.spyOn(fs.promises, "writeFile");
	const mkdir = vi.spyOn(fs.promises, "mkdir");
	const result = await initialCatalog({
		path: "/project.inlang",
		fs,
		providePlugins: [importer()],
	});
	expect(result.settings).toEqual(migrated);
	expect(result.diagnostics).toEqual([]);
	expect(result.bundles[0]?.messages[0]?.variants[0]?.pattern).toEqual([
		{ type: "text", value: "Hello" },
	]);
	expect(openLix).not.toHaveBeenCalled();
	expect(writes).not.toHaveBeenCalled();
	expect(mkdir).not.toHaveBeenCalled();
});

test("file discovery sees migrated settings while import receives raw settings and file metadata", async () => {
	const raw = {
		sourceLanguageTag: "en",
		languageTags: ["en", "de"],
		modules: [],
	};
	const discover = vi.fn<NonNullable<InlangPlugin["toBeImportedFiles"]>>(
		async () => [
			{ path: "./en.json", locale: "en", metadata: { namespace: "first" } },
			{ path: "./missing.json", locale: "de" },
		]
	);
	const importFiles = vi.fn<NonNullable<InlangPlugin["importFiles"]>>(() =>
		empty()
	);
	const fs = filesystem({ "/en.json": "{}" }, raw);
	const result = await initialCatalog({
		path: "/project.inlang",
		fs,
		providePlugins: [{ key: "test", toBeImportedFiles: discover, importFiles }],
	});
	expect(discover.mock.calls[0]![0]).toEqual({ settings: migrated });
	expect(importFiles.mock.calls[0]![0]).toEqual({
		settings: raw,
		files: [
			{
				locale: "en",
				content: expect.any(Uint8Array),
				toBeImportedFilesMetadata: { namespace: "first" },
			},
		],
	});
	expect(result.settings).toEqual(migrated);
	expect(result.diagnostics).toEqual([]);
});

test("unreadable resource files reject before importing an incomplete catalog", async () => {
	const fs = filesystem({ "/en.json": "first", "/de.json": "second" });
	const read = fs.promises.readFile.bind(fs.promises);
	vi.spyOn(fs.promises, "readFile").mockImplementation((async (
		path: string,
		options: any
	) => {
		if (path.endsWith("denied.json"))
			throw Object.assign(new Error("denied"), { code: "EACCES" });
		return read(path, options);
	}) as typeof fs.promises.readFile);
	const importFiles = vi.fn<NonNullable<InlangPlugin["importFiles"]>>(() =>
		empty()
	);
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [
			{
				key: "test",
				toBeImportedFiles: async () =>
					["en", "denied", "de"].map((locale) => ({
						path: `./${locale}.json`,
						locale,
					})),
				importFiles,
			},
		],
	});
	await expect(loader.load()).rejects.toMatchObject({
		errors: [expect.any(ResourceFileImportError)],
	});
	expect(importFiles).not.toHaveBeenCalled();
});

test("preprocesses local plugins and reports failed and deprecated modules", async () => {
	const fs = filesystem(
		{ "/local.js": "REPLACE", "/lint.js": "messageLintRule" },
		{ ...settings, modules: ["./local.js", "./absent.js", "./lint.js"] }
	);
	const preprocess = vi.fn(async () => pluginSource("local"));
	const result = await initialCatalog({
		path: "/project.inlang",
		fs,
		preprocessPluginBeforeImport: preprocess,
	});
	expect(preprocess).toHaveBeenCalledWith("REPLACE");
	expect(result.bundles.map((bundle) => bundle.id)).toEqual(["local"]);
	expect(result.diagnostics.map((error) => error.name)).toEqual([
		"PluginImportError",
		"WarningDeprecatedLintRule",
	]);
	expect(result.diagnostics[1]).toBeInstanceOf(WarningDeprecatedLintRule);
});

test("uses network first and existing plugin cache offline without writing it", async () => {
	const uri = "https://example.test/plugin.js";
	const fs = filesystem(
		{ [`/project.inlang${pluginCachePath(uri)}`]: pluginSource("cached") },
		{ ...settings, modules: [uri] }
	);
	const fetch = vi
		.fn()
		.mockResolvedValueOnce({ text: async () => pluginSource("network") })
		.mockRejectedValueOnce(new Error("offline"));
	vi.stubGlobal("fetch", fetch);
	const writes = vi.spyOn(fs.promises, "writeFile");
	expect(
		(await initialCatalog({ path: "/project.inlang", fs })).bundles.map(
			(bundle) => bundle.id
		)
	).toEqual(["network"]);
	expect(
		(await initialCatalog({ path: "/project.inlang", fs })).bundles.map(
			(bundle) => bundle.id
		)
	).toEqual(["cached"]);
	expect(writes).not.toHaveBeenCalled();
});

test("preserves first plugin precedence for duplicate keys and sequential upserts", async () => {
	const first = vi.fn(() => ({
		bundles: [{ id: "first" }],
		messages: [],
		variants: [],
	}));
	const second = vi.fn(() => ({
		bundles: [{ id: "second" }],
		messages: [],
		variants: [],
	}));
	const result = await initialCatalog({
		path: "/project.inlang",
		fs: filesystem(),
		providePlugins: [
			{ key: "same", importFiles: first },
			{ key: "same", importFiles: second },
		],
	});
	expect(first).toHaveBeenCalledTimes(2);
	expect(second).not.toHaveBeenCalled();
	expect(result.bundles.map((bundle) => bundle.id)).toEqual(["first"]);
});

test("supports legacy loadMessages through a read-only filesystem", async () => {
	const plugin: InlangPlugin = {
		key: "legacy",
		saveMessages: async () => {},
		loadMessages: async ({ nodeishFs }) => {
			expect(
				await nodeishFs.readFile("./legacy.txt", { encoding: "utf-8" })
			).toBe("legacy");
			await expect(nodeishFs.writeFile("./forbidden", "x")).rejects.toThrow(
				"does not permit filesystem writes"
			);
			return [createMessageV1("greeting", { en: "Hello", de: "Hallo" })];
		},
	};
	const result = await initialCatalog({
		path: "/project.inlang",
		fs: filesystem({ "/legacy.txt": "legacy" }),
		providePlugins: [plugin],
	});
	expect(
		result.bundles[0]?.messages.map((message) => message.locale).sort()
	).toEqual(["de", "en"]);
	expect(
		result.bundles[0]?.messages.flatMap((message) =>
			message.variants.map((variant) => variant.pattern)
		)
	).toEqual(
		expect.arrayContaining([
			[{ type: "text", value: "Hello" }],
			[{ type: "text", value: "Hallo" }],
		])
	);
	expect(openLix).not.toHaveBeenCalled();
});

test("rejects importer failures rather than falling back to a database", async () => {
	const failure = new Error("broken importer");
	await expect(
		initialCatalog({
			path: "/project.inlang",
			fs: filesystem(),
			providePlugins: [
				{
					key: "broken",
					importFiles: () => {
						throw failure;
					},
				},
			],
		})
	).rejects.toBe(failure);
	expect(openLix).not.toHaveBeenCalled();
});

test("opt-in cache writes preserve original source for later offline loads", async () => {
	const uri = "https://example.test/cache-option.js";
	const fs = filesystem({}, { ...settings, modules: [uri] });
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce({ text: async () => "SOURCE" })
			.mockRejectedValueOnce(new Error("offline"))
	);
	const preprocess = vi.fn(() => pluginSource("cached-online"));
	const args = {
		path: "/project.inlang",
		fs,
		writePluginCache: true,
		preprocessPluginBeforeImport: preprocess,
	};
	expect(
		(await initialCatalog(args)).bundles.map((bundle) => bundle.id)
	).toEqual(["cached-online"]);
	expect(
		await fs.promises.readFile(`/project.inlang${pluginCachePath(uri)}`, "utf8")
	).toBe("SOURCE");
	expect(
		(await initialCatalog(args)).bundles.map((bundle) => bundle.id)
	).toEqual(["cached-online"]);
	expect(preprocess).toHaveBeenNthCalledWith(2, "SOURCE");
});

test("opt-in cache write failures reject instead of becoming plugin diagnostics", async () => {
	const uri = "https://example.test/cache-denied.js";
	const fs = filesystem({}, { ...settings, modules: [uri] });
	const cause = Object.assign(new Error("cache denied"), { code: "EACCES" });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ text: async () => pluginSource("remote") })
	);
	vi.spyOn(fs.promises, "writeFile").mockRejectedValue(cause);
	await expect(
		initialCatalog({ path: "/project.inlang", fs, writePluginCache: true })
	).rejects.toMatchObject({
		name: "ResourceFileImportError",
		cause,
		path: `/project.inlang${pluginCachePath(uri)}`,
	});
});

function textOf(
	bundle: Awaited<ReturnType<typeof initialCatalog>>["bundles"][number]
) {
	return bundle.messages[0]?.variants[0]?.pattern;
}

test("emits complete changed bundles, additions and removals, ignoring ephemeral row IDs", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const plugin = importer();
	const imports = vi.spyOn(plugin, "importFiles");
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	const first = await loader.load();
	expect(first.type).toBe("reset");
	expect(await loader.load()).toEqual({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
	expect(imports).toHaveBeenCalledTimes(1);
	await fs.promises.writeFile("/en.json", "Changed");
	const changed = await loader.load();
	expect(changed.type).toBe("update");
	expect(changed.bundles.map((bundle) => bundle.id)).toEqual(["greeting"]);
	expect(textOf(changed.bundles[0]!)).toEqual([
		{ type: "text", value: "Changed" },
	]);
	expect(await loader.load()).toEqual({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
	await fs.promises.unlink("/en.json");
	const removed = await loader.load();
	// The importer still declares the bundle, but its missing locale is an update.
	expect(removed.type).toBe("update");
	expect(removed.bundles[0]?.messages).toEqual([]);
	plugin.importFiles = () => empty();
	expect((await loader.load()).type).toBe("reset");
});

test("replacing an import result reports added and deleted translation keys", async () => {
	const fs = filesystem({ "/en.json": "greeting" });
	const plugin: InlangPlugin = {
		key: "keys",
		toBeImportedFiles: async () => [{ path: "./en.json", locale: "en" }],
		importFiles: ({ files }) => ({
			bundles: files.map((file) => ({
				id: new TextDecoder().decode(file.content),
			})),
			messages: [],
			variants: [],
		}),
	};
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	await loader.load();
	await fs.promises.writeFile("/en.json", "farewell");
	expect(await loader.load()).toMatchObject({
		type: "update",
		bundles: [{ id: "farewell" }],
		removedBundleIds: ["greeting"],
	});
	await fs.promises.unlink("/en.json");
	expect(await loader.load()).toMatchObject({
		type: "update",
		bundles: [],
		removedBundleIds: ["farewell"],
	});
});

test("returned data cannot corrupt future resets or deltas", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [importer()],
	});
	const first = await loader.load();
	first.bundles[0]!.declarations = [];
	first.bundles[0]!.messages[0]!.variants[0]!.pattern = [];
	if (first.type === "reset") first.settings.locales.push("fr");
	expect(await loader.load()).toEqual({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
	await fs.promises.writeFile("/en.json", "Changed");
	expect(textOf((await loader.load()).bundles[0]!)).toEqual([
		{ type: "text", value: "Changed" },
	]);
});

test("settings and local plugin code changes reset the complete catalog", async () => {
	const fs = filesystem(
		{ "/local.js": pluginSource("first") },
		{ ...settings, modules: ["./local.js"] }
	);
	const loader = createCatalogLoader({ path: "/project.inlang", fs });
	expect(await loader.load()).toMatchObject({
		type: "reset",
		bundles: [{ id: "first" }],
	});
	expect((await loader.load()).type).toBe("update");
	await fs.promises.writeFile("/local.js", pluginSource("second"));
	expect(await loader.load()).toMatchObject({
		type: "reset",
		bundles: [{ id: "second" }],
	});
	await fs.promises.writeFile(
		"/project.inlang/settings.json",
		JSON.stringify({ ...settings, locales: ["en"], modules: ["./local.js"] })
	);
	expect(await loader.load()).toMatchObject({
		type: "reset",
		settings: { locales: ["en"] },
		bundles: [{ id: "second" }],
	});
});

test("a failed importer retains the last successful state and can recover", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const plugin = importer();
	const original = plugin.importFiles!;
	plugin.importFiles = (args) => {
		if (new TextDecoder().decode(args.files[0]!.content) === "INVALID")
			throw new Error("invalid message");
		return original(args);
	};
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	await loader.load();
	await fs.promises.writeFile("/en.json", "INVALID");
	await expect(loader.load()).rejects.toThrow("invalid message");
	await fs.promises.writeFile("/en.json", "Recovered");
	expect(await loader.load()).toMatchObject({
		type: "update",
		bundles: [{ id: "greeting" }],
	});
});

test("serializes concurrent loads and keeps independent loader state", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const plugin = importer();
	const imports = vi.spyOn(plugin, "importFiles");
	const a = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	const b = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	expect(
		(await Promise.all([a.load(), a.load(), b.load()])).map(
			(result) => result.type
		)
	).toEqual(["reset", "update", "reset"]);
	expect(imports).toHaveBeenCalledTimes(2);
});

test("resource errors do not advance the successful catalog", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [importer()],
	});
	await loader.load();
	const read = fs.promises.readFile.bind(fs.promises);
	const spy = vi.spyOn(fs.promises, "readFile").mockImplementation((async (
		path: string,
		options: any
	) => {
		if (path === "/en.json")
			throw Object.assign(new Error("denied"), { code: "EACCES" });
		return read(path, options);
	}) as typeof fs.promises.readFile);
	await expect(loader.load()).rejects.toThrow("EACCES");
	spy.mockRestore();
	expect(await loader.load()).toEqual({
		type: "update",
		bundles: [],
		removedBundleIds: [],
		diagnostics: [],
	});
});

test("file metadata is part of the import cache key, including undefined properties", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	let metadata: Record<string, any> = { scope: "one" };
	const plugin = importer();
	plugin.toBeImportedFiles = async () => [
		{ path: "./en.json", locale: "en", metadata },
	];
	const imports = vi.spyOn(plugin, "importFiles");
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	await loader.load();
	await loader.load();
	expect(imports).toHaveBeenCalledTimes(1);
	metadata = { scope: "one", extra: undefined };
	await loader.load();
	expect(imports).toHaveBeenCalledTimes(2);
	metadata = { scope: () => "function metadata" };
	await loader.load();
	await loader.load();
	expect(imports).toHaveBeenCalledTimes(4);
});

test("insertions do not re-emit bundles whose generated row IDs shifted", async () => {
	const fs = filesystem({ "/en.json": JSON.stringify({ z: "Hello" }) });
	const plugin: InlangPlugin = {
		key: "json",
		toBeImportedFiles: async () => [{ path: "./en.json", locale: "en" }],
		importFiles: ({ files }) => {
			const entries = Object.entries(
				JSON.parse(new TextDecoder().decode(files[0]!.content))
			) as [string, string][];
			return {
				bundles: entries.map(([id]) => ({ id })),
				messages: entries.map(([id]) => ({ bundleId: id, locale: "en" })),
				variants: entries.map(([id, value]) => ({
					messageBundleId: id,
					messageLocale: "en",
					pattern: [{ type: "text" as const, value }],
				})),
			};
		},
	};
	const loader = createCatalogLoader({
		path: "/project.inlang",
		fs,
		providePlugins: [plugin],
	});
	await loader.load();
	await fs.promises.writeFile(
		"/en.json",
		JSON.stringify({ a: "New", z: "Hello" })
	);
	expect(await loader.load()).toMatchObject({
		type: "update",
		bundles: [{ id: "a" }],
		removedBundleIds: [],
	});
});

test("fresh imported plugin identities reuse unchanged source and reset on source edits", async () => {
	const fs = filesystem({ "/en.json": "Hello" });
	let source = "version one";
	const imports = vi.fn(importer().importFiles!);
	vi.spyOn(directoryPlugins, "importLocalPlugins").mockImplementation(
		async () => ({
			errors: [],
			locallyImportedPlugins: [
				{
					...importer(),
					importFiles: (
						args: Parameters<NonNullable<InlangPlugin["importFiles"]>>[0]
					) => imports(args),
				},
			],
			pluginSources: [source],
		})
	);
	const loader = createCatalogLoader({ path: "/project.inlang", fs });
	expect((await loader.load()).type).toBe("reset");
	expect(await loader.load()).toMatchObject({ type: "update", bundles: [] });
	expect(imports).toHaveBeenCalledTimes(1);
	await fs.promises.writeFile("/en.json", "Changed");
	expect(await loader.load()).toMatchObject({
		type: "update",
		bundles: [{ id: "greeting" }],
	});
	source = "version two";
	expect((await loader.load()).type).toBe("reset");
});
