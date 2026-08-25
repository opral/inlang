# Inlang file format SDK

[![NPM Downloads](https://img.shields.io/npm/dw/%40inlang%2Fsdk?logo=npm&logoColor=red&label=npm%20downloads)](https://www.npmjs.com/package/@inlang/sdk) [![Discord](https://img.shields.io/discord/897438559458430986?style=flat&logo=discord&labelColor=white)](https://discord.gg/gdMPPWy57R)


<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/opral/inlang/packages/sdk/assets/open-file.svg" alt="Inlang SDK opens .inlang files">
</p>

## Outline

- [Introduction](#introduction)
- [Use the SDK when](#use-the-sdk-when)
- [Getting Started](#getting-started)
- [Plugins](#plugins)
- [API reference](#api-reference)
- [Listing on inlang.com](#listing-on-inlangcom)

## Introduction

The inlang SDK is the reference implementation for reading and writing `.inlang` project files.

`.inlang` files are designed to become the open standard for localization data and make i18n tools work together. Build editors, CLIs, runtimes, agents, and plugins on the same shared project format instead of inventing another file structure.

An `.inlang` project is canonically a portable snapshot backed by [Lix](https://lix.dev). It packages localization data and project files into one file that tools can share.

For Git repositories, the packed file can be unpacked into a directory of plain files so changes can be reviewed alongside code. The packed file is the canonical format; the unpacked directory is the Git-friendly representation.

`.inlang` is the canonical project format. Plugins import and export formats like JSON, ICU MessageFormat v1, i18next, and XLIFF for compatibility with existing translation files and runtimes. Version control via lix adds file-level history, merging, and change proposals to `.inlang` projects.

Messages, variants, and locale data live in the `.inlang` database. External translation files such as `messages/en.json` are compatibility files outside `project.inlang/`, connected through plugins.

### Core Features

- 📁 **File-based**: A portable project file, no cloud integrations or lock-in.
- 🖊️ **CRUD API**: Read, write, and query messages with SQL.
- 🧩 **Plugin System**: Connect external translation files to the shared message structure.
- 📦 **Import/Export**: Import and export messages in formats like JSON, XLIFF, and i18next.
- [<img src="https://raw.githubusercontent.com/opral/inlang/refs/heads/main/lix/assets/lix-icon.svg" width="20" height="12" alt="Lix Icon">**Version control via lix**](https://lix.dev/): File-level history, merging, change proposals, reviews, and automation.

### Core data model

- **Bundle** — one translatable unit across locales
- **Message** — locale-specific translation for a bundle
- **Variant** — text pattern plus selector matches

## Use the SDK when

Use `@inlang/sdk` when you are building an editor, CLI, CI check, migration, report, plugin, runtime, or AI agent that needs to read or write localization data.

Instead of inventing another i18n JSON schema, target the shared `.inlang` project model. Your tool can then work with the same source of truth as Fink, Sherlock, Parrot, the CLI, Paraglide, plugins, and other inlang-compatible workflows.

| Layer | What it is |
| --- | --- |
| `.inlang` | Canonical project format and localization source of truth |
| `@inlang/sdk` | Read/write API for editors, CLIs, CI checks, runtimes, plugins, and agents |
| Plugins | Compatibility layer for JSON, ICU MessageFormat, i18next, XLIFF, and other file formats |
| Lix | Versioning, history, review, change proposals, rollback, and merging |
| Tools | Fink, Sherlock, Parrot, CLI, and Paraglide workflows that read/write `.inlang` |

For coding agents:

- Find an existing `project.inlang` file or `project.inlang/` directory before creating new locale files.
- Load and update bundles, messages, variants, locales, settings, and metadata through `@inlang/sdk`.
- Treat JSON, ICU, i18next, and XLIFF files as compatibility files connected through plugins.
- Do not invent a custom `locales/en.json` schema when a `.inlang` project already exists.

## Getting Started

> [!Note]
> Inlang projects are portable snapshots. They can be unpacked and [stored as directories](#unpacked-inlang-files-directories) when you want to review changes in Git. The packed file remains the canonical format.

### Installation

```bash
npm install @inlang/sdk
```

### Loading an inlang file

```ts
import { loadProjectInMemory, newProject } from "@inlang/sdk";

const project = await loadProjectInMemory({
  blob: await newProject()
});

// query the project
project.*
```

### Loading an unpacked project from Git

```ts
import { loadProjectFromDirectory } from "@inlang/sdk";

const project = await loadProjectFromDirectory({
  path: "./project.inlang",
});
```

### Next steps

Go to the [API reference](#api-reference) to learn how to query messages, changes, and save the project.


## Plugins

The inlang SDK supports plugins to extend its functionality. 

Plugins can be used to import/export messages in different formats, add custom validation rules, and implement specialized workflows.

### Available Plugins

Find available plugins on https://inlang.com/c/plugins.

### Creating a Plugin

#### Getting started

Implement the `InlangPlugin` type. 

Examples can be found [here](https://github.com/opral/inlang/tree/main/packages/plugins). Particulary the [message format plugin](https://github.com/opral/inlang/tree/main/packages/plugins/inlang-message-format) is a good starting point.

```typescript
const myPlugin: InlangPlugin = {
  key: "my-plugin",
  importFiles: () => {
    // Import files logic
  },
  exportFiles: () => {
    // Export files logic
  },
};
```

#### Deploying a plugin 

> [!NOTE]  
> Why is a CDN requires instead of using npm to use plugins?
>
> Non-JS projects (Android, iOS, etc.) wouldn't be able to use inlang, and browser-based apps like [Fink](https://inlang.com/m/tdozzpar/app-inlang-finkLocalizationEditor) couldn't load plugins. 

```bash
npx @inlang/cli plugin build --entry ./src/plugin.js 
```

We recommend uploading the plugin to NPM which makes it automatically available on [JSDelivr](https://www.jsdelivr.com/) and enables users to pin the version of your plugin. 

```diff
https://cdn.jsdelivr.net/npm/my-plugin@1/dist/index.js
```

## API reference

### Creating a new project

```typescript
import { newProject } from "@inlang/sdk";

// Create a new project
const file = await newProject();

// write the file anywhere you want
await fs.writeFile("./project.inlang", file);
```

### Loading a project

```typescript
import { loadProjectInMemory } from "@inlang/sdk";

const file = await fs.readFile("./project.inlang");

// Load a project from a directory
const project = await loadProjectInMemory({
  blob: file
});
```

### Querying a project

```typescript
// Accessing settings and plugins
const settings = await project.settings.get();
const plugins = await project.plugins.get();

// Querying messages
const messages = await project.db
  .selectFrom("message")
  .selectAll()
  .execute();

console.log(messages);
```

### Querying changes

> [!NOTE]  
> The inlang plugin for lix is work in progress. If you stumble on issues, please open an issue on the [GitHub](https://github.com/opral/inlang).

The inlang file format uses version control via lix. `project.lix` is the underlying Lix instance. Visit the [lix documentation](https://lix.dev/) for more information on how to query changes.

```typescript
const result = await project.lix.execute(`
  SELECT created_at, schema_key, entity_pk, snapshot_content
  FROM lix_change
  ORDER BY created_at DESC
`);

const changes = result.rows.map((row) => row.toObject());
```

### Saving a project

```typescript
const newFile = await project.toBlob();

await fs.writeFile("./project.inlang", newFile);
```

### Importing and exporting translation files

The import and export of messages depends on the installed plugins. The following example shows how to import and export messages using a plugin that supports JSON files.

```typescript
const file = await fs.readFile("./en.json");

// Import files
await project.importFiles({
  pluginKey: "plugin.inlang.messageFormat",
  files: [
    { locale: "en", content: file },
  ],
});

// Export files
const files = await project.exportFiles({
  pluginKey: "plugin.inlang.messageFormat"
});

await fs.writeFile("./en.json", files[0].content);
```

### Installing plugins

```typescript
const settings = await project.settings.get();

settings.modules.push(
  "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@latest/dist/index.js"
)

await project.settings.set(settings)
```

### Unpacked inlang files (directories)

> [!NOTE]  
> Unpacked inlang files are the Git-friendly representation of packed `.inlang` files.
>
> Git can store packed snapshots, but plain-file review and merge workflows work better with the unpacked directory. **If you don't intend to store the inlang file in git, use the packed file.**
> 
> Unpacked inlang files are not portable. They depend on plugins and do not persist [version control via lix](https://lix.dev/) data.

```typescript
import { 
    loadProjectFromDirectory, 
    saveProjectToDirectory 
} from "@inlang/sdk";

const project = await loadProjectFromDirectory({
    "path": "./project.inlang"
});

// modify the project

await saveProjectToDirectory({
    "project": project,
    "path": "./project.inlang"
});
```


## Listing on inlang.com

To list your app/plugin on inlang.com, please open a pull request to the [registry.json file](https://github.com/opral/inlang/blob/main/packages/marketplace-registry/registry.json). 

Make sure that the link you are contributing points to a `marketplace-manifest.json` file. An example of can be found [here](https://github.com/opral/inlang/blob/main/packages/fink/marketplace-manifest.json)
