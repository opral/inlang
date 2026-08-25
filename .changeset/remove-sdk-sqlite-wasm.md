---
"@inlang/sdk": patch
---

Remove the obsolete SQLite WASM dependency, public schema initializer, and special handling for unsupported legacy database artifacts. The SDK database API uses Lix through Kysely's PostgreSQL query compiler.
