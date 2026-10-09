---
"@inlang/sdk": minor
"@inlang/plugin-message-format": patch
"@inlang/plugin-i18next": patch
"@inlang/plugin-json": patch
"@inlang/plugin-next-intl": patch
"@inlang/plugin-icu1": patch
"@inlang/plugin-apple-xcstrings": patch
"@inlang/plugin-apple-strings": patch
---

Deleting every message of a translation file now persists. If all messages of a locale (or of an i18next namespace of a locale) were deleted, the export had nothing to write for that file, so `saveProjectToDirectory` left it on disk as it was, and the deleted messages came back on the next load.

The plugin contract of `exportFiles` with `files` is extended: a plugin also returns a file for every previous file that holds messages the project no longer has and that the export doesn't otherwise write, without those messages. `keepUnchangedJsonEntries` does this for the JSON plugins (message-format, i18next, json, next-intl, icu1, apple-xcstrings): every top-level key that imports to a message is removed, everything else (`$schema`, keys the plugin doesn't read) and the formatting stay, so a file whose messages were all deleted becomes `{}`, or `{ "$schema": … }`. The file is kept, not deleted: the plugin still lists it for the locale, the next message of the locale goes there, and tools may expect it. The previous file's `path` is passed as `metadata.pathPattern`, so `saveProjectToDirectory` writes it to exactly that file, also one of a `pathPattern` array. Files that hold no deleted message (e.g. an empty file, or an i18next namespace whose messages another namespace overrides) stay byte-identical.

`@inlang/plugin-apple-strings` writes the `.strings` file of such a locale without its entries and their comments; other comments (e.g. a license header) stay.
