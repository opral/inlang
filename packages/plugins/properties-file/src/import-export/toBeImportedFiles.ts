import { PLUGIN_KEY, type plugin } from "../plugin.js";

export const toBeImportedFiles: NonNullable<
	(typeof plugin)["toBeImportedFiles"]
> = async ({ settings }) => {
	const result = [];
	const pathPatterns = settings[PLUGIN_KEY]?.pathPattern
		? Array.isArray(settings[PLUGIN_KEY].pathPattern)
			? settings[PLUGIN_KEY].pathPattern
			: [settings[PLUGIN_KEY].pathPattern]
		: [];
	for (const pathPattern of pathPatterns) {
		for (const locale of settings.locales) {
			result.push({
				locale,
				path: pathPattern.replace(/{locale}/, locale),
			});
		}
	}
	return result;
};
