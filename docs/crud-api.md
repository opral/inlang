# CRUD API

The CRUD API is what makes building i18n tools easy. Instead of parsing and writing translation files in different formats (JSON, XLIFF, YAML, etc.), you query and modify messages directly. Plugins handle the file format conversion at the boundary.

Inlang uses [Kysely](https://kysely.dev) for type-safe database queries. Access it via `project.db`.

```typescript
import { loadProjectFromDirectory } from "@inlang/sdk";
import fs from "node:fs";

const project = await loadProjectFromDirectory({
  path: "./project.inlang",
  fs: fs,
});

// project.db is a Kysely instance
const bundles = await project.db.selectFrom("inlang_bundle").selectAll().execute();
```

> **Saving changes:** CRUD operations update the in-memory `.inlang` database. To save a packed `.inlang` file, call `project.toBlob()`. To save an unpacked `project.inlang/` directory, `saveProjectToDirectory()` needs an import/export plugin; without one, bundles, messages, and variants have no file path to export to.

If the project uses plugins, check `await project.errors.get()` after loading. Close the project with `await project.close()` in one-off scripts.

## Create

### Insert a bundle

```typescript
await project.db
  .insertInto("inlang_bundle")
  .values({
    id: "greeting",
    declarations: [],
  })
  .execute();
```

### Insert a message

```typescript
const message = await project.db
  .insertInto("inlang_message")
  .values({
    id: crypto.randomUUID(),
    bundle_id: "greeting",
    locale: "en",
    selectors: [],
  })
  .returning("id")
  .executeTakeFirstOrThrow();
```

### Insert a variant

```typescript
await project.db
  .insertInto("inlang_variant")
  .values({
    id: crypto.randomUUID(),
    message_id: message.id,
    matches: [],
    pattern: [{ type: "text", value: "Hello world!" }],
  })
  .execute();
```

### Insert nested (bundle + messages + variants)

```typescript
import { insertBundleNested } from "@inlang/sdk";

const messageId = crypto.randomUUID();

await insertBundleNested(project.db, {
  id: "greeting",
  declarations: [],
  messages: [
    {
      id: messageId,
      bundle_id: "greeting",
      locale: "en",
      selectors: [],
      variants: [
        {
          id: crypto.randomUUID(),
          message_id: messageId,
          matches: [],
          pattern: [{ type: "text", value: "Hello!" }],
        },
      ],
    },
  ],
});
```

## Read

### Get all bundles

```typescript
const bundles = await project.db.selectFrom("inlang_bundle").selectAll().execute();
```

### Get bundle by ID

```typescript
const bundle = await project.db
  .selectFrom("inlang_bundle")
  .selectAll()
  .where("id", "=", "greeting")
  .executeTakeFirst();
```

### Get messages by locale

```typescript
const messages = await project.db
  .selectFrom("inlang_message")
  .selectAll()
  .where("locale", "=", "en")
  .execute();
```

### Get messages for a bundle

```typescript
const messages = await project.db
  .selectFrom("inlang_message")
  .selectAll()
  .where("bundle_id", "=", "greeting")
  .execute();
```

### Get variants for a message

```typescript
const variants = await project.db
  .selectFrom("inlang_variant")
  .selectAll()
  .where("message_id", "=", messageId)
  .execute();
```

### Get nested (bundle with messages and variants)

```typescript
import { selectBundleNested } from "@inlang/sdk";

const bundle = await selectBundleNested(project.db)
  .where("inlang_bundle.id", "=", "greeting")
  .executeTakeFirst();

// Returns:
// {
//   id: "greeting",
//   declarations: [],
//   messages: [
//     {
//       id: "...",
//       locale: "en",
//       variants: [{ id: "...", pattern: [...] }]
//     }
//   ]
// }
```

### Join bundles and messages

```typescript
const results = await project.db
  .selectFrom("inlang_bundle")
  .leftJoin("inlang_message", "inlang_message.bundle_id", "inlang_bundle.id")
  .selectAll()
  .execute();
```

### Find missing translations

```typescript
const bundles = await project.db.selectFrom("inlang_bundle").selectAll().execute();
const germanMessages = await project.db
  .selectFrom("inlang_message")
  .select("bundle_id")
  .where("locale", "=", "de")
  .execute();

const translatedBundleIds = new Set(
  germanMessages.map((message) => message.bundle_id),
);
const missingGerman = bundles.filter(
  (bundle) => translatedBundleIds.has(bundle.id) === false,
);
```

## Update

### Update a bundle

```typescript
await project.db
  .updateTable("inlang_bundle")
  .set({
    declarations: [{ type: "input-variable", name: "count" }],
  })
  .where("id", "=", "greeting")
  .execute();
```

### Update a variant's text

```typescript
await project.db
  .updateTable("inlang_variant")
  .set({
    pattern: [{ type: "text", value: "Updated text" }],
  })
  .where("id", "=", variantId)
  .execute();
```

### Update nested

```typescript
import { updateBundleNested } from "@inlang/sdk";

await updateBundleNested(project.db, {
  id: "greeting",
  declarations: [],
  messages: [
    {
      id: messageId,
      locale: "en",
      selectors: [],
      variants: [
        {
          id: variantId,
          matches: [],
          pattern: [{ type: "text", value: "Updated!" }],
        },
      ],
    },
  ],
});
```

## Delete

### Delete a bundle

```typescript
await project.db.deleteFrom("inlang_bundle").where("id", "=", "greeting").execute();

// Cascades: all messages and variants are deleted
```

### Delete a message

```typescript
await project.db.deleteFrom("inlang_message").where("id", "=", messageId).execute();

// Cascades: all variants are deleted
```

### Delete a variant

```typescript
await project.db.deleteFrom("inlang_variant").where("id", "=", variantId).execute();
```

## Upsert

Insert or update based on whether the record exists.

### Upsert a bundle

```typescript
await project.db
  .insertInto("inlang_bundle")
  .values({
    id: "greeting",
    declarations: [],
  })
  .onConflict((oc) =>
    oc.column("id").doUpdateSet({
      declarations: [],
    }),
  )
  .execute();
```

### Upsert nested

```typescript
import { upsertBundleNested } from "@inlang/sdk";

await upsertBundleNested(project.db, {
  id: "greeting",
  declarations: [],
  messages: [...]
});
```

## Next steps

- [Data Model](/docs/data-model) — Understand bundles, messages, and variants
- [Writing a Tool](/docs/write-tool) — Build a complete tool using CRUD operations
- [Unpacked Project](/docs/unpacked-project) — Load projects from disk
