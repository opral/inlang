import { type Static, Type } from "@sinclair/typebox";

const SDKSettings = Type.Object({
	// TODO SDK-v2 SETTINGS do we need to generate a settings v2 schema?
	$schema: Type.Optional(
		Type.Literal("https://inlang.com/schema/project-settings")
	),
	baseLocale: Type.String({
		title: "Base locale",
		description:
			"The base locale of the project. We recommend BCP-47 language tags.",
	}),
	locales: Type.Array(Type.String(), {
		uniqueItems: true,
		title: "Project Locales",
		description:
			"Set the locales that are available in your project. All locales needs to be a valid BCP-47 language tag. Needs to include the base locale tag.",
	}),
	translationDescriptors: Type.Optional(
		Type.String({
			minLength: 1,
			title: "Translation descriptors",
			description:
				"Path to a YAML file mapping inlang bundle IDs to machine translation context descriptions, relative to the project directory.",
			examples: ["./descriptors.yml"],
		})
	),
	// exits for backwards compatibility
	// remove in SDK-v3
	sourceLanguageTag: Type.Optional(
		Type.String({
			description:
				"Use baseLocale instead if all your inlang apps that you are using are on the inlang SDK V2. Otherwise, leave this property in.",
			deprecated: true,
		})
	),
	// exits for backwards compatibility
	// remove in SDK-v3
	languageTags: Type.Optional(
		Type.Array(Type.String(), {
			uniqueItems: true,
			deprecated: true,
			description:
				"Use locales instead if all your inlang apps that you are using are on the inlang SDK V2. Otherwise, leave this property in.",
		})
	),
	/**
	 * The modules to load.
	 *
	 * @example
	 *  modules: [
	 * 	  "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@3/dist/index.js",
	 * 	  "https://cdn.jsdelivr.net/npm/@inlang/plugin-csv@1/dist/index.js",
	 *  ]
	 */
	modules: Type.Optional(
		Type.Array(
			Type.Intersect([
				Type.String({
					description: "The module must be a valid URI according to RFC 3986.",
					pattern:
						"(?:[A-Za-z][A-Za-z0-9+.-]*:/{2})?(?:(?:[A-Za-z0-9-._~]|%[A-Fa-f0-9]{2})+(?::([A-Za-z0-9-._~]?|[%][A-Fa-f0-9]{2})+)?@)?(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.){1,126}[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?::[0-9]+)?(?:/(?:[A-Za-z0-9-._~]|%[A-Fa-f0-9]{2})*)*(?:\\?(?:[A-Za-z0-9-._~]+(?:=(?:[A-Za-z0-9-._~+]|%[A-Fa-f0-9]{2})+)?)(?:&|;[A-Za-z0-9-._~]+(?:=(?:[A-Za-z0-9-._~+]|%[A-Fa-f0-9]{2})+)?)*)?",
				}),
				Type.String({
					description: "The module must end with `.js`.",
					pattern: ".*\\.js$",
				}),
			]),
			{
				uniqueItems: true,
				description:
					"The modules to load. Must be a valid URI but can be relative.",
				examples: [
					"https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@3/dist/index.js",
					"https://cdn.jsdelivr.net/npm/@inlang/plugin-csv@1/dist/index.js",
					"./local-testing-plugin.js",
				],
			}
		)
	),
	experimental: Type.Optional(
		Type.Record(Type.String(), Type.Literal(true), {
			title: "Experimental settings",
			description:
				"Experimental settings that are used for product development.",
		})
	),
	/**
	 * plugin.*: JSONObject
	 *
	 * The plugin settings are validated when importing plugins
	 */
});

export type ProjectSettings = Omit<
	Static<typeof ProjectSettings>,
	"languageTags" | "sourceLanguageTag"
> & {
	/** @deprecated Use `baseLocale` */
	sourceLanguageTag?: string;
	/** @deprecated Use `locales` */
	languageTags?: string[];
	/** @deprecated This will soon be replaced by `Lix Validation Rules` */
	messageLintRuleLevels?: Record<string, "error" | "warning">;
} & Record<string, any>;
export const ProjectSettings = SDKSettings;
