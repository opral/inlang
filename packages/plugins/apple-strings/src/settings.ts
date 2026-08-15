import { Type, type Static } from "@sinclair/typebox";

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.String({
    pattern: ".*\\{locale\\}.*\\.strings$",
    examples: ["./Localizations/{locale}.lproj/Localizable.strings"],
  }),
});
