import type { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";

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
				path: pathPattern.replace(
					/{(languageTag|locale|language)}/g,
					(_, placeholder) =>
						placeholder === "language"
							? getPrimaryLanguageSubtag(locale)
							: locale
				),
			});
		}
	}
	return result;
};
