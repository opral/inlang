import type { InlangPlugin } from "@inlang/sdk";
import type { PluginSettings } from "../settings.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";

export const toBeImportedFiles: NonNullable<
	InlangPlugin<{ [PLUGIN_KEY]: PluginSettings }>["toBeImportedFiles"]
> = async ({ settings }) => {
	const result: Array<{
		locale: string;
		path: string;
		metadata?: Record<string, any>;
	}> = [];
	const pathPattern = settings[PLUGIN_KEY]?.pathPattern;
	const sourceLanguageFilePath = settings[PLUGIN_KEY]?.sourceLanguageFilePath;
	const locales = settings.locales ?? settings.languageTags ?? [];
	const sourceLocale = settings.baseLocale ?? settings.sourceLanguageTag;

	if (pathPattern === undefined) {
		return [];
	}

	if (typeof pathPattern === "string") {
		for (const locale of locales) {
			const pattern =
				locale === sourceLocale && typeof sourceLanguageFilePath === "string"
					? sourceLanguageFilePath
					: pathPattern;
			result.push({
				locale,
				path: replaceLocale(pattern, locale),
			});
		}
		return result;
	}

	for (const locale of locales) {
		for (const namespace in pathPattern) {
			result.push({
				locale,
				path: replaceLocale(pathPattern[namespace]!, locale),
				metadata: {
					namespace,
				},
			});
		}
	}

	return result;
};

function replaceLocale(path: string, locale: string): string {
	return path.replace(
		/{(languageTag|locale|language)}/g,
		(_, placeholder) =>
			placeholder === "language" ? getPrimaryLanguageSubtag(locale) : locale
	);
}
