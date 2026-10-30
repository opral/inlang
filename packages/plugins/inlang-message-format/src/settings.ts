import { Type, type Static } from "@sinclair/typebox";

const pathPatternString = Type.String({
	// for legacy reasions locale can be specified as well
	// `{language}` refers to the primary language subtag of the locale,
	// e.g. `en` for `en-US`
	pattern: ".*\\{(languageTag|locale|language)\\}.*\\.json$",
	examples: [
		"./messages/{locale}.json",
		"./i18n/{locale}.json",
		"./messages/{language}.json",
	],
	title: "Path to language files",
	description:
		"Specify the pathPattern to locate resource files in your repository. It must include a `{locale}`, `{language}`, or legacy `{languageTag}` placeholder and end with `.json`.",
});

const pathPatternArray = Type.Array(pathPatternString, {
	title: "Paths to language files",
	description:
		"Specify multiple pathPatterns to locate resource files in your repository. Each must include a `{locale}`, `{language}`, or legacy `{languageTag}` placeholder and end with `.json`.",
});

const sort = Type.Optional(
	Type.Union([Type.Literal("asc"), Type.Literal("desc")], {
		title: "Sort keys",
		description: "Sort message keys when writing files.",
	})
);

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
	pathPattern: Type.Union([pathPatternString, pathPatternArray]),
	sort,
});
