// pluginOptions for json plugin
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
export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.Union([
    PathPattern,
    Type.Record(
      Type.String({
        pattern: "^[^.]+$",
        description: "Dots are not allowd ",
        examples: ["website", "app", "homepage"],
      }),
      PathPattern,
    ),
  ]),
  variableReferencePattern: Type.Optional(
    Type.Array(Type.String(), {
      title: "Variable reference pattern",
      description:
        "The pattern to match content in the messages. You can define an opening and closing pattern. The closing pattern is not required. The default is '{{' and '}}'.",
      examples: ["{ and }", "{{ and }}", "< and >", "@:"],
    }),
  ),
  ignore: Type.Optional(
    Type.Array(Type.String(), {
      title: "Ignore paths",
      description: "Set a path that should be ignored.",
    }),
  ),
});
