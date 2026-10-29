import type fs from "node:fs";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { PreprocessPluginBeforeImportFunction } from "../plugin/importPlugins.js";
import { PluginImportError } from "../plugin/errors.js";
import { absolutePathFromProject } from "./path-helpers.js";

/**
 * Filters legacy load and save messages plugins.
 *
 * Legacy plugins are plugins that implement loadMessages and saveMessages but not importFiles and exportFiles.
 */
export function categorizePlugins(plugins: readonly InlangPlugin[]) {
	const loadSavePlugins: InlangPlugin[] = [];
	const importExportPlugins: InlangPlugin[] = [];

	for (const plugin of plugins) {
		if (
			plugin.loadMessages &&
			plugin.saveMessages &&
			!(plugin.importFiles && plugin.exportFiles)
		) {
			loadSavePlugins.push(plugin);
		} else if (plugin.importFiles || plugin.exportFiles) {
			importExportPlugins.push(plugin);
		}
	}

	return { loadSavePlugins, importExportPlugins };
}

/**
 * Imports local plugins for backwards compatibility.
 *
 * https://github.com/opral/inlang/issues/171
 */
export async function importLocalPlugins(args: {
	fs: typeof fs;
	settings: ProjectSettings;
	path: string;
	preprocessPluginBeforeImport?: PreprocessPluginBeforeImportFunction;
}) {
	const errors: Error[] = [];
	const locallyImportedPlugins = [];
	const pluginSources: string[] = [];
	for (const module of args.settings.modules ?? []) {
		if (module.startsWith("http")) {
			continue;
		}
		const modulePath = absolutePathFromProject(args.path, module);
		try {
			let moduleAsText = await args.fs.promises.readFile(modulePath, "utf8");
			if (moduleAsText.includes("messageLintRule")) {
				errors.push(new WarningDeprecatedLintRule(module));
				continue;
			}
			if (args.preprocessPluginBeforeImport) {
				moduleAsText = await args.preprocessPluginBeforeImport(moduleAsText);
			}

			// In bun we need to do dynamic imports differently
			const pluginAsUrl = process.versions.bun
				? URL.createObjectURL(
						new Blob([moduleAsText], { type: "text/javascript" })
					)
				: "data:application/javascript," + encodeURIComponent(moduleAsText);

			const { default: plugin } = await import(/* @vite-ignore */ pluginAsUrl);
			locallyImportedPlugins.push(plugin);
			pluginSources.push(moduleAsText);
			if (process.versions.bun) URL.revokeObjectURL(pluginAsUrl);
		} catch (e) {
			errors.push(new PluginImportError({ plugin: module, cause: e as Error }));
			continue;
		}
	}
	return {
		errors,
		locallyImportedPlugins,
		pluginSources,
	};
}

export class WarningDeprecatedLintRule extends Error {
	constructor(module: string) {
		super(
			`The lint rule ${module} is deprecated. Please remove the lint rule from the settings. Lint rules are interim built into apps and will be succeeded by more generilizable lix validation rules.`
		);
		this.name = "WarningDeprecatedLintRule";
	}
}

export class ResourceFileImportError extends Error {
	path: string;

	constructor(args: { cause: Error; path: string }) {
		super("Could not import a resource file");
		this.name = "ResourceFileImportError";
		this.cause = args.cause;
		this.path = args.path;
	}
}
