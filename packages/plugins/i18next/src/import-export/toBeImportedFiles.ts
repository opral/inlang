/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";

/**
 * Replaces the `{locale}` and legacy `{languageTag}` placeholders with the
 * locale, and `{language}` with its primary language subtag, e.g. `en` for
 * `en-US`.
 */
export function replacePathPattern(pathPattern: string, locale: string): string {
	return pathPattern.replace(
		/{(locale|languageTag|language)}/g,
		(_, placeholder) =>
			placeholder === "language" ? getPrimaryLanguageSubtag(locale) : locale
	);
}

export const toBeImportedFiles: NonNullable<
	(typeof plugin)["toBeImportedFiles"]
> = async ({ settings }) => {
	const result = [];
	const pathPattern = settings[PLUGIN_KEY]?.pathPattern;
	if (pathPattern === undefined) {
		return [];
	}
	// single namespace
	if (typeof pathPattern === "string") {
		for (const locale of settings.locales) {
			result.push({
				locale,
				path: replacePathPattern(pathPattern, locale),
			});
		}
		return result;
	}
	// multiple namespaces
	for (const locale of settings.locales) {
		for (const namespace in pathPattern) {
			result.push({
				locale,
				path: replacePathPattern(pathPattern[namespace]!, locale),
				metadata: {
					namespace,
				},
			});
		}
	}
	return result;
};
