/**
 * Facts the Plugins and Tools pages show next to each marketplace item, so
 * people and AI agents can pick and configure an item without opening it.
 *
 * Plugin facts come from each plugin's README in packages/plugins.
 */

export type PluginFacts = {
  /** The translation file format the plugin imports and exports. */
  format: string;
  /** Key of the plugin's settings in project.inlang/settings.json. */
  settingsKey: string;
  /** Example `pathPattern` setting. */
  pathPattern: string;
};

/** Format plugins by marketplace id. Items without facts show none. */
export const pluginFacts: Record<string, PluginFacts> = {
  "plugin.inlang.messageFormat": {
    format: "inlang message format JSON",
    settingsKey: "plugin.inlang.messageFormat",
    pathPattern: "./messages/{locale}.json",
  },
  "plugin.inlang.i18next": {
    format: "i18next JSON",
    settingsKey: "plugin.inlang.i18next",
    pathPattern: "./resources/{locale}.json",
  },
  "plugin.inlang.nextIntl": {
    format: "next-intl JSON",
    settingsKey: "plugin.inlang.nextIntl",
    pathPattern: "./messages/{locale}.json",
  },
  "plugin.inlang.icu-messageformat-1": {
    format: "ICU MessageFormat v1 JSON",
    settingsKey: "plugin.inlang.icu-messageformat-1",
    pathPattern: "./messages/{locale}.json",
  },
  "plugin.inlang.android": {
    format: "Android strings.xml",
    settingsKey: "plugin.inlang.android",
    pathPattern: "./res/values{locale}/strings.xml",
  },
  "plugin.inlang.apple-strings": {
    format: "Apple .strings",
    settingsKey: "plugin.inlang.apple-strings",
    pathPattern: "./Localizations/{locale}.lproj/Localizable.strings",
  },
  "plugin.inlang.apple-xcstrings": {
    format: "Apple .xcstrings",
    settingsKey: "plugin.inlang.apple-xcstrings",
    pathPattern: "./Localizations/Localizable.xcstrings",
  },
};

export type ToolFacts = {
  /** Who the tool is for, as the end of the sentence "For ...". */
  audience: string;
  /** One line on what to use it for. */
  use: string;
};

/** Tools by marketplace id. */
export const toolFacts: Record<string, ToolFacts> = {
  "library.inlang.paraglideJs": {
    audience: "your app",
    use: "i18n library for new JavaScript and TypeScript apps. It compiles messages into typed functions.",
  },
  "app.inlang.cli": {
    audience: "coding agents and CI",
    use: "Run npx @inlang/cli check to find missing, empty and unused translations. It exits with code 1 on findings. Machine translate adds translations. No inlang account.",
  },
  "app.inlang.ideExtension": {
    audience: "developers",
    use: "VS Code extension. See translations inline, edit them and extract new strings.",
  },
  "app.inlang.finkLocalizationEditor": {
    audience: "translators",
    use: "Web editor. Translators sign in with GitHub and edit side by side. Fink pushes only what changed to a branch for review.",
  },
};
