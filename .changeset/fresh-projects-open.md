---
"@inlang/sdk": major
---

Add `openProject({ lix })` so applications can provide and own the Lix used by an Inlang project.

Legacy v1 messages now preserve selectors and variant matches when converted to v2. In-memory project blobs serialize messages and variants as nested bundles and remain able to restore the previous flat snapshot format.

BREAKING: Inlang's registered Lix schema keys are now namespaced as `inlang_bundle`, `inlang_message`, and `inlang_variant`. Existing Lix data stored under the previous unprefixed schema keys is not migrated automatically.

BREAKING: Inlang no longer registers or exposes its own key-value and active-account schemas. `project.id` uses Lix's built-in `lix_id`. The Inlang-specific `account`, `lixKeyValues`, `Account`, and `NewKeyValue` compatibility APIs have been removed; callers own account selection through Lix.

`project.lix` is the unmodified `Lix` instance itself. Inlang does not add a `db` facade or define any APIs under `project.lix`.
