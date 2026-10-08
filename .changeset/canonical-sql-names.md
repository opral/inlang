---
"@inlang/sdk": minor
"@inlang/cli": patch
"@inlang/editor-component": minor
---

Use the canonical Lix SQL names in `project.db`.

The SDK no longer rewrites table and column names before queries reach Lix, and no longer strips the `lixcol_*` columns from results. The Kysely schema declares the tables and columns exactly as Lix exposes them, so the SQL you write is the SQL that runs.

| Before                  | After                          |
| ----------------------- | ------------------------------ |
| `selectFrom("bundle")`  | `selectFrom("inlang_bundle")`  |
| `selectFrom("message")` | `selectFrom("inlang_message")` |
| `selectFrom("variant")` | `selectFrom("inlang_variant")` |
| `message.bundleId`      | `message.bundle_id`            |
| `variant.messageId`     | `variant.message_id`           |
| `"bundle.id"`           | `"inlang_bundle.id"`           |

Database rows are typed as `BundleRow`, `MessageRow` and `VariantRow` (plus `NewBundleRow`, `BundleRowUpdate`, …). `BundleNested`, `MessageNested` and the query utilities use these row types. `selectBundleNested(db).where("inlang_bundle.id", "=", id)` replaces `.where("bundle.id", "=", id)`.

The plugin API is unchanged. Plugins still return and receive `Bundle`, `Message` and `Variant` with camelCase `bundleId` and `messageId`, and the SDK maps them to and from the database columns. Existing plugins work with this SDK, and plugins built against it work with older SDKs.
