# Architecture

Inlang is the open-format TMS (translation management system) for software teams. Its file format has three layers: storage, data model, and plugins.

```
┌─────────────────────────────────────────────┐
│  Storage and version control (Lix)          │
├─────────────────────────────────────────────┤
│  Data Model (Bundle, Message, Variant)      │
├─────────────────────────────────────────────┤
│  Plugins (JSON, i18next, XLIFF, etc.)       │
└─────────────────────────────────────────────┘
```

## Storage

An `.inlang` project is canonically a portable snapshot backed by [Lix](https://lix.dev). It packages localization data and project files into one file that tools can share.

For Git repositories, the packed file can be unpacked into a directory of plain files so changes can be reviewed alongside code. The packed file is the canonical format; the unpacked directory is the Git-friendly representation.

Inlang defines the localization format and TMS surface. Lix provides the underlying versioning, history, review, change proposals, rollback, and merging infrastructure.

The storage layer is designed to be:

- **Queryable** — Filter, join, and aggregate translations with SQL
- **Portable** — Single file, no server
- **Git-friendly when unpacked** — Store a directory representation in repos for reviewable changes

## Data Model

Translations are stored in three tables: **Bundle**, **Message**, and **Variant**.

```
Bundle (greeting)
├── Message (en)
│   └── Variant ("Hello {name}!")
├── Message (de)
│   └── Variant ("Hallo {name}!")
└── Message (fr)
    └── Variant ("Bonjour {name}!")
```

- **Bundle** — Groups translations by key. One bundle = one translatable unit across all locales.
- **Message** — A locale-specific translation. One message per locale per bundle.
- **Variant** — The actual text pattern. Supports plurals and conditional matching.

See [Data Model](/docs/data-model) for details.

## Plugins

Plugins handle the transformation between external translation files (JSON, i18next, XLIFF) and inlang's internal data model.

```
┌─────────────────┐       ┌─────────┐       ┌──────────────────┐
│  .inlang file   │◄─────►│ Plugins │◄─────►│ Translation files│
│                 │       │         │       │  (JSON, XLIFF)   │
└─────────────────┘       └─────────┘       └──────────────────┘
```

`.inlang` is the canonical open format for localization. External translation files are compatibility files that plugins import and export. Plugins only do import/export — they don't write the `.inlang` project directly. This keeps the core simple and makes format support extensible.

See [Plugin API](/docs/plugin-api) for the reference or [Writing a Plugin](/docs/write-plugin) to build your own.

## Message-first design

Traditional i18n tools are translation-file-first: you load `en.json`, `de.json`, `fr.json` as separate resources and iterate through files to find translations.

Inlang is message-first: you query messages directly from the database.

```typescript
// File-first: load each file, find the key manually
const en = JSON.parse(fs.readFileSync('en.json'));
const de = JSON.parse(fs.readFileSync('de.json'));
const greeting = { en: en.greeting, de: de.greeting };

// Message-first: query what you need
const messages = await project.db
  .selectFrom('message')
  .where('bundleId', '=', 'greeting')
  .selectAll()
  .execute();
```

Why this matters:

- **Tools don't care about files** — They care about messages. Files are an import/export detail.
- **CRUD operations** — Tools can read and write messages through the SDK instead of custom parsing.
- **Query across locales** — Find missing translations, compare locales, aggregate stats.
- **Future-proof** — The data model works regardless of where translations come from (files, APIs, databases).

## Next steps

- [CRUD API](/docs/crud-api) — Query and modify translations
- [Writing a Tool](/docs/write-tool) — Build a tool using the SDK
- [Writing a Plugin](/docs/write-plugin) — Support a custom file format
