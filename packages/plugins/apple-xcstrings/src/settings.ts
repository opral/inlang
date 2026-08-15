import { Type, type Static } from "@sinclair/typebox";

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.String({
    pattern: ".*\\.xcstrings$",
    examples: ["./Localizations/Localizable.xcstrings"],
  }),
});
