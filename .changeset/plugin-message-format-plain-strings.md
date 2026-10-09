---
"@inlang/plugin-message-format": patch
---

Files keep their form when a message is a plural or select in one locale and a plain string in another, and variants are written in an order runtimes select them in.

- A plain string stays a plain string, e.g. German `"files_deleted": "{count} Dateien gelöscht"` next to an English plural. Earlier versions rewrote it on the first export into `[{ "declarations": […], "selectors": [], "match": { "count=*": "{count} Dateien gelöscht" } }]` and on the next export into `"selectors": ["count"]`. Files that already have either complex form keep it: a key that only matches `*` is not added to a `selectors` list the file has. Only the complex form for a plain string without placeholders (`"match": ["…"]`) is written as the plain string again, the same message.
- A plain string with a placeholder that another locale declares as a local, e.g. `{formattedAmount}`, no longer adds an `input formattedAmount` declaration to the other locales' files.
- An `=0` form that an editor adds to a plural is the newest variant and was written after the catch-all `*`, where runtimes that try the forms in file order (Paraglide JS 2.26) never select it. Variants are now written in MessageFormat 2 preference order (exact and literal keys before plural categories, the catch-all last) if, and only if, the stored order would select another variant for some input. Files in which every variant can be selected keep their order byte for byte.
