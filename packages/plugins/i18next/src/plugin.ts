import type { InlangPlugin } from "@inlang/sdk";
import type { PluginSettings } from "./settings.js";
import { pluginV4 } from "./legacy/plugin.v4.js";
import { importFiles } from "./import-export/importFiles.js";
import { exportFiles } from "./import-export/exportFiles.js";
import { toBeImportedFiles } from "./import-export/toBeImportedFiles.js";
import { PLUGIN_KEY } from "./pluginKey.js";
import { analyzeUsage } from "./usage/analyzeUsage.js";

export { PLUGIN_KEY };

export const plugin: InlangPlugin<{
	[PLUGIN_KEY]: PluginSettings;
}> = {
	id: pluginV4.id,
	key: PLUGIN_KEY,
	// @ts-expect-error - displayName is not in the v2 plugin
	displayName: pluginV4.displayName,
	// @ts-expect-error - description is not in the v2 plugin
	description: pluginV4.description,
	addCustomApi: pluginV4.addCustomApi,
	loadMessages: pluginV4.loadMessages,
	saveMessages: pluginV4.saveMessages,
	importFiles,
	exportFiles,
	toBeImportedFiles,
	analyzeUsage,
	// NOTE: no static `meta` here on purpose. Sherlock only migrates
	// `addCustomApi({ settings })` into `meta` when `meta` is unset — and the
	// ide-extension matchers need the plugin settings (pathPattern) baked in
	// for namespace inference. A static meta shadows that migration and
	// silently disables all Sherlock features for i18next projects, see
	// https://github.com/opral/inlang/issues/4368
};
