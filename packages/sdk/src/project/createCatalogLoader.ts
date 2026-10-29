import { isDeepStrictEqual } from "node:util";
import { Buffer } from "node:buffer";
import type nodeFs from "node:fs";
import nodePath from "node:path";
import type { BundleNested } from "../database/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type {
	InlangPlugin,
	NodeFsPromisesSubsetLegacy,
} from "../plugin/schema.js";
import type { PreprocessPluginBeforeImportFunction } from "../plugin/importPlugins.js";
import type { ImportFile } from "./api.js";
import {
	createCatalogStore,
	createFreshCatalog,
} from "../import-export/catalogRows.js";
import { withLanguageTagToLocaleMigration } from "../migrations/v2/withLanguageTagToLocaleMigration.js";
import { fromMessageV1 } from "../json-schema/old-v1-message/fromMessageV1.js";
import { pluginCachePath } from "../plugin/cache.js";
import {
	PluginDoesNotImplementFunctionError,
	PluginImportError,
} from "../plugin/errors.js";
import {
	categorizePlugins,
	importLocalPlugins,
	ResourceFileImportError,
} from "./directoryPlugins.js";
import { absolutePathFromProject, withAbsolutePaths } from "./path-helpers.js";

/** A reset replaces all compiled messages; an update replaces only its bundles. */
export type CatalogUpdate =
	| {
			type: "reset";
			settings: ProjectSettings;
			bundles: readonly BundleNested[];
			diagnostics: readonly Error[];
	  }
	| {
			type: "update";
			bundles: readonly BundleNested[];
			removedBundleIds: readonly string[];
			diagnostics: readonly Error[];
	  };

export type CatalogLoader = { load(): Promise<CatalogUpdate> };

export type CreateCatalogLoaderArgs = {
	path: string;
	fs?: typeof nodeFs;
	providePlugins?: readonly InlangPlugin[];
	preprocessPluginBeforeImport?: PreprocessPluginBeforeImportFunction;
	/** Populate the remote plugin cache. Defaults to false. */
	writePluginCache?: boolean;
};

type Snapshot = {
	settings: ProjectSettings;
	bundles: BundleNested[];
	diagnostics: Error[];
};
type CacheState = {
	context: string;
	signature: unknown[];
	sources?: ImportFile[];
	fingerprints: Map<string, string>;
};
type Loaded = Snapshot &
	Omit<CacheState, "fingerprints"> & { unchanged?: boolean };
type ReadArgs = CreateCatalogLoaderArgs & { fs: typeof nodeFs };

/**
 * Creates a stateful, read-only directory loader without opening a database,
 * starting watchers or acquiring resources that need closing. Each load reads
 * current settings, plugin code and resource bytes. A single importFiles plugin
 * skips reimporting when its complete inputs are unchanged; other
 * plugins retain the ordinary full-import semantics.
 *
 * First load and settings/plugin changes return a reset. Subsequent loads emit
 * complete changed bundles (all locales and full patterns) and removed IDs.
 * Generated message/variant IDs are opaque references within a bundle, not
 * stable identities. Results are detached from the loader's private cache.
 * Concurrent loads are serialized. Rejected loads retain the successful state.
 * Remote plugins are network-first with offline cache fallback; only
 * writePluginCache opts into filesystem writes. No project metadata is updated.
 */
