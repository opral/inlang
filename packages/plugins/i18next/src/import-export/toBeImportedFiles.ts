/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";

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
				path: pathPattern.replace(/{(locale|languageTag)}/g, locale),
			});
		}
		return result;
	}
	// multiple namespaces
	for (const locale of settings.locales) {
		for (const namespace in pathPattern) {
			result.push({
				locale,
				path: pathPattern[namespace]!.replace(
					/{(locale|languageTag)}/g,
					locale
				),
				metadata: {
					namespace,
				},
			});
		}
	}
	return result;
};
