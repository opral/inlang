# Plugin API

Plugins handle the transformation between external file formats (JSON, i18next, XLIFF) and inlang's internal data model. `.inlang` is the canonical open format for localization; external translation files are compatibility files. Plugins only do import/export — they don't write the `.inlang` project directly.

```
┌─────────────────┐       ┌─────────┐       ┌──────────────────┐
│  .inlang file   │◄─────►│ Plugins │◄─────►│ Translation files│
│                 │       │         │       │  (JSON, XLIFF)   │
└─────────────────┘       └─────────┘       └──────────────────┘
```

## Plugin interface

```typescript
type InlangPlugin<ExternalSettings = unknown> = {
  key: string;
  settingsSchema?: TObject;
  toBeImportedFiles?: (args) => Promise<Array<{ path; locale; metadata? }>>;
  importFiles?: (args) => Promise<{ bundles; messages; variants }>;
  exportFiles?: (args) => Promise<Array<ExportFile>>;
  meta?: Record<string, Record<string, unknown>>;
};
```

## Minimal example

```typescript
import type { InlangPlugin } from "@inlang/sdk";

export const plugin: InlangPlugin = {
  key: "plugin.my.json",

  toBeImportedFiles: async ({ settings }) => {
    return settings.locales.map((locale) => ({
      path: `./messages/${locale}.json`,
      locale,
    }));
  },

  importFiles: async ({ files, settings }) => {
    const bundles = [];
    const messages = [];
    const variants = [];

    for (const file of files) {
      const json = JSON.parse(new TextDecoder().decode(file.content));

      for (const [key, value] of Object.entries(json)) {
        bundles.push({ id: key, declarations: [] });
        messages.push({
          bundleId: key,
          locale: file.locale,
          selectors: [],
        });
        variants.push({
          messageBundleId: key,
          messageLocale: file.locale,
          matches: [],
          pattern: [{ type: "text", value: value as string }],
        });
      }
    }

    return { bundles, messages, variants };
  },

  exportFiles: async ({ bundles, messages, variants, settings }) => {
    const files: Record<string, Record<string, string>> = {};

    for (const message of messages) {
      const variant = variants.find((v) => v.messageId === message.id);
      const text = variant?.pattern
        .filter((p) => p.type === "text")
        .map((p) => p.value)
        .join("");

      if (!files[message.locale]) files[message.locale] = {};
      files[message.locale][message.bundleId] = text ?? "";
    }

    return Object.entries(files).map(([locale, content]) => ({
      locale,
      name: `${locale}.json`,
      content: new TextEncoder().encode(JSON.stringify(content, null, 2)),
    }));
  },
};
```

## Methods

### `toBeImportedFiles`

Discovers which files should be imported from the filesystem.

```typescript
toBeImportedFiles: async ({ settings }) => {
  return [
    { path: "./messages/en.json", locale: "en" },
    { path: "./messages/de.json", locale: "de" },
  ];
};
```

**Parameters:**

- `settings` — Project settings including plugin-specific config

**Returns:** Array of file descriptors:

- `path` — Path to the file
- `locale` — Locale this file contains
- `metadata` — Optional, passed to `importFiles`

### `importFiles`

Parses file content and converts to inlang's data model.

```typescript
importFiles: async ({ files, settings }) => {
  return {
    bundles: [...],
    messages: [...],
    variants: [...],
  };
}
```

**Parameters:**

- `files` — Array of files to import:
  - `locale` — The locale
  - `content` — Binary file content (`Uint8Array`)
  - `toBeImportedFilesMetadata` — Metadata from `toBeImportedFiles`
- `settings` — Project settings

**Returns:**

- `bundles` — Array of `BundleImport`
- `messages` — Array of `MessageImport`
- `variants` — Array of `VariantImport`

### `exportFiles`

Converts inlang's data model back to files.

```typescript
exportFiles: async ({ bundles, messages, variants, settings }) => {
  return [
    {
      locale: "en",
      name: "en.json",
      content: new TextEncoder().encode(JSON.stringify(data)),
    },
  ];
};
```

**Parameters:**

- `bundles` — All bundles
- `messages` — All messages
- `variants` — All variants
- `settings` — Project settings
- `files` _(optional)_ — The current content of the files the export overwrites: `{ path, locale, content, metadata? }`, where `path`, `locale` and `metadata` are the ones `toBeImportedFiles` returned. Only files that exist are passed. Hosts that don't support it (SDK 3) and exports of new files pass none.

**Keep unchanged entries.** An export should only change the bytes of the messages that changed, so that saving a project doesn't rewrite translation files in git. If `files` has the file that an exported file replaces, keep the text of every entry whose message didn't change, the key order of the file and its formatting (indentation, final newline, line endings), and only write the entries that changed, were added or were removed. Compare messages by what they import to, not by their text: a file can use another representation than the plugin writes, e.g. a legacy shape or other escaping. Without a previous file, write the whole file.

**Returns:** Array of files to write:

- `locale` — The locale
- `name` — Filename (e.g., `"en.json"`)
- `content` — Binary content (`Uint8Array`)

## Settings schema

Define plugin settings using [TypeBox](https://github.com/sinclairzx81/typebox):

```typescript
import { Type } from "@sinclair/typebox";

export const PluginSettings = Type.Object({
  pathPattern: Type.String({
    pattern: ".*\\{locale\\}.*\\.json$",
    description: "Path to translation files",
    examples: ["./messages/{locale}.json"],
  }),
  sort: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
});
```

Then reference it in your plugin:

```typescript
export const plugin: InlangPlugin<{
  "plugin.my.json": typeof PluginSettings;
}> = {
  key: "plugin.my.json",
  settingsSchema: PluginSettings,
  // ...
};
```

Users configure your plugin in `settings.json`:

```json
{
  "baseLocale": "en",
  "locales": ["en", "de"],
  "modules": ["./plugins/my-plugin.js"],
  "plugin.my.json": {
    "pathPattern": "./messages/{locale}.json",
    "sort": "asc"
  }
}
```

## Import types

### BundleImport

```typescript
type BundleImport = {
  id: string;
  declarations: Declaration[];
};
```

### MessageImport

```typescript
type MessageImport = {
  id?: string; // auto-generated if omitted
  bundleId: string;
  locale: string;
  selectors: VariableReference[];
};
```

### VariantImport

Variants can reference messages by ID or by bundle/locale.

Use `messageBundleId` plus `messageLocale` for most `importFiles()` implementations. The SDK can then generate or reuse message ids during import.

Use `messageId` only when your plugin deliberately manages stable message ids and returns matching message ids in `messages`.

```typescript
// By message ID
type VariantImport = {
  id?: string;
  messageId: string;
  matches: Match[];
  pattern: Pattern;
};

// By bundle/locale
type VariantImport = {
  messageBundleId: string;
  messageLocale: string;
  matches: Match[];
  pattern: Pattern;
};
```

## Meta

Use `meta` to expose plugin-specific APIs to other tools:

```typescript
export const plugin: InlangPlugin = {
  key: "plugin.my.json",
  meta: {
    "app.inlang.ideExtension": {
      documentSelectors: [{ language: "json" }],
    },
  },
};
```

## Next steps

- [Writing a Plugin](/docs/write-plugin) — Step-by-step guide to building a plugin
- [Data Model](/docs/data-model) — Understand bundles, messages, and variants
- [Architecture](/docs/architecture) — See how plugins fit in the architecture
