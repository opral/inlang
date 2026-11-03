import { expect, test } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { InlangPlugin } from "../plugin/schema.js";
import { loadProjectFromDirectory } from "./loadProjectFromDirectory.js";
import { saveProjectToDirectory } from "./saveProjectToDirectory.js";

const encode = (value: unknown) =>
	new TextEncoder().encode(JSON.stringify(value));
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [] };
const native: InlangPlugin = {
	key: "test.native-guidance",
	supportsBundleDescriptions: true,
	toBeImportedFiles: ({ settings }) =>
		settings.locales.map((locale) => ({ locale, path: `./${locale}.json` })),
	importFiles: ({ files, settings }) => {
		const bundles = new Map(),
			messages = [],
			variants = [];
		for (const file of files) {
			const value = JSON.parse(new TextDecoder().decode(file.content));
			const bundle = bundles.get("save") ?? { id: "save" };
			if (file.locale === settings.baseLocale)
				bundle.description = value.description ?? null;
			bundles.set("save", bundle);
			messages.push({ bundleId: "save", locale: file.locale });
			variants.push({
				messageBundleId: "save",
				messageLocale: file.locale,
				pattern: [{ type: "text" as const, value: value.text }],
			});
		}
		return { bundles: [...bundles.values()], messages, variants };
	},
	exportFiles: ({ bundles, messages, variants, settings }) =>
		messages.map((message) => ({
			name: `${message.locale}.json`,
			locale: message.locale,
			content: encode({
				text: variants
					.find((variant) => variant.messageId === message.id)!
					.pattern.map((part) => (part.type === "text" ? part.value : ""))
					.join(""),
				...(message.locale === settings.baseLocale && bundles[0]?.description
					? { description: bundles[0].description }
					: {}),
			}),
		})),
};

test("changing a loaded project's base locale and saving moves canonical guidance before directory reopen", async () => {
	const fs = createFsFromVolume(
		Volume.fromJSON({
			"/repo/project.inlang/settings.json": JSON.stringify(settings),
			"/repo/en.json": JSON.stringify({
				text: "Save",
				description: "Save the document",
			}),
			"/repo/de.json": JSON.stringify({ text: "Speichern" }),
		})
	);
	const load = () =>
		loadProjectFromDirectory({
			path: "/repo/project.inlang",
			fs: fs as any,
			providePlugins: [native],
		});
	let project = await load();
	try {
		await project.settings.set({ ...settings, baseLocale: "de" });
		expect(
			(
				await project.db
					.selectFrom("inlang_bundle")
					.select("description")
					.executeTakeFirst()
			)?.description
		).toBe("Save the document");
		await saveProjectToDirectory({
			project,
			path: "/repo/project.inlang",
			fs: fs as any,
		});
		expect(
			JSON.parse(fs.readFileSync("/repo/de.json", "utf8") as string).description
		).toBe("Save the document");
		await project.close();
		project = await load();
		expect(
			(
				await project.db
					.selectFrom("inlang_bundle")
					.select("description")
					.executeTakeFirst()
			)?.description
		).toBe("Save the document");
	} finally {
		await project.close();
	}
});
