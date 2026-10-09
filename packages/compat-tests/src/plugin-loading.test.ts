/**
 * Projects on the published SDK load plugins from `settings.modules` URLs
 * with a major range (`@inlang/plugin-message-format@4/dist/index.js`), so
 * they get the next plugin release as soon as it is on npm.
 */
import { describe, expect, test } from "vitest";
import {
	type PluginKey,
	fetchedModules,
	importPlugin,
	loadFromBlob,
	newProjectBlob,
	pluginSource,
	plugins,
	servePlugins,
} from "./harness.js";

const keys = Object.keys(plugins) as PluginKey[];

const shape = (plugin: Record<string, unknown>) =>
	Object.fromEntries(
		[
			"key",
			"settingsSchema",
			"toBeImportedFiles",
			"importFiles",
			"exportFiles",
			"loadMessages",
			"saveMessages",
			"meta",
		].map((name) => [name, typeof plugin[name]])
	);

describe.each(keys)("%s", (key) => {
	test("the current plugin is a self-contained module, as the published one", () => {
		const source = pluginSource(key, "current");
		// a module loaded from a data: URL can't resolve bare imports
		expect(source).not.toMatch(/^\s*import\s[^(]*from\s*["']/m);
		expect(source).not.toMatch(/^\s*export\s[^;]*from\s*["']/m);
		expect(source).not.toMatch(/require\(["']@inlang\/sdk/);
	});

	test("the current plugin has the API of the published one", async () => {
		const published = await importPlugin(key, "published");
		const current = await importPlugin(key, "current");
		expect(current.key).toBe(published.key);
		expect(shape(current)).toEqual(shape(published));
	});

	test("the published SDK loads the current plugin from settings.modules", async () => {
		servePlugins("current");
		fetchedModules.length = 0;
		const project = await loadFromBlob(
			"published",
			await newProjectBlob("published", {
				baseLocale: "en",
				locales: ["en"],
				modules: [plugins[key].url],
			})
		);
		expect(fetchedModules).toEqual([`current ${plugins[key].url}`]);
		expect(await project.errors.get()).toEqual([]);
		expect((await project.plugins.get()).map((p: any) => p.key)).toEqual([key]);
		await project.close();
	});
});
