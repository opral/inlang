---
"@inlang/sdk": patch
---

Preserve the original error when a Lix transaction commit fails. Serialize Kysely connection leases so unrelated queries cannot join another caller's transaction and concurrent transactions execute independently. Beginning, committing, or rolling back a controlled transaction now releases its connection if it fails. Consumed transactions reject further queries instead of executing outside the transaction.

Restoring an in-memory project snapshot replaces file content at snapshot-owned paths, including files initialized by Lix, while preserving unrelated destination files.
