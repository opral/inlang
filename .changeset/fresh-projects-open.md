---
"@inlang/sdk": major
---

Add `openProject({ lix })` so applications can provide and own the Lix used by an Inlang project.

BREAKING: Inlang's registered Lix schema keys are now namespaced as `inlang_bundle`, `inlang_message`, `inlang_variant`, `inlang_key_value`, and `inlang_active_account`. Existing Lix data stored under the previous unprefixed schema keys is not migrated automatically.