export function createCatalogLoader(
	options: CreateCatalogLoaderArgs
): CatalogLoader {
	// Copy configuration so the loader owns a fixed project and filesystem.
	const provided = options.providePlugins?.slice();
	const config = {
		...options,
		path: nodePath.resolve(options.path),
		providePlugins: provided,
	};
	let previous: CacheState | undefined;
	let pending: Promise<void> = Promise.resolve();
	async function load(): Promise<CatalogUpdate> {
		const fs = config.fs ?? (await import("node:fs"));
		const next = await readCatalog({ ...config, fs }, previous);
		if (next.unchanged)
			return {
				type: "update",
				bundles: [],
				removedBundleIds: [],
				diagnostics: next.diagnostics,
			};
		const reset =
			!previous ||
			next.context !== previous.context ||
			!sameSignature(next.signature, previous.signature);
		const nextFingerprints = new Map<string, string>();
		const bundles: BundleNested[] = [];
		for (const bundle of next.bundles) {
			const key = bundleFingerprint(bundle);
			nextFingerprints.set(bundle.id, key);
			if (reset || previous?.fingerprints.get(bundle.id) !== key)
				bundles.push(bundle);
		}
		const update: CatalogUpdate = reset
			? {
					type: "reset",
					settings: next.settings,
					bundles,
					diagnostics: next.diagnostics,
				}
			: {
					type: "update",
					bundles,
					removedBundleIds: [...previous!.fingerprints.keys()].filter(
						(id) => !nextFingerprints.has(id)
					),
					diagnostics: next.diagnostics,
				};
		// Normalization already detached plugin rows. Retain only fingerprints and
		// private source bytes, so returned ASTs never alias loader state.
		previous = {
			context: next.context,
			signature: next.signature,
			sources: next.sources,
			fingerprints: nextFingerprints,
		};
		return update;
	}
	return {
		load() {
			const result = pending.then(load);
			pending = result.then(
				() => undefined,
				() => undefined
			);
			return result;
		},
	};
}

function sameSignature(a: unknown[], b: unknown[]) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function bundleFingerprint(bundle: BundleNested): string {
	return JSON.stringify([
		bundle.id,
		bundle.declarations,
		bundle.messages.map((message) => [
			message.locale,
			message.selectors,
			message.variants.map((variant) => [variant.matches, variant.pattern]),
		]),
	]);
}

function sameSources(a: ImportFile[], b: ImportFile[]) {
	return (
		a.length === b.length &&
		a.every((file, index) => {
			const old = b[index]!;
			return (
				file.locale === old.locale &&
				isDeepStrictEqual(
					file.toBeImportedFilesMetadata,
					old.toBeImportedFilesMetadata
				) &&
				Buffer.from(
					file.content.buffer,
					file.content.byteOffset,
					file.content.byteLength
				).equals(
					Buffer.from(
						old.content.buffer,
						old.content.byteOffset,
						old.content.byteLength
					)
				)
			);
		})
	);
}

