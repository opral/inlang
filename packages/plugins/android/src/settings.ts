import { Type, type Static } from "@sinclair/typebox";

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.String({
    // `{language}` expands to the Android resource qualifier of the primary
    // language subtag, e.g. `-de` for `de-DE`, like `{locale}` does.
    pattern: ".*\\{(locale|language)\\}.*\\.xml$",
    examples: [
      "./res/values{locale}/strings.xml",
      "./res/values{language}/strings.xml",
    ],
    description:
      "{language} resolves to the Android resource qualifier of the primary language subtag of the locale, e.g. `-de` for `de-DE`.",
  }),
});
