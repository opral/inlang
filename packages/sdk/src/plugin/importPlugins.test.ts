import { test, expect, vi } from "vitest";
import { importPlugins } from "./importPlugins.js";
import { PluginImportError } from "./errors.js";
import { openLix } from "@lix-js/sdk";

test("it should preprocess a plugin", async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		text: vi.fn().mockResolvedValue("export default { key: 'mock' }"),
	});

	const lix = await openLix();
	const result = await importPlugins({
		lix,
		settings: {
			baseLocale: "en",
			locales: ["en"],
			modules: ["https://mock.com/module.js"],
		},
		preprocessPluginBeforeImport: async (moduleText) => {
			return moduleText.replace("mock", "preprocessed");
		},
	});

	expect(result.plugins.length).toBe(1);
	expect(result.errors.length).toBe(0);
	expect(result.plugins[0]?.key).toBe("preprocessed");
});

test("if a fetch fails, a plugin import error is expected", async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		statusText: "HTTP 404",
	});
	const lix = await openLix();

	const result = await importPlugins({
		lix,
		settings: {
			baseLocale: "en",
			locales: ["en"],
			modules: ["https://mock.com/module.js"],
		},
	});

	expect(global.fetch).toHaveBeenCalled();
	expect(result.plugins.length).toBe(0);
	expect(result.errors.length).toBe(1);
	expect(result.errors[0]).toBeInstanceOf(PluginImportError);
});

test("if a network error occurs during fetch, a plugin import error is expected", async () => {
	const lix = await openLix();
	global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

	const result = await importPlugins({
		lix,
		settings: {
			baseLocale: "en",
			locales: ["en"],
			modules: ["https://example.com/non-existent-paraglide-plugin.js"],
		},
	});

	expect(global.fetch).toHaveBeenCalled();
	expect(result.plugins.length).toBe(0);
	expect(result.errors.length).toBe(1);
	expect(result.errors[0]).toBeInstanceOf(PluginImportError);
	expect(result.errors[0]?.message).toContain(
		"https://example.com/non-existent-paraglide-plugin.js"
	);
	expect(result.errors[0]?.message).toContain("Network error");
});

test("it should filter message lint rules for legacy reasons", async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		text: vi
			.fn()
			.mockResolvedValue("export default { id: 'messageLintRule.something' }"),
	});

	const lix = await openLix();

	const result = await importPlugins({
		lix,
		settings: {
			baseLocale: "en",
			locales: ["en"],
			modules: ["https://mock.com/module.js"],
		},
	});

	expect(result.plugins.length).toBe(0);
	expect(result.errors.length).toBe(0);
});

// more tests are found in cache.test.ts
test("cache should work", async () => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
	});

	const mockModulePath = "https://mock.com/module.js";
	const mockModuleCachePath = "/cache/plugins/31i1etp0l413h";

	const lix = await openLix();

	await lix.execute("INSERT INTO lix_file (path, content) VALUES ($1, $2)", [
		mockModuleCachePath,
		new TextEncoder().encode("export default { key: 'mock' }"),
	]);

	const result = await importPlugins({
		lix,
		settings: {
			baseLocale: "en",
			locales: ["en"],
			modules: [mockModulePath],
		},
	});

	expect(result.errors).lengthOf(0);
	expect(result.plugins).lengthOf(1);
	expect(result.plugins[0]?.key).toBe("mock");
});
