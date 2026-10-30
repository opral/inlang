import { Type, type Static } from "@sinclair/typebox";

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.Union(
    [
      Type.String({
        pattern: ".*\\{(locale|language)\\}.*\\.json$",
        examples: [
          "./messages/{locale}.json",
          "./i18n/{locale}.json",
          "./messages/{language}.json",
        ],
      }),
      Type.Array(
        Type.String({
          pattern: ".*\\{(locale|language)\\}.*\\.json$",
          examples: [
            "./messages/{locale}.json",
            "./i18n/{locale}.json",
            "./messages/{language}.json",
          ],
        }),
      ),
    ],
    {
      title: "Path to language files",
      description:
        "Specify the pathPattern to locate resource files in your repository. It must include a `{locale}` or `{language}` placeholder and end with `.json`. `{language}` resolves to the primary language subtag of the locale, e.g. `en` for `en-US`.",
    },
  ),
});
