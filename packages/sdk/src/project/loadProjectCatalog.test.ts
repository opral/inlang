import { afterEach, expect, test, vi } from "vitest";
import { Volume } from "memfs";
import type nodeFs from "node:fs";
import { loadProjectCatalog } from "./loadProjectCatalog.js";
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
	const result = await loadProjectCatalog({
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
	const result = await loadProjectCatalog({
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

test("preserves typed read diagnostics and requested file order", async () => {
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
	const result = await loadProjectCatalog({
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
	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toBeInstanceOf(ResourceFileImportError);
	expect((result.diagnostics[0] as ResourceFileImportError).path).toBe(
		"./denied.json"
	);
	expect(
		importFiles.mock.calls[0]![0].files.map((file) => file.locale)
	).toEqual(["en", "de"]);
});

test("preprocesses local plugins and reports failed and deprecated modules", async () => {
	const fs = filesystem(
		{ "/local.js": "REPLACE", "/lint.js": "messageLintRule" },
		{ ...settings, modules: ["./local.js", "./absent.js", "./lint.js"] }
	);
	const preprocess = vi.fn(async () => pluginSource("local"));
	const result = await loadProjectCatalog({
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
		(await loadProjectCatalog({ path: "/project.inlang", fs })).bundles.map(
			(bundle) => bundle.id
		)
	).toEqual(["network"]);
	expect(
		(await loadProjectCatalog({ path: "/project.inlang", fs })).bundles.map(
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
	const result = await loadProjectCatalog({
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
	const result = await loadProjectCatalog({
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
		loadProjectCatalog({
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
		(await loadProjectCatalog(args)).bundles.map((bundle) => bundle.id)
	).toEqual(["cached-online"]);
	expect(
		await fs.promises.readFile(`/project.inlang${pluginCachePath(uri)}`, "utf8")
	).toBe("SOURCE");
	expect(
		(await loadProjectCatalog(args)).bundles.map((bundle) => bundle.id)
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
		loadProjectCatalog({ path: "/project.inlang", fs, writePluginCache: true })
	).rejects.toMatchObject({
		name: "ResourceFileImportError",
		cause,
		path: `/project.inlang${pluginCachePath(uri)}`,
	});
});