async function readCatalog(
	args: ReadArgs,
	previous?: CacheState
): Promise<Loaded> {
	const rawSettings = JSON.parse(
		await args.fs.promises.readFile(
			nodePath.join(args.path, "settings.json"),
			"utf8"
		)
	) as ProjectSettings;
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
	const context = JSON.stringify(rawSettings);
	// Imported source is stable across fresh Bun Blob URLs; supplied plugins
	// have no source text, so retain their object/function identity checks.
	const signature = (args.providePlugins ?? []).flatMap((plugin) => [
		plugin,
		plugin.key,
		plugin.importFiles,
		plugin.exportFiles,
		plugin.toBeImportedFiles,
		plugin.loadMessages,
		plugin.saveMessages,
	]);
	signature.push(...local.pluginSources, ...remote.pluginSources);
	const identity = { context, signature };
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

	let reusableSources: ImportFile[] | undefined;
	let store: ReturnType<typeof createCatalogStore> | undefined;
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
						} satisfies ImportFile,
					};
				} catch (error) {
					return {
						error:
							(error as NodeJS.ErrnoException)?.code === "ENOENT"
								? undefined
								: new ResourceFileImportError({
										cause: error as Error,
										path: file.path,
									}),
					};
				}
			})
		);
		const files: ImportFile[] = [];
		for (const read of reads) {
			if (read.file) files.push(read.file);
			if (read.error) diagnostics.push(read.error);
		}
		// An unreadable file must not publish an incomplete catalog or advance cache.
		const unreadable = diagnostics.filter(
			(error) => error instanceof ResourceFileImportError
		);
		if (unreadable.length)
			throw new AggregateError(
				unreadable,
				unreadable
					.map(
						(error) =>
							`${error.path} (${(error.cause as NodeJS.ErrnoException)?.code ?? error.cause})`
					)
					.join(", ")
			);
		// Directory projects select the first plugin with a matching key, even
		// when more than one configured entry has that key. Preserve precedence.
		const selected = plugins.find((candidate) => candidate.key === plugin.key)!;
		if (!selected.importFiles) {
			throw new PluginDoesNotImplementFunctionError({
				plugin: plugin.key,
				function: "importFiles",
			});
		}
		const reusable =
			importExportPlugins.length === 1 &&
			loadSavePlugins.length === 0 &&
			Boolean(selected.toBeImportedFiles);
		if (
			reusable &&
			previous?.sources &&
			context === previous.context &&
			sameSignature(signature, previous.signature) &&
			sameSources(files, previous.sources)
		) {
			return {
				settings,
				bundles: [],
				diagnostics,
				...identity,
				sources: previous.sources,
				unchanged: true,
			};
		}
		// Keep source bytes private even when a plugin mutates its input buffers.
		let sources: ImportFile[] | undefined;
		if (reusable) {
			try {
				sources = files.map((file) => ({
					...file,
					content: Uint8Array.from(file.content),
					toBeImportedFilesMetadata: structuredClone(
						file.toBeImportedFilesMetadata
					),
				}));
			} catch {
				/* Non-cloneable plugin metadata remains supported without memoization. */
			}
		}
		reusableSources = sources;
		const imported = await selected.importFiles({
			files,
			settings: structuredClone(rawSettings),
		});
		if (importExportPlugins.length === 1 && loadSavePlugins.length === 0) {
			const bundles = createFreshCatalog(imported);
			if (bundles)
				return { settings, bundles, diagnostics, ...identity, sources };
		}
		(store ?? (await getStore())).import(imported);
	}

	for (const plugin of loadSavePlugins) {
		const readonlyFs = withAbsolutePaths(
			{
				// Legacy plugins receive the same Node Buffer/string values as the
				// directory loader; the historical binary type says ArrayBuffer.
				readFile: args.fs.promises.readFile.bind(
					args.fs.promises
				) as unknown as NodeFsPromisesSubsetLegacy["readFile"],
				readdir: args.fs.promises.readdir.bind(args.fs.promises),
				writeFile: async () => {
					throw new Error(
						"createCatalogLoader does not permit filesystem writes"
					);
				},
				mkdir: async () => {
					throw new Error(
						"createCatalogLoader does not permit filesystem writes"
					);
				},
			},
			args.path
		);
		const messages = await plugin.loadMessages!({
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
	return {
		settings,
		bundles: store?.takeBundles() ?? [],
		diagnostics,
		...identity,
		sources: reusableSources,
	};
}

async function importRemotePlugins(
	args: ReadArgs,
	settings: ProjectSettings
): Promise<{
	plugins: InlangPlugin[];
	errors: Error[];
	pluginSources: string[];
}> {
	const plugins: InlangPlugin[] = [];
	const pluginSources: string[] = [];
	const errors: Error[] = [];
	for (const uri of settings.modules ?? []) {
		if (!uri.startsWith("http")) continue;
		let text: string;
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
			errors.push(
				new PluginImportError({ plugin: uri, cause: error as Error })
			);
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
					cause: error as Error,
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
				if (!plugin.id?.includes("messageLintRule")) {
					plugins.push(plugin);
					pluginSources.push(text);
				}
			} finally {
				if (process.versions.bun) URL.revokeObjectURL(url);
			}
		} catch (error) {
			errors.push(
				new PluginImportError({ plugin: uri, cause: error as Error })
			);
		}
	}
	return { plugins, errors, pluginSources };
}
