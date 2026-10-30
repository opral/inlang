# next-intl Plugin for Inlang

This plugin enables your inlang project to read and write [next-intl](https://next-intl-docs.vercel.app/) translation files.

![next-intl plugin for inlang](https://cdn.jsdelivr.net/npm/@inlang/plugin-next-intl@latest/assets/banner.svg)

## Why use this plugin?

If you're using next-intl for internationalization in Next.js, this plugin lets you:

- **Manage translations** with [Fink](https://fink.inlang.com) – a translation editor for collaborating with translators
- **Get inline previews** with [Sherlock](https://inlang.com/m/r7kp499g/app-inlang-ideExtension) – a VS Code extension that shows translations directly in your code
- **Lint translations** with [inlang CLI](https://inlang.com/m/2qj2w8pu/app-inlang-cli) – catch missing translations, unused keys, and other issues
- **Automate workflows** with the inlang SDK – build custom tooling around your translations

## How it works

The plugin reads and writes next-intl JSON files and keeps your file structure: saving a project only changes the entries that were edited. Messages are read as ICU MessageFormat, with the same parser next-intl uses, so plurals, selects and rich text tags are editable as variants and markup. It also tells Sherlock how to detect `t()`, `useTranslations()`, and `getTranslations()` calls in your code.

# Supported next-intl Features

| Feature                            | Status       | Notes                                                                     |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------- |
| Basic key-value pairs              | ✅ Supported |                                                                           |
| Nested keys and namespaces         | ✅ Supported | `t("Home.title")`, `useTranslations("Home")`, files per namespace         |
| Arguments                          | ✅ Supported | `{name}`                                                                  |
| Plurals                            | ✅ Supported | `{count, plural, =0 {…} one {# item} other {# items}}`, `offset`          |
| Select and selectordinal           | ✅ Supported | `{gender, select, …}`, `{place, selectordinal, one {#st} …}`, also nested |
| Rich text                          | ✅ Supported | `<b>…</b>`, `<link>…</link>` for `t.rich()` and `t.markup()`, as markup   |
| Number, date and time formats      | ✅ Supported | `{price, number, ::currency/EUR}`, `{date, date, short}`, custom formats  |
| Escaping                           | ✅ Supported | `'{name}'`, `'<b>'`, `''`                                                 |
| Arrays and other non-string values | ⚠️ Kept      | Not editable, but kept in the files (read them with `t.raw()`)            |

## Version Compatibility

- **next-intl v4.x**: Full support
- **next-intl v3.x**: Full support
- **next-intl v2.x**: Full support

## Installation

- Add this to the modules in your `project.inlang/settings.json`
- Change the `sourceLanguageTag` if needed
- Include existing language tags in the `languageTags` array

```json
{
	"sourceLanguageTag": "en",
	"languageTags": ["en", "de"],
	"modules": [
		"https://cdn.jsdelivr.net/npm/@inlang/plugin-next-intl@latest/dist/index.js"
	],
	"plugin.inlang.nextIntl": {
		"pathPattern": "./messages/{locale}.json"
	}
}
```

# Settings

The plugin offers further configuration options that can be passed as arguments. The following settings exist:

```typescript
type PluginSettings = {
	pathPattern: string | { [namespace: string]: string };
	variableReferencePattern?: [string] | [string, string];
	sourceLanguageFilePath?: string;
};
```

## `pathPattern`

To use the plugin, you must provide a path to the directory where your language-specific files are stored. Use the dynamic path syntax `{locale}` to specify the locale name. `{language}` resolves to the primary language subtag of the locale, e.g. `en` for `en-US`, when files are organized by base language instead. Locales that share a primary language, like `en-US` and `en-GB`, resolve to the same file with `{language}`; use `{locale}` when separate regional files are needed.

`{languageTag}` is still supported for legacy projects, but `{locale}` is recommended for new configurations.

```json
"pathPattern": "./messages/{locale}.json"
```

Use an object when your next-intl messages are split by namespace. Namespace maps require tools that use the new `importFiles` and `exportFiles` API; the legacy `loadMessages` and `saveMessages` hooks only support a single string `pathPattern`.

```json
"pathPattern": {
	"About": "./messages/{locale}/About.json",
	"HomePage": "./messages/HomePage/{locale}.json"
}
```

For example, `./messages/en/About.json` with this content:

```json
{
	"title": "About us"
}
```

is exposed as the message ID `About.title`, matching next-intl usage like:

```ts
const t = useTranslations("About");
t("title");
```

## `variableReferencePattern`

Leave this setting out. next-intl messages are ICU MessageFormat, which the plugin reads with the default `["{", "}"]`. Projects that set another pattern (e.g. `["{{", "}}"]`) keep reading messages as plain text with variables between the opening and closing pattern, without plurals, selects or markup.

## `sourceLanguageFilePath`

This setting is optional and should only be used if the file name of your `sourceLanguageTag` does not match your pathPattern structure. For example, if your sourceLanguageTag is `en` but your sourceLanguage file is called `main.json`, you can use this setting to specify the path to the sourceLanguage file. We recommend renaming the file to `en.json` and not using this setting.

```json
"sourceLanguageFilePath": "./resources/main.json"
```

# In-code usage

Basic usage:

`t("key")`

With namespaces:

```ts
import {useTranslations} from 'next-intl';

function About() {
  const t = useTranslations('About');
  return <h1>{t('title')}</h1>;
}
```

Server components with `getTranslations`:

```ts
import {getTranslations} from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('About');
  return <h1>{t('title')}</h1>;
}
```

To learn about namespaces and how to use translation functions in your code, refer to the [next-intl documentation](https://next-intl-docs.vercel.app/docs/usage/messages).

# Unused messages

The plugin analyzes where your code uses messages (`analyzeUsage`), so that the inlang SDK's `checkProject` and `findUsages`, [`inlang check --unused-messages`](https://inlang.com/m/2qj2w8pu/app-inlang-cli) and [Fink](https://fink.inlang.com) can find unused messages and show where each message is used. It reads `.ts`, `.tsx`, `.js`, `.jsx` (also `.mjs`, `.cjs`) and `.mdx` files.

A message is used by:

- `useTranslations("Home")` or `await getTranslations("Home")` (also `getTranslations({ locale, namespace: "Home" })` and `createTranslator({ messages, namespace: "Home" })`) followed by `t("title")`, `t.rich("title")` or `t.markup("title")`: `Home.title`.
- `t("Home.title")` on a translator without a namespace, and nested namespaces such as `useTranslations("Checkout.Summary")`.
- Keys known in the file: constants (`const key = "title"`), both sides of `open ? "close" : "open"`, templates of constants, and arrays of keys that are only iterated: ``["one", "two"].map((key) => t(`${key}.title`))``.
- Aliases of a translator (`const tt = t`) and of the next-intl functions (`import { useTranslations as useT }`, `import * as intl from "next-intl"`).

Passing all messages to `NextIntlClientProvider`, returning them from `getRequestConfig` (also merged with `deepmerge`), and typing next-intl with `Messages: typeof messages` are not usages.

When a usage can't be resolved, no message is reported unused, and the analysis lists where and why. That is the case for:

- dynamic keys and namespaces, such as ``t(`items.${id}`)``, `t(key)` or `useTranslations(namespace)`;
- a translator passed to a function or component, returned from a custom hook, exported or stored, and next-intl functions imported from a wrapper module or package (`import { useTranslations } from "@repo/i18n"`);
- `t.raw()` and `t.has()` of a key that could be a namespace (one that isn't also translated with `t()`);
- messages read directly: `useMessages()` or `getMessages()` other than for `NextIntlClientProvider`, an imported message file, `import.meta.glob`;
- message files nested under a key other than their namespace, e.g. `messages: { Legacy: en }`;
- re-exports of next-intl functions, `useExtracted()` and `getExtracted()`;
- types derived from the message keys, such as `MessageKeys`, `keyof Messages`, `keyof IntlMessages["Nav"]` or `Parameters<typeof t>`. Typing next-intl itself (`Messages: typeof messages` in `AppConfig`, `interface IntlMessages extends Messages {}`) is fine;
- files the plugin can't parse, and formats it doesn't read, such as `.vue` or `.md`.

# Expected behavior

## Structure and Ordering

The **source language file determines the structure** for all other locale files:

- **Key ordering**: Messages are sorted in the order they appear in the source language file
- **Nesting vs flat**: Detected per-file from the source language. If your `en.json` uses nested keys, all other locales will use nested keys too
- **New keys**: When you add translations for other locales, they follow the source file's structure
- **New messages**: A new message is nested at the dots of its key (`Checkout.Summary.total` goes to `"Checkout": { "Summary": { "total": … } }`), because next-intl reads `t("Checkout.Summary.total")` from there. A new translation of an existing message goes where the message's other translations are.
- **Edited messages**: An edited message is written as ICU MessageFormat, e.g. `{count, plural, =0 {No items} one {# item} other {# items}}`. Literal `{`, `}` and tags are quoted (`'{'`, `'<'b>`), apostrophes only where next-intl needs it, so `Don't` stays as it is.

### Example

If your source language (`en.json`) looks like this:

```json
{
	"About": {
		"title": "About us",
		"description": "Learn more about our company"
	}
}
```

Then your target language (`de.json`) will be written in the same nested structure:

```json
{
	"About": {
		"title": "Über uns",
		"description": "Erfahren Sie mehr über unser Unternehmen"
	}
}
```

# Limitations

| Feature                  | Limitation                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| **Invalid ICU**          | A message next-intl can't parse is read as text and keeps its text unless it is edited          |
| **Tags around a plural** | `<b>{count, plural, …}</b>` is written as `{count, plural, one {<b>…</b>} …}` once it is edited |
| **Self-closing tags**    | next-intl reads `<br/>` as text; markup without content is written as `<br></br>`               |
| **Tag attributes**       | next-intl tags have none: options of markup from other formats (`{#link to=$url}`) are dropped  |
| **Nested `t()` calls**   | References like `{t('other.key')}` are not resolved                                             |

# Troubleshooting

## Keys appear duplicated or out of order

**Cause**: The source language file structure doesn't match what the plugin expects.

**Solution**:

1. Ensure your source language file (e.g., `en.json`) is valid JSON
2. Check that the file structure is consistent (all nested or all flat)
3. The source language file is the "source of truth" for key ordering

## Sherlock not detecting translation keys

**Cause**: Non-standard function names or unsupported file types.

**Solution**:

- Use standard function calls: `t("key")`, `useTranslations()`, or `getTranslations()`
- Supported file types: `.ts`, `.tsx`, `.js`, `.jsx`

## Changes not appearing in target language files

**Cause**: Target files don't exist or path pattern is incorrect.

**Solution**:

1. Verify your `pathPattern` matches your file structure
2. Check that the `{locale}` or legacy `{languageTag}` placeholder is in the correct position
3. Directories are created automatically, but the language tag must be in your `languageTags` array

# Contributing

## Getting started

Run the following commands in your terminal (node and npm must be installed):

1. `npm install`
2. `npm run dev`

`npm run dev` will start the development environment, which automatically compiles the [src/index.ts](#getting-started) files to JavaScript ([dist/index.js](#getting-started)), runs tests defined in `*.test.ts` files and watches changes.
