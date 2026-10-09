import type { Kysely } from "kysely";
import {
	PluginDoesNotImplementFunctionError,
	PluginMissingError,
} from "../plugin/errors.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { InlangDatabaseSchema } from "../database/schema.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ExistingFile } from "../project/api.js";
import { selectPluginRows } from "./pluginRows.js";

export async function exportFiles(opts: {
	readonly pluginKey: string;
	readonly settings: ProjectSettings;
	readonly plugins: readonly InlangPlugin[];
	readonly db: Kysely<InlangDatabaseSchema>;
	readonly files?: readonly ExistingFile[];
}) {
	const plugin = opts.plugins.find((p) => p.key === opts.pluginKey);
	if (!plugin) throw new PluginMissingError({ plugin: opts.pluginKey });
	if (!plugin.exportFiles) {
		throw new PluginDoesNotImplementFunctionError({
			plugin: opts.pluginKey,
			function: "exportFiles",
		});
	}

	const { bundles, messages, variants } = await selectPluginRows(opts.db);

	const files = await plugin.exportFiles({
		settings: structuredClone(opts.settings),
		bundles,
		messages,
		variants,
		files: opts.files ? [...opts.files] : undefined,
	});
	return files;
}
