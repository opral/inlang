---
"@inlang/plugin-message-format": patch
---

Keys with dots no longer lose messages, and `sort` no longer reorders variants.

- Messages whose keys have number segments, e.g. `steps.0` and `steps.1`, were written as an array, `"steps": ["…", "…"]`, which the plugin read back as messages without text. Such arrays are now read as the messages they were written for (`steps.0`, `steps.1`; `null` entries are skipped; an object in such an array is a nested key, also if it has a key named `match`), and number segments are written as object keys, `"steps": { "0": "…", "1": "…" }`. A file with the array keeps it until one of its messages is edited.
- Variants whose key has a dot, e.g. `count=1.5` or `channel=v1.beta`, were split at the dot, `"count=1": [null, …, "…"]` or `"channel=v1": { "beta": "…" }`, and lost their text on the next import. Such variants are now read with the dot (`count=1.5`) and written with it again. A number after the dot is read as a number, so `count=1.05`, which was written at index 5, is read as `count=1.5`.
- A message whose key starts with the key of another message, e.g. `a.b` next to `a`, was dropped on export. It is now written with the rest of its key flat, `"a.b"`, in the deepest object it fits in. Keys with an empty segment (`a.`, `a..b`) are written as they are.
- `sort` sorted everything in a file, including the variants of a message, which put the catch-all `*` first, where runtimes that try the variants in file order (Paraglide JS 2.26) always select it. It now only sorts the keys of messages and of the objects that nest them; the variants, declarations and selectors of a message keep their order. Files that earlier versions wrote that way are imported with the variants in the order the export writes them (a variant that is never selected moves before the catch-all), so runtimes select the right variant without editing the file, and the file keeps its bytes.
