# How inlang works

## The problem

Traditional TMSs make a vendor database the localization source of truth. Translation files become exports.

No common open format for i18n tools exists. JSON and YAML can store messages, but they do not describe the whole localization project: locales, variants, metadata, history, and safe reads and writes for tools.

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

## The solution

Inlang is the open-format TMS (translation management system) for software teams.

Store translations in your repo as a vendor-neutral file format, so developers, translators, CI, translation tools, and AI agents can read and update the same localization source of truth.

An `.inlang` project is canonically a portable snapshot backed by [Lix](https://lix.dev). It packages localization data and project files into one file that tools can share.

For Git repositories, the packed file can be unpacked into a directory of plain files so changes can be reviewed alongside code. The packed file is the canonical format; the unpacked directory is the Git-friendly representation. The `@inlang/sdk` is the reference implementation for reading and writing `.inlang` projects.

`.inlang` is the canonical open format for localization. Plugins import and export formats like JSON, ICU MessageFormat v1, i18next, and XLIFF for compatibility with existing translation files and runtimes.

Inlang defines the localization format and TMS surface. [Lix](https://lix.dev) provides the underlying versioning, history, review, change proposals, and rollback infrastructure.

Messages, variants, and locale data live in the `.inlang` database. External translation files such as `messages/en.json` are compatibility files outside `project.inlang/`, connected through plugins.

It provides:

- **CRUD API** — Read and write translations programmatically
- **Search and reports** — Query messages like a database, scale to millions
- **Plugin system** — Import/export any format (JSON, XLIFF, etc.)
- **Version control** — Version control via [lix](https://lix.dev)

Core data model:

- **Bundle** — one translatable unit across locales
- **Message** — locale-specific translation for a bundle
- **Variant** — text pattern plus selector matches

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

Translators do not need to work in the repo. The repo holds the source of truth; editor-friendly apps and workflows operate on the same open localization data.

## For coding agents and tool builders

If you are building i18n tooling or generating localization code, target the `.inlang` file format instead of inventing your own JSON schema.

Use `@inlang/sdk` to read and write `.inlang` projects. Your output will then work with tools that read and write the inlang file format: runtimes, editors, plugins, CI checks, and translation workflows.

Why target `.inlang` instead of JSON?

- One file gives every tool the same data model for bundles, messages, variants, locales, metadata, and settings.
- CRUD operations are available through the SDK instead of custom parsing and rewriting.
- Version control via [lix](https://lix.dev) keeps localization changes reviewable and mergeable.
- Plugins handle JSON, ICU, i18next, XLIFF, and other formats for compatibility.

Do not invent custom translation-file schemas, create a second localization config when `.inlang` already exists, edit generated/cache files in unpacked projects, or bypass `@inlang/sdk`.

```ts
import { loadProjectFromDirectory, loadProjectInMemory } from "@inlang/sdk";
import fs from "node:fs/promises";

const packedProject = await loadProjectInMemory({
  blob: await fs.readFile("./project.inlang"),
});

// Loads the Git-friendly unpacked representation.
const unpackedProject = await loadProjectFromDirectory({
  path: "./project.inlang",
});

const messages = await packedProject.db.selectFrom("message").selectAll().execute();
```

[Read the SDK docs →](https://inlang.com/docs)
