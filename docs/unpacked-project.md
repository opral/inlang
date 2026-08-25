# Unpacked Project

## What is an unpacked project?

An unpacked project is the Git-friendly representation of an `.inlang` file. The canonical `.inlang` format is a portable snapshot backed by [Lix](https://lix.dev). The unpacked directory exists so changes can be reviewed alongside code.

Messages, variants, and locale data live in the `.inlang` database. In unpacked Git projects, `settings.json` is the only tracked project file by default; translation files such as `messages/en.json` live outside `project.inlang/` and are connected through plugins.

> **Important:** `saveProjectToDirectory()` does not make translation data magically appear as files. Bundles, messages, and variants are exported only by an import/export plugin from `settings.modules` or `providePlugins`. If no exporter plugin is configured, save the canonical packed file with `project.toBlob()` instead.

```
project.inlang/
├── settings.json
├── .gitignore
├── README.md
├── .meta.json
└── cache/
```

## Packed vs Unpacked

|                  | Packed (`.inlang` file)           | Unpacked (directory)                  |
| ---------------- | --------------------------------- | ------------------------------------- |
| **Format**       | Canonical portable snapshot       | Git-friendly directory representation |
| **Git-friendly** | Limited                           | Yes (diffable, mergeable)             |
| **Portable**     | Yes (one file to share)           | No                                    |
| **Use case**     | Sharing, backups, tools like Fink | Storing in git repos                  |

## Why does it exist?

### Storing inlang projects in git

Most codebases use git for version control. Developers want their translations co-located with their code — not in a separate system.

### Packed snapshots are difficult to review in Git

Git can store a packed `.inlang` snapshot, but it is not organized for review:

- **Readable diffs** — Snapshot changes do not map cleanly to project files
- **Merge conflict resolution** — Snapshot-level conflicts are difficult to resolve
- **Code review** — Teammates can't review translation changes in PRs

An unpacked project solves this for the project configuration. The generated `.gitignore` keeps `settings.json` in Git and ignores generated/cache files. Translation files are stored outside `project.inlang/` according to plugin configuration.

## How to use it

### Loading a project

Use `loadProjectFromDirectory()` to load an unpacked project:

```typescript
import { loadProjectFromDirectory } from "@inlang/sdk";
import fs from "node:fs";

const project = await loadProjectFromDirectory({
  path: "./project.inlang",
  fs: fs,
});

// Query translations
const messages = await project.db.selectFrom("message").selectAll().execute();
```

Check plugin and resource-file errors after loading:

```typescript
const errors = await project.errors.get();
if (errors.length > 0) {
  throw new AggregateError(errors, "Could not load inlang project");
}
```

Close the project in one-off scripts:

```typescript
await project.close();
```

### Saving a project

Use `saveProjectToDirectory()` to save changes back to disk:

```typescript
import { saveProjectToDirectory } from "@inlang/sdk";
import fs from "node:fs";

await saveProjectToDirectory({
  fs: fs,
  project: project,
  path: "./project.inlang",
});
```

`loadProjectFromDirectory()` and `saveProjectToDirectory()` both accept `node:fs`. Passing the same `fs` object to both functions is the least surprising Node setup.

This writes `settings.json`, metadata files, and any resource files produced by configured exporters. Without an exporter plugin, translation data stays in the packed `.inlang` database and cannot be represented by the unpacked directory.

To save the canonical packed file instead:

```typescript
import fs from "node:fs/promises";

const blob = await project.toBlob();
await fs.writeFile("project.inlang", new Uint8Array(await blob.arrayBuffer()));
```

### File synchronization

You can enable automatic syncing between the filesystem and the in-memory database:

```typescript
const project = await loadProjectFromDirectory({
  path: "./project.inlang",
  fs: fs,
  syncInterval: 1000, // sync every second
});
```

When `syncInterval` is set, changes to files on disk are automatically imported, and changes to the database are automatically exported.

## Directory structure

| File            | Purpose                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `settings.json` | Project configuration (locales, plugins, plugin settings). This is the only file kept in Git by default. |
| `.gitignore`    | Auto-created, ignores everything except `settings.json` (including itself)                               |
| `README.md`     | Auto-created, explains the folder to coding agents (gitignored)                                          |
| `.meta.json`    | Auto-created SDK metadata (gitignored)                                                                   |
| `cache/`        | Cached plugin modules, usually under `cache/plugins/` (gitignored)                                       |

Translation files (like `messages/en.json`) are managed by plugins and stored relative to your project based on plugin configuration.

## Next steps

- [CRUD API](/docs/crud-api) — Query and modify translations after loading
- [Architecture](/docs/architecture) — Understand how storage fits in the architecture
- [Writing a Tool](/docs/write-tool) — Build a tool that loads unpacked projects
