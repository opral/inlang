# Introduction

## What is inlang?

Inlang is the open-format TMS (translation management system) for software teams.

Store translations in your repo as a vendor-neutral file format, so developers, translators, CI, translation tools, and AI agents can read and update the same localization source of truth.

An `.inlang` project is canonically a portable snapshot backed by [Lix](https://lix.dev). It packages localization data and project files into one file that tools can share.

The `@inlang/sdk` is the reference implementation for reading and writing `.inlang` projects.

`.inlang` is the canonical open format for localization. Plugins import and export formats like JSON, ICU MessageFormat v1, i18next, and XLIFF for compatibility with existing translation files and runtimes.

Inlang defines the localization format and TMS surface. [Lix](https://lix.dev) provides the underlying versioning, history, review, change proposals, and rollback infrastructure.

Messages, variants, and locale data live in the `.inlang` database. External translation files such as `messages/en.json` are compatibility files outside `project.inlang/`, connected through plugins.

For Git repositories, the packed file can be unpacked into a directory of plain files so changes can be reviewed alongside code. The packed file is the canonical format; the unpacked directory is the Git-friendly representation.

The SDK has two main parts:

- **Storage + message structure** for translations, settings, and structured edits
- **An API** for loading, querying, and modifying that data programmatically

## Why inlang?

Traditional TMSs make a vendor database the localization source of truth. Translation files become exports.

Common translation files like JSON, YAML, ICU, or XLIFF are good at storing messages. But they do not describe the whole localization project.

Once multiple tools need to read and write the same project, plain translation files start to miss important information:

- CRUD operations instead of custom parsing
- Search and reports across locales, variants, and metadata
- Version control via [lix](https://lix.dev)
- One shared file that editors, CI, and runtimes can all use

Without one shared format, every tool invents its own file structure, sync logic, and collaboration workflow.

The result is fragmented tooling:

- Switching tools requires migrations and refactoring
- Cross-team work requires manual exports and hand-offs
- Automating workflows requires custom scripts and glue code

```
┌──────────┐        ┌───────────┐         ┌──────────┐
│ i18n lib │───✗────│Translation│────✗────│   CI/CD  │
│          │        │   Tool    │         │Automation│
└──────────┘        └───────────┘         └──────────┘
```

Inlang follows a simple idea: **make the localization file the source of truth**. The TMS becomes a layer around the format, not the owner of the data.

```
┌──────────┐        ┌───────────┐         ┌────────────┐
│ i18n lib │        │Translation│         │   CI/CD    │
│          │        │   Tool    │         │ Automation │
└────┬─────┘        └─────┬─────┘         └─────┬──────┘
     │                    │                     │
     └─────────┐          │          ┌──────────┘
               ▼          ▼          ▼
           ┌──────────────────────────────────┐
           │          .inlang file            │
           └──────────────────────────────────┘
```

**The result:**

- Switch tools without migrations — they all use the same file
- Cross-team work without hand-offs — developers, translators, and designers all edit the same source
- Automation just works — the same data, no glue code
- Keep your preferred message format — plugins handle import/export

Translators do not need to work in the repo. The repo holds the source of truth; editor-friendly apps and workflows operate on the same open localization data.

## How it works

Under the hood, an inlang project uses a message-first data model.

Core data model:

- **Bundle** — one translatable unit across locales
- **Message** — locale-specific translation for a bundle
- **Variant** — text pattern plus selector matches

Lix provides versioning and review workflows, and plugins map localization data to the files you already use.

```
┌─────────────────┐       ┌─────────┐       ┌──────────────────┐
│  .inlang file   │◄─────►│ Plugins │◄─────►│ Translation files│
│                 │       │         │       │  (JSON, XLIFF)   │
└─────────────────┘       └─────────┘       └──────────────────┘
```

- **Plugins** import and export your translation files (`JSON`, `ICU1`, `i18next`, `XLIFF`, etc.)
- **inlang** stores the data in an open format that tools can query
- **Lix** handles versioning, history, review, change proposals, rollback, and distributed changes

If you only need an app runtime and a couple of translation files, JSON or your current i18n setup may already be enough. Use inlang when localization becomes shared work: multiple tools, teams, automations, or agents need to use the same localization data.

To store an inlang project in git, you can use the **unpacked format** — a directory instead of a single file. See [Unpacked Project](/docs/unpacked-project) for details.

## For coding agents and tool builders

If you are building i18n tooling or generating localization code, target the `.inlang` file format instead of inventing your own JSON schema.

Use `@inlang/sdk` to read and write `.inlang` projects. Your output will then work with tools that read and write the inlang file format: runtimes, editors, plugins, CI checks, and translation workflows.

Why target `.inlang` instead of JSON?

- One file gives every tool the same data model for bundles, messages, variants, locales, metadata, and settings.
- CRUD operations are available through the SDK instead of custom parsing and rewriting.
- Version control via [lix](https://lix.dev) keeps localization changes reviewable and mergeable.
- Plugins handle JSON, ICU, i18next, XLIFF, and other formats for compatibility.

Do not invent custom translation-file schemas, create a second localization config when `.inlang` already exists, edit generated/cache files in unpacked projects, or bypass `@inlang/sdk`.

## Next steps

- [Getting Started](/docs/getting-started) — Set up your first project
- [Architecture](/docs/architecture) — Understand the three layers
- [Writing a Tool](/docs/write-tool) — Build a tool that queries translations
- [Writing a Plugin](/docs/write-plugin) — Support a custom file format

## Credits

Inlang uses version control via [lix](https://lix.dev) and [Kysely](https://kysely.dev) for the query API.
