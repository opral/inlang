import { Type, type Static } from "@sinclair/typebox";

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.String({
    pattern: ".*\\{(locale|language)\\}.*\\.strings$",
    examples: [
      "./Localizations/{locale}.lproj/Localizable.strings",
      "./Localizations/{language}.lproj/Localizable.strings",
    ],
    description:
      "{language} resolves to the primary language subtag of the locale, e.g. `en` for `en-US`.",
  }),
});
