// Settings for next-intl plugin
import { Type, type Static } from "@sinclair/typebox";
const PathPattern = Type.String({
	// legacy `{languageTag}` for backward compatibility. `{language}` resolves
	// to the primary language subtag of the locale, e.g. `en` for `en-US`.
	pattern: "^(\\./|\\../|/)[^*]*\\{(languageTag|locale|language)\\}[^*]*\\.json",
	title: "Path to language files",
	description:
		"Specify the pathPattern to locate language files in your repository. It must include a `{locale}`, `{language}`, or legacy `{languageTag}` placeholder and end with `.json`. `{language}` resolves to the primary language subtag of the locale, e.g. `en` for `en-US`.",
	examples: [
		"./{locale}/file.json",
		"../folder/{locale}/file.json",
		"./{locale}.json",
		"./{language}.json",
	],
});
const SourceLanguageFilePath = Type.String({
	pattern: "^(\\./|\\../|/)[^*]*\\.json$",
	title: "Path to source language file",
	description:
		"Specify the sourceLanguageFilePath if the source language file does not match pathPattern. It must end with `.json`.",
	examples: ["./resources/main.json"],
});
const NamespacePathPattern = Type.Record(
	Type.String({
		description: "The next-intl namespace.",
		examples: ["website", "app", "auth.SignUp"],
	}),
	PathPattern
);

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
	pathPattern: Type.Union([PathPattern, NamespacePathPattern]),
	variableReferencePattern: Type.Optional(
		Type.Array(Type.String(), {
			title: "Variable reference pattern",
			description:
				"Leave this out: next-intl messages are ICU MessageFormat (plurals, selects, rich text tags), which the plugin reads with the default '{' and '}'. Another pattern reads messages as text with variables between the opening and (optional) closing pattern, without ICU, for projects that set it before.",
			examples: ["{ and }", "{{ and }}", "< and >", "@:"],
		})
	),
	sourceLanguageFilePath: Type.Optional(SourceLanguageFilePath),
	ignore: Type.Optional(
		Type.Array(Type.String(), {
			title: "Ignore paths",
			description: "Set a path that should be ignored.",
		})
	),
});
