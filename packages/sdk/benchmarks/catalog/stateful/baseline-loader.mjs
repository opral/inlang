// Frozen pre-refactor loader from SDK commit 068061aae29ef3288e1634a053da49733495a77b.
// Benchmark fixture only; helpers are unchanged between both implementations.
import nodePath from "node:path";
import {
	createCatalogStore,
	createFreshCatalog,
} from "../../../dist/import-export/catalogRows.js";
import { withLanguageTagToLocaleMigration } from "../../../dist/migrations/v2/withLanguageTagToLocaleMigration.js";
import { fromMessageV1 } from "../../../dist/json-schema/old-v1-message/fromMessageV1.js";
import { pluginCachePath } from "../../../dist/plugin/cache.js";
import {
	PluginDoesNotImplementFunctionError,
	PluginImportError,
} from "../../../dist/plugin/errors.js";
import {
	categorizePlugins,
	importLocalPlugins,
	ResourceFileImportError,
} from "../../../dist/project/directoryPlugins.js";
import {
	absolutePathFromProject,
	withAbsolutePaths,
} from "../../../dist/project/path-helpers.js";
/**
 * Reads a directory project's translation catalog without opening a database.
 *
 * Uses the configured plugins and their ordinary import format. Plugins run in
 * the same order as directory project loading; row identities, property-based
 * upserts, and variant priority are resolved in memory. The result has no live
 * project, storage handle, watchers, or close operation.
 *
 * Generated message and variant IDs are opaque, ephemeral snapshot identities.
 * Use them only for references within this result; their format and stability
 * across loads or compared with a live project are not guaranteed. Explicit
 * plugin identities are retained, and bundle IDs remain the translation keys.
 *
 * Remote plugins use network-first loading with the directory's existing plugin
 * cache as a fallback. By default this API performs no filesystem writes.
 * `writePluginCache` opts into caching fetched plugin text for later offline
 * loads; it never updates project metadata. Cache-write failures reject. Resource files that do not exist are skipped; other read errors and
 * plugin-loading errors are returned in `diagnostics`. Importer errors reject.
 */
