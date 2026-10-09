---
"@inlang/sdk": major
---

**Breaking: `project.db` uses the table and column names Lix stores.** The SDK no longer rewrites table and column names before queries reach Lix, and no longer strips the `lixcol_*` columns from results. The Kysely schema declares the tables and columns exactly as Lix exposes them, so the SQL you write is the SQL that runs.

| Before (3.x)                    | After (4.0)                              |
| ------------------------------- | ---------------------------------------- |
| `selectFrom("bundle")`          | `selectFrom("inlang_bundle")`            |
| `selectFrom("message")`         | `selectFrom("inlang_message")`           |
| `selectFrom("variant")`         | `selectFrom("inlang_variant")`           |
| `bundleId`                      | `bundle_id`                              |
| `messageId`                     | `message_id`                             |
| `"bundle.id"`                   | `"inlang_bundle.id"`                     |
| `"message.bundleId"`            | `"inlang_message.bundle_id"`             |
| `"variant.messageId"`           | `"inlang_variant.message_id"`            |

Also changed:

- `selectBundleNested()` returns messages with `bundle_id` and variants with `message_id`, and filters with `.where("inlang_bundle.id", "=", id)` (`"bundle.id"` throws).
- `createMessage()` and `createVariant()` return `bundle_id` and `message_id`.
- `insertBundleNested()`, `upsertBundleNested()` and `updateBundleNested()` take snake_case rows, as do `insertInto()` and `updateTable()`.
- `selectAll()` includes the `lixcol_*` columns. Leave them out when you write a row back with `insertInto()` or `updateTable()`.
- `BundleRow`, `MessageRow` and `VariantRow` (plus `NewBundleRow`, `BundleRowUpdate`, …) type the database rows. `BundleNested` and `MessageNested` use them. `Bundle`, `Message` and `Variant` are the camelCase plugin shapes.

`updateBundleNested()` now only writes the inlang columns (`declarations`; `bundle_id`, `locale`, `selectors`; `message_id`, `matches`, `pattern`) of the bundle, messages and variants it receives. It used to pass the nested `messages` array to the bundle update, which failed.

Plugins are not affected: `importFiles()` and `exportFiles()` still exchange `Bundle`, `Message` and `Variant` with camelCase `bundleId` and `messageId`, and the SDK maps them to and from the database columns. Existing plugins work with this SDK.

See "Migrating to 4.0" in the SDK README.
