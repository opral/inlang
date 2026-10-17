import { expect, test } from "vitest";
import {
	loadProjectFromDirectory,
	saveProjectToDirectory,
	selectBundleNested,
	type InlangPlugin,
} from "@inlang/sdk";
import { Volume } from "memfs";
import { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";

test("loads and saves catalogs whose paths repeat the locale placeholder", async () => {
	const volume = Volume.fromJSON({
		"/repo/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [],
			[PLUGIN_KEY]: { pathPattern: "./locales/{locale}/{locale}.json" },
		}),
		"/repo/locales/en/en.json": JSON.stringify({ greeting: "Hello" }),
		"/repo/locales/de/de.json": JSON.stringify({ greeting: "Hallo" }),
	});
	const project = await loadProjectFromDirectory({
		path: "/repo/project.inlang",
		fs: volume as any,
		providePlugins: [plugin as InlangPlugin],
	});

	try {
		expect(await project.errors.get()).toEqual([]);
		const bundles = await selectBundleNested(project.db).execute();
		expect(bundles).toHaveLength(1);
		expect(bundles[0]?.id).toBe("greeting");
		expect(
			bundles[0]?.messages
				.map((message) => ({
					locale: message.locale,
					pattern: message.variants[0]?.pattern,
				}))
				.sort((a, b) => a.locale.localeCompare(b.locale))
		).toEqual([
			{ locale: "de", pattern: [{ type: "text", value: "Hallo" }] },
			{ locale: "en", pattern: [{ type: "text", value: "Hello" }] },
		]);

		await saveProjectToDirectory({
			path: "/repo/project.inlang",
			fs: volume.promises as any,
			project,
		});
		expect(
			JSON.parse(
				volume.readFileSync("/repo/locales/en/en.json", "utf-8") as string
			)
		).toMatchObject({ greeting: "Hello" });
		expect(
			JSON.parse(
				volume.readFileSync("/repo/locales/de/de.json", "utf-8") as string
			)
		).toMatchObject({ greeting: "Hallo" });
	} finally {
		await project.close();
	}
}, 30_000);
