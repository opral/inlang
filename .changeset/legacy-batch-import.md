---
"@inlang/sdk": patch
---

`createCatalogLoader` imports the messages of a legacy `loadMessages` plugin in one import per run of distinct bundles instead of one import per message. Each import copied and re-indexed the whole catalog, so a catalog of 6,366 messages in three locales took 40 s to load; it now takes 0.17 s. A repeated bundle still upserts onto the earlier one in order, so precedence and variant order are unchanged. Plugin versions that only implement `loadMessages`, such as `@inlang/plugin-message-format@2`, `@inlang/plugin-i18next@4`, `@inlang/plugin-json@4` and `@inlang/plugin-next-intl@1`, take this path.