export async function loadProjectCatalog(args) {
	const rawSettings = JSON.parse(
		await args.fs.promises.readFile(
			nodePath.join(args.path, "settings.json"),
			"utf8"
		)
	);
	const settings = withLanguageTagToLocaleMigration(
		structuredClone(rawSettings)
	);
	const local = await importLocalPlugins({
		fs: args.fs,
		path: args.path,
		settings: rawSettings,
		preprocessPluginBeforeImport: args.preprocessPluginBeforeImport,
	});
	const remote = await importRemotePlugins(args, settings);
	const plugins = [
		...(args.providePlugins ?? []),
		...local.locallyImportedPlugins,
		...remote.plugins,
	];
	const diagnostics = [...local.errors, ...remote.errors];
	const { importExportPlugins, loadSavePlugins } = categorizePlugins(plugins);
	if (loadSavePlugins.length > 1) {
		throw new Error(
			"Max one loadMessages (found: " +
				loadSavePlugins.length +
				") and one saveMessages plugins (found: " +
				loadSavePlugins.length +
				") are allowed "
		);
	}
	let store;
	async function getStore() {
		if (!store) {
			const { v7 } = await import("uuid");
			store = createCatalogStore(v7);
		}
		return store;
	}
	for (const plugin of importExportPlugins) {
		const requested = plugin.toBeImportedFiles
			? await plugin.toBeImportedFiles({ settings: structuredClone(settings) })
			: [];
		// Promise.all preserves the plugin's file order and namespace metadata.
		const reads = await Promise.all(
			requested.map(async (file) => {
				try {
					return {
						file: {
							locale: file.locale,
							content: await args.fs.promises.readFile(
								absolutePathFromProject(args.path, file.path)
							),
							toBeImportedFilesMetadata: file.metadata,
						},
					};
				} catch (error) {
					return {
						error:
							error?.code === "ENOENT"
								? undefined
								: new ResourceFileImportError({
										cause: error,
										path: file.path,
									}),
					};
				}
			})
		);
		const files = [];
		for (const read of reads) {
			if (read.file) files.push(read.file);
			if (read.error) diagnostics.push(read.error);
		}
		// Directory projects select the first plugin with a matching key, even
		// when more than one configured entry has that key. Preserve precedence.
		const selected = plugins.find((candidate) => candidate.key === plugin.key);
		if (!selected.importFiles) {
			throw new PluginDoesNotImplementFunctionError({
				plugin: plugin.key,
				function: "importFiles",
			});
		}
		const imported = await selected.importFiles({
			files,
			settings: structuredClone(rawSettings),
		});
		if (importExportPlugins.length === 1 && loadSavePlugins.length === 0) {
			const bundles = createFreshCatalog(imported);
			if (bundles) return { settings, bundles, diagnostics };
		}
		(store ?? (await getStore())).import(imported);
	}
	for (const plugin of loadSavePlugins) {
		const readonlyFs = withAbsolutePaths(
			{
				// Legacy plugins receive the same Node Buffer/string values as the
				// directory loader; the historical binary type says ArrayBuffer.
				readFile: args.fs.promises.readFile.bind(args.fs.promises),
				readdir: args.fs.promises.readdir.bind(args.fs.promises),
				writeFile: async () => {
					throw new Error(
						"loadProjectCatalog does not permit filesystem writes"
					);
				},
				mkdir: async () => {
					throw new Error(
						"loadProjectCatalog does not permit filesystem writes"
					);
				},
			},
			args.path
		);
		const messages = await plugin.loadMessages({
			settings: structuredClone(settings),
			nodeishFs: readonlyFs,
		});
		for (const message of messages) {
			const bundle = fromMessageV1(message);
			// The legacy project API matches by locale and matches, ignoring the
			// converter's synthetic IDs. Reuse the same property-based semantics.
			(store ?? (await getStore())).import({
				bundles: [{ id: bundle.id, declarations: bundle.declarations }],
				messages: bundle.messages.map((value) => ({
					bundleId: bundle.id,
					locale: value.locale,
					selectors: value.selectors,
				})),
				variants: bundle.messages.flatMap((value) =>
					value.variants.map((variant) => ({
						messageBundleId: bundle.id,
						messageLocale: value.locale,
						matches: variant.matches,
						pattern: variant.pattern,
					}))
				),
			});
		}
	}
	return { settings, bundles: store?.takeBundles() ?? [], diagnostics };
}
async function importRemotePlugins(args, settings) {
	const plugins = [];
	const errors = [];
	for (const uri of settings.modules ?? []) {
		if (!uri.startsWith("http")) continue;
		let text;
		let fetched = false;
		try {
			try {
				text = await (await fetch(uri)).text();
				fetched = true;
			} catch (error) {
				try {
					text = await args.fs.promises.readFile(
						nodePath.join(args.path, pluginCachePath(uri).slice(1)),
						"utf8"
					);
				} catch {
					throw error;
				}
			}
		} catch (error) {
			errors.push(new PluginImportError({ plugin: uri, cause: error }));
			continue;
		}
		if (fetched && args.writePluginCache) {
			const cachePath = nodePath.join(args.path, pluginCachePath(uri).slice(1));
			try {
				await args.fs.promises.mkdir(nodePath.dirname(cachePath), {
					recursive: true,
				});
				await args.fs.promises.writeFile(cachePath, text);
			} catch (error) {
				throw new ResourceFileImportError({
					path: cachePath,
					cause: error,
				});
			}
		}
		try {
			if (args.preprocessPluginBeforeImport) {
				text = await args.preprocessPluginBeforeImport(text);
			}
			const url = process.versions.bun
				? URL.createObjectURL(new Blob([text], { type: "text/javascript" }))
				: "data:text/javascript;base64," + btoa(text);
			try {
				const { default: plugin } = await import(/* @vite-ignore */ url);
				if (!plugin.id?.includes("messageLintRule")) plugins.push(plugin);
			} finally {
				if (process.versions.bun) URL.revokeObjectURL(url);
			}
		} catch (error) {
			errors.push(new PluginImportError({ plugin: uri, cause: error }));
		}
	}
	return { plugins, errors };
}
