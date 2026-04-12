import { Type, type Static } from "@sinclair/typebox";

const pathPatternString = Type.String({
	pattern: ".*\\{locale\\}.*\\.properties$",
	examples: [
		"./messages/{locale}.properties",
		"./i18n/{locale}.properties",
	],
	title: "Path to language files",
	description:
		"Specify the pathPattern to locate .properties files in your repository. It must include `{locale}` and end with `.properties`.",
});

const pathPatternArray = Type.Array(pathPatternString, {
	title: "Paths to language files",
	description:
		"Specify multiple pathPatterns to locate .properties files in your repository. Each must include `{locale}` and end with `.properties`.",
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
