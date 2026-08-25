# Getting Started

Inlang is the open-format TMS (translation management system) for software teams.

Store translations in your repo as a vendor-neutral file format, so developers, translators, CI, translation tools, and AI agents can read and update the same localization source of truth.

Use inlang when localization data needs to be shared across tools, teams, automations, or coding agents. If you only need an app runtime with a couple of translation files, your current i18n setup may already be enough.

An `.inlang` project is canonically a portable snapshot backed by [Lix](https://lix.dev). Inlang defines the localization format and TMS surface. Lix provides the underlying storage, versioning, history, review, change proposals, and rollback infrastructure.

For Git repositories, the file can be unpacked into a directory of plain files. The packed file is the canonical format; the unpacked directory is the Git-friendly representation.

## Install

Use Node.js 20 or newer and an ESM project (`"type": "module"` in `package.json`).

```bash
npm install @inlang/sdk
```

## Which path should I use?

| Situation                                                                       | Use                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A `project.inlang/` directory already exists in the repository                  | `loadProjectFromDirectory()` and work through `project.db`    |
| You are creating localization data from scratch                                 | `newProject()` → `loadProjectInMemory()` → `project.toBlob()` |
| You need to write JSON, i18next, ICU, XLIFF, or another translation file format | Configure an import/export plugin, then use the SDK CRUD API  |
| You only need runtime translation lookup for one app                            | Your existing i18n library may be enough                      |

Do not create a second localization config when a `.inlang` project already exists. Use `@inlang/sdk` to read and write the project.

## Quickstart: create and save a canonical `.inlang` file

This example creates a project, inserts one message, saves the packed `.inlang` file, and reloads it.

```typescript
import {
  insertBundleNested,
  loadProjectInMemory,
  newProject,
  selectBundleNested,
} from "@inlang/sdk";
import fs from "node:fs/promises";

const initialBlob = await newProject({
  settings: {
    baseLocale: "en",
    locales: ["en"],
  },
});

const project = await loadProjectInMemory({ blob: initialBlob });

await insertBundleNested(project.db, {
  id: "greeting",
  declarations: [],
  messages: [
    {
      id: "greeting_en",
      bundleId: "greeting",
      locale: "en",
      selectors: [],
      variants: [
        {
          id: "greeting_en_default",
          messageId: "greeting_en",
          matches: [],
          pattern: [{ type: "text", value: "Hello world!" }],
        },
      ],
    },
  ],
});

const savedBlob = await project.toBlob();
await fs.writeFile(
  "project.inlang",
  new Uint8Array(await savedBlob.arrayBuffer()),
);

const reloadedProject = await loadProjectInMemory({
  blob: new Blob([new Uint8Array(await fs.readFile("project.inlang"))]),
});

const bundles = await selectBundleNested(reloadedProject.db).execute();
console.log(bundles[0]?.messages[0]?.variants[0]?.pattern);

await project.close();
await reloadedProject.close();
```

Use `project.toBlob()` for the packed `.inlang` file. Use `saveProjectToDirectory()` only for the unpacked Git representation, and only when an import/export plugin can write your translation files.

## Use a tool built on inlang

Browse tools that read and write the `.inlang` format. Most app developers start here.

[Browse Tools →](/c/tools)

## Build your own

If you are building i18n tooling or generating localization code, target the `.inlang` file format instead of inventing your own JSON schema.

Use `@inlang/sdk` to build linters, editors, CLI tools, IDE extensions, and coding agents that work with any translation format through the shared `.inlang` message structure.

Why target `.inlang`?

- CRUD operations instead of custom parsing
- Versioning, history, review, change proposals, and rollback via [lix](https://lix.dev)
- Plugins for JSON, ICU, i18next, XLIFF, and other formats
- One data model that tools can share

[Write a Tool →](/docs/write-tool)
