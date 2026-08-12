import type { Lix } from "@lix-js/sdk";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import { initDb } from "../database/initDb.js";
import {
	importPlugins,
	type PreprocessPluginBeforeImportFunction,
} from "../plugin/importPlugins.js";
import type { InlangProject } from "./api.js";
import { withLanguageTagToLocaleMigration } from "../migrations/v2/withLanguageTagToLocaleMigration.js";
import { importFiles } from "../import-export/importFiles.js";
import { exportFiles } from "../import-export/exportFiles.js";
import { projectToBlob } from "./snapshot.js";
import { withInlangLixDb } from "../lix/withDb.js";

/**
 * Common load project logic.
 */
export async function loadProject(args: {
	lix: Lix;
	/** Internal lifecycle option for Lix instances owned by the caller. */
	closeLixOnClose?: boolean;
	/**
	 * Provide plugins to the project.
	 *
	 * This is useful for testing or providing plugins that are
	 * app specific. Keep in mind that provided plugins
	 * are not shared with other instances.
	 */
	providePlugins?: InlangPlugin[];
	/**
	 * Function that preprocesses the plugin before importing it.
	 *
	 * The callback can be used to process plugins as needed in the
	 * environment of the app. For example, Sherlock uses this to convert
	 * ESM, which all inlang plugins are written in, to CJS which Sherlock
	 * runs in.
	 *
	 * @example
	 *   const project = await loadProject({ preprocessPluginBeforeImport: (moduleText) => convertEsmToCjs(moduleText) })
	 *
	 */
	preprocessPluginBeforeImport?: PreprocessPluginBeforeImportFunction;
}): Promise<InlangProject> {
	const db = initDb({ lix: args.lix });

	const settingsFile = await readLixFile(args.lix, "/settings.json");

	const settings = withLanguageTagToLocaleMigration(
		JSON.parse(new TextDecoder().decode(settingsFile)) as ProjectSettings
	);

	const importedPlugins = await importPlugins({
		settings,
		lix: args.lix,
		preprocessPluginBeforeImport: args.preprocessPluginBeforeImport,
	});

	const plugins = [...(args.providePlugins ?? []), ...importedPlugins.plugins];
	const inlangLix = withInlangLixDb({ lix: args.lix });

	// const state = createProjectState({
	// 	...args,
	// 	settings,
	// });

	return {
		db,
		id: {
			get: async () => await readLixId(args.lix),
		},
		settings: {
			get: async () => {
				const file = await readLixFile(args.lix, "/settings.json");
				return withLanguageTagToLocaleMigration(
					JSON.parse(new TextDecoder().decode(file))
				);
			},
			set: async (newSettings) => {
				const cloned = JSON.parse(JSON.stringify(newSettings));
				cloned.languageTags = cloned.locales;
				cloned.sourceLanguageTag = cloned.baseLocale;

				await args.lix.execute(
					"UPDATE lix_file SET content = $1 WHERE path = $2",
					[
						new TextEncoder().encode(JSON.stringify(cloned, undefined, 2)),
						"/settings.json",
					]
				);
			},
		},
		plugins: {
			get: async () => plugins,
		},
		errors: {
			get: async () => [...importedPlugins.errors],
		},
		// errors: state.errors,
		importFiles: async ({ files, pluginKey }) => {
			const settingsFile = await readLixFile(args.lix, "/settings.json");

			const settings = JSON.parse(
				new TextDecoder().decode(settingsFile)
			) as ProjectSettings;

			return await importFiles({
				files,
				pluginKey,
				settings,
				// TODO don't use global state, might be stale
				plugins,
				db,
			});
		},
		exportFiles: async ({ pluginKey }) => {
			const settingsFile = await readLixFile(args.lix, "/settings.json");

			const settings = JSON.parse(
				new TextDecoder().decode(settingsFile)
			) as ProjectSettings;

			return (
				await exportFiles({
					pluginKey,
					db,
					settings,
					// TODO don't use global state, might be stale
					plugins,
				})
			).map((output) => ({ ...output, pluginKey }));
		},
		close: async () => {
			await db.destroy();
			if (args.closeLixOnClose ?? true) {
				await args.lix.close();
			}
		},
		toBlob: async () => await projectToBlob(args.lix),
		lix: inlangLix,
	};
}

async function readLixId(lix: Lix): Promise<string> {
	const result = await lix.execute(
		"SELECT value FROM lix_key_value WHERE key = 'lix_id'"
	);
	const id = result.rows[0]?.value("value").toJS();
	if (typeof id !== "string") throw new Error("Missing Lix id");
	return id;
}

async function readLixFile(lix: Lix, path: string): Promise<Uint8Array> {
	const result = await lix.execute(
		"SELECT content FROM lix_file WHERE path = $1",
		[path]
	);
	const data = result.rows[0]?.value("content").asBytes();
	if (!data) throw new Error(`Missing project file: ${path}`);
	return data;
}
