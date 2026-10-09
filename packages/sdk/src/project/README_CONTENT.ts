/**
 * README content that gets written to every .inlang project folder.
 *
 * The primary reader is a coding agent working in an app repo: it explains
 * what this folder is, what to edit, which inlang tools handle common
 * localization tasks, and where inlang ends and the i18n library begins.
 * Keep it short and stable (no versions or dates) and link to inlang.com
 * instead of duplicating docs.
 */
export const README_CONTENT = `
# inlang project

This folder is an [inlang](https://inlang.com) project in its [unpacked, Git-friendly form](https://inlang.com/docs/unpacked-project). It is the localization config of this repo: locales, plugins, and where the translation files live.

inlang keeps the Git repo as the source of truth: translation files and \`settings.json\` are plain files here, and every inlang tool reads and writes them, with no hosted TMS in between.

## What to edit

- \`settings.json\`: \`baseLocale\`, \`locales\`, plugin \`modules\` and plugin settings such as \`pathPattern\` ([reference](https://inlang.com/docs/settings)). Commit it.
- \`paraglide.config.*\` (if present): Paraglide JS compiler options such as \`strategy\`. Commit it.
- Translation files (for example \`messages/en.json\`) live **outside** this folder, at the \`pathPattern\` in \`settings.json\`. Add and change messages there.
- Don't edit \`README.md\`, \`.gitignore\`, \`.meta.json\`, \`cache/\` or \`.lix/\`. They are generated and Git-ignored.

## Common tasks

Run commands from the repo root. Replace \`./project.inlang\` with the path to this folder.

| Task | How |
| --- | --- |
| Check translations: missing or empty translations, placeholder and plural mismatches, unused messages | \`npx @inlang/cli check --project ./project.inlang\`. Exits 1 on findings, so it works as a CI step. Formerly \`validate\` / \`lint\`. |
| Fail CI only on missing translations, for some locales | \`npx @inlang/cli check --project ./project.inlang --missing-translations --locales de\` |
| Find unused messages | \`npx @inlang/cli check --project ./project.inlang --unused-messages\`. It scans the source code for Paraglide \`m.*\` calls via the \`m-function-matcher\` plugin. |
| Machine translate missing messages | \`npx @inlang/cli machine translate --project ./project.inlang\` (optionally \`--targetLocales de\`). Uses Google or DeepL if \`INLANG_GOOGLE_TRANSLATE_API_KEY\` or \`INLANG_DEEPL_API_KEY\` is set, otherwise a free third-party service ([BYOK](https://inlang.com/m/2qj2w8pu/app-inlang-cli/byok)). Review the output before shipping. |
| Add a locale | Add it to \`locales\` in \`settings.json\`, then create its translation file or machine translate it. |
| Switch the file format (JSON, i18next, ICU MessageFormat, XLIFF, ...) | Replace the format plugin in \`modules\` and its settings key ([plugins](https://inlang.com/c/plugins)). Existing files are not converted automatically. |
| Let translators edit without touching JSON | [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor), a translation editor that works on this project |
| Use translations in Figma | [Parrot](https://inlang.com/m/gkrpgoir/app-parrot-figmaPlugin), a Figma plugin |
| See translations inline and extract strings in VS Code | [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension), a VS Code extension |

See \`npx @inlang/cli check --help\` for all checks and \`--format json\`. Add \`@inlang/cli\` as a dev dependency to pin the version in CI. If a command is missing, use \`npx @inlang/cli@latest\`. More tools: [inlang.com/c/tools](https://inlang.com/c/tools).

## inlang vs. the i18n library

- **inlang** owns the localization project: messages, translation files, settings, plugins, and the tooling above. It does not render text in your app.
- **An i18n library** renders the messages at runtime. In JavaScript apps this is usually [Paraglide JS](https://paraglidejs.com). It compiles this project into typesafe message functions (often in \`src/paraglide/\`). That output is generated: don't edit it, edit the translation files instead.
- The file format and the library are independent. Changing the format is a plugin change in \`settings.json\` and keeps the library. Changing the library (for example to i18next) keeps inlang: point a plugin at that library's files, and checks, machine translation, Fink and Parrot keep working. Unused-message detection needs a plugin that understands the library's calls; \`m-function-matcher\` covers Paraglide's \`m.*\`.

## Building tools

Read and write the project with [\`@inlang/sdk\`](https://www.npmjs.com/package/@inlang/sdk) instead of parsing translation files yourself. See the [docs](https://inlang.com/docs) and [writing a tool](https://inlang.com/docs/write-tool).
`;
