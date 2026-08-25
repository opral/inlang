# Writing a Tool

This guide walks through building a tool that flags missing translations. By the end, you'll understand how to load a project and query messages with the CRUD API.

## What tools can do

Tools read and write translations through the `.inlang` format via the CRUD API. Because plugins handle conversion at the boundary, your tool works with any translation format — JSON, XLIFF, i18next, etc. — without parsing each one directly.

An `.inlang` project is canonically a portable snapshot. In Git repositories, it is often unpacked into a directory; `loadProjectFromDirectory()` loads that Git-friendly representation.

If a `project.inlang/` directory already exists, load it with `loadProjectFromDirectory()`. If your tool is generating a new localization project from scratch, start with `newProject()` and save the packed file with `project.toBlob()`; see [Getting Started](/docs/getting-started) for a runnable create-save-reload example.

```
┌─────────────────┐
│    Your Tool    │
├─────────────────┤
│    CRUD API     │  ◄── Query and modify messages
├─────────────────┤
│  .inlang file   │
├─────────────────┤
│    Plugins      │  ◄── Handle file formats
└─────────────────┘
```

## Step 1: Load the project

```typescript
import { loadProjectFromDirectory } from "@inlang/sdk";
import fs from "node:fs";

const project = await loadProjectFromDirectory({
  path: "./project.inlang",
  fs,
});
```

That's it. The project is loaded with all translations from your files (via plugins). The external files are compatibility files; the tool works against the shared `.inlang` data model.

## Step 2: Check load errors

Plugin import and resource-file errors are exposed through `project.errors.get()`. Check them before trusting query results.

```typescript
const errors = await project.errors.get();
if (errors.length > 0) {
  throw new AggregateError(errors, "Could not load inlang project");
}
```

In one-off scripts and CLIs, close the project before the process exits:

```typescript
await project.close();
```

## Step 3: Get project settings

```typescript
const settings = await project.settings.get();

console.log("Base locale:", settings.baseLocale);
console.log("Locales:", settings.locales);
// Base locale: en
// Locales: ["en", "de", "fr"]
```

## Step 4: Query all bundles

```typescript
const bundles = await project.db.selectFrom("bundle").selectAll().execute();

console.log(`Found ${bundles.length} translation keys`);
```

## Step 5: Find missing translations

Now let's find bundles that are missing translations for certain locales:

```typescript
async function findMissingTranslations(project) {
  const settings = await project.settings.get();
  const bundles = await project.db.selectFrom("bundle").selectAll().execute();
  const messages = await project.db.selectFrom("message").selectAll().execute();

  const missing = [];

  for (const bundle of bundles) {
    // Get all messages for this bundle
    const bundleMessages = messages.filter((m) => m.bundleId === bundle.id);
    const localesWithTranslation = bundleMessages.map((m) => m.locale);

    // Find which locales are missing
    for (const locale of settings.locales) {
      if (!localesWithTranslation.includes(locale)) {
        missing.push({
          bundleId: bundle.id,
          locale,
        });
      }
    }
  }

  return missing;
}
```

## Step 6: Put it together

Here's a complete CLI tool:

```typescript
import { loadProjectFromDirectory } from "@inlang/sdk";
import fs from "node:fs";

async function main() {
  const project = await loadProjectFromDirectory({
    path: "./project.inlang",
    fs,
  });

  try {
    const errors = await project.errors.get();
    if (errors.length > 0) {
      throw new AggregateError(errors, "Could not load inlang project");
    }

    const settings = await project.settings.get();
    const bundles = await project.db.selectFrom("bundle").selectAll().execute();
    const messages = await project.db
      .selectFrom("message")
      .selectAll()
      .execute();

    const missing = [];

    for (const bundle of bundles) {
      const bundleMessages = messages.filter((m) => m.bundleId === bundle.id);
      const localesWithTranslation = bundleMessages.map((m) => m.locale);

      for (const locale of settings.locales) {
        if (!localesWithTranslation.includes(locale)) {
          missing.push({ bundleId: bundle.id, locale });
        }
      }
    }

    if (missing.length === 0) {
      console.log("All translations complete!");
    } else {
      console.log(`Found ${missing.length} missing translations:\n`);
      for (const { bundleId, locale } of missing) {
        console.log(`  - "${bundleId}" is missing locale "${locale}"`);
      }
      process.exitCode = 1;
    }
  } finally {
    await project.close();
  }
}

main();
```

Run it:

```bash
$ npx tsx check-translations.ts

Found 3 missing translations:

  - "greeting" is missing locale "fr"
  - "error_404" is missing locale "de"
  - "error_404" is missing locale "fr"
```

## Building report queries

The CRUD API is powered by Kysely. For reports, it is often clearest to query the rows you need and aggregate them in JavaScript:

```typescript
// Find bundles missing a specific locale
const bundles = await project.db.selectFrom("bundle").selectAll().execute();
const germanMessages = await project.db
  .selectFrom("message")
  .select("bundleId")
  .where("locale", "=", "de")
  .execute();

const translatedBundleIds = new Set(
  germanMessages.map((message) => message.bundleId),
);
const missingGerman = bundles.filter(
  (bundle) => translatedBundleIds.has(bundle.id) === false,
);

// Count translations per locale
const messages = await project.db.selectFrom("message").selectAll().execute();
const counts = Object.entries(
  messages.reduce<Record<string, number>>((result, message) => {
    result[message.locale] = (result[message.locale] ?? 0) + 1;
    return result;
  }, {}),
).map(([locale, count]) => ({ locale, count }));
```

## Modifying translations

Tools can also create, update, and delete translations:

```typescript
// Add a missing translation
const message = await project.db
  .insertInto("message")
  .values({
    id: crypto.randomUUID(),
    bundleId: "greeting",
    locale: "fr",
    selectors: [],
  })
  .returning("id")
  .executeTakeFirstOrThrow();

// Add the variant with text
await project.db
  .insertInto("variant")
  .values({
    id: crypto.randomUUID(),
    messageId: message.id,
    matches: [],
    pattern: [{ type: "text", value: "Bonjour!" }],
  })
  .execute();
```

## Saving changes

If you're using the unpacked format, changes sync automatically when `syncInterval` is enabled. To explicitly save:

```typescript
import { saveProjectToDirectory } from "@inlang/sdk";
import fs from "node:fs";

await saveProjectToDirectory({
  fs,
  project,
  path: "./project.inlang",
});
```

`loadProjectFromDirectory()` and `saveProjectToDirectory()` both accept `node:fs`. `saveProjectToDirectory()` writes translation resource files through import/export plugins. If no exporter plugin is configured, save the canonical packed file instead:

```typescript
import fs from "node:fs/promises";

const blob = await project.toBlob();
await fs.writeFile("project.inlang", new Uint8Array(await blob.arrayBuffer()));
```

## Next steps

- [CRUD API](/docs/crud-api) — Full reference for query operations
- [Data Model](/docs/data-model) — Understand bundles, messages, and variants
- [Unpacked Project](/docs/unpacked-project) — Loading projects from git repos
- [Architecture](/docs/architecture) — See how tools fit in
