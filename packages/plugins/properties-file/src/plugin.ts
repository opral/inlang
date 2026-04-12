import type { InlangPlugin } from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import { toBeImportedFiles } from "./import-export/toBeImportedFiles.js";
import { importFiles } from "./import-export/importFiles.js";
import { exportFiles } from "./import-export/exportFiles.js";

export const PLUGIN_KEY = "plugin.inlang.propertiesFile";

export const plugin: InlangPlugin<{
	[PLUGIN_KEY]?: PluginSettings;
}> = {
	key: PLUGIN_KEY,
	settingsSchema: PluginSettings,
	toBeImportedFiles,
	importFiles,
	exportFiles,
};
