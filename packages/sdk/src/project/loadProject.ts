import {
	parseBundleDescriptions,
	readBundleDescriptions,
	applyBundleDescriptions,
	syncBundleDescriptions,
} from "./bundleDescriptions.js";
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
	let pendingSettingsRead: Promise<Uint8Array> | undefined;

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
				// Rendering many messages can request the same settings concurrently.
				// Share only the pending read so subsequent calls still see SQL updates.
				if (!pendingSettingsRead) {
					const read = readLixFile(args.lix, "/settings.json").finally(() => {
						if (pendingSettingsRead === read) pendingSettingsRead = undefined;
					});
					pendingSettingsRead = read;
				}
				const file = await pendingSettingsRead;
				// Parse for each caller so mutable settings are never shared.
				return withLanguageTagToLocaleMigration(
					JSON.parse(new TextDecoder().decode(file))
				);
			},
			set: async (newSettings) => {
				const cloned = JSON.parse(JSON.stringify(newSettings));
				cloned.languageTags = cloned.locales;
				cloned.sourceLanguageTag = cloned.baseLocale;

				// A getter issued after this write must not join a preceding read.
				pendingSettingsRead = undefined;
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
		importFiles: async ({ files, pluginKey, allowPartialImport }) => {
			files = files.map((file) => ({
				...file,
				toBeImportedFilesMetadata:
					file.toBeImportedFilesMetadata ?? file.metadata,
			}));
			const settingsFile = await readLixFile(args.lix, "/settings.json");

			const settings = JSON.parse(
				new TextDecoder().decode(settingsFile)
			) as ProjectSettings;

			const companion = files.find(
				(file) => file.toBeImportedFilesMetadata?.inlangDescriptions
			);
			const previous = companion
				? await readBundleDescriptions({ lix: args.lix })
				: new Map<string, string>();
			const descriptions = companion
				? parseBundleDescriptions(companion.content)
				: undefined;
			const resourceFiles = files.filter(
				(file) => !file.toBeImportedFilesMetadata?.inlangDescriptions
			);
			if (resourceFiles.length > 0 || !companion) {
				await importFiles({
					files: resourceFiles,
					allowPartialImport,
					pluginKey,
					settings,
					plugins,
					db,
					descriptionImport:
						descriptions && companion
							? { next: descriptions, previous, content: companion.content }
							: undefined,
				});
			} else if (descriptions && companion) {
				await applyBundleDescriptions({ db }, descriptions, previous, {
					content: companion.content,
				});
			}
		},
		exportFiles: async ({ pluginKey, files }) => {
			const settingsFile = await readLixFile(args.lix, "/settings.json");

			const settings = JSON.parse(
				new TextDecoder().decode(settingsFile)
			) as ProjectSettings;

			const companion = await syncBundleDescriptions(
				{
					db,
					lix: args.lix,
					settings: { get: async () => settings, set: async () => {} },
					plugins: { get: async () => plugins },
				},
				{ pluginKey, persist: false }
			);
			const resources = (
				await exportFiles({
					pluginKey,
					db,
					settings,
					// TODO don't use global state, might be stale
					plugins,
					files,
				})
			).map((output) => ({ ...output, pluginKey }));
			return companion ? [...resources, companion] : resources;
		},
		close: async () => {
			await db.destroy();
			if (args.closeLixOnClose ?? true) {
				await args.lix.close();
			}
		},
		toBlob: async () => await projectToBlob(args.lix),
		lix: args.lix,
	};
}

async function readLixId(lix: Lix): Promise<string> {
	const row = await lix.queryOne(
		"SELECT value FROM lix_key_value WHERE key = 'lix_id'"
	);
	const id = row?.value;
	if (typeof id !== "string") throw new Error("Missing Lix id");
	return id;
}

async function readLixFile(lix: Lix, path: string): Promise<Uint8Array> {
	const row = await lix.queryOne<{ content: Uint8Array }>(
		"SELECT content FROM lix_file WHERE path = $1",
		[path]
	);
	const data = row?.content;
	if (!data) throw new Error(`Missing project file: ${path}`);
	return data;
}
