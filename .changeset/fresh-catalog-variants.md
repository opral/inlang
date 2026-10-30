---
"@inlang/sdk": patch
---

Load catalogs with plural, select and other multi-variant messages through the direct catalog path. Until now a single message with selectors, matches or more than one variant sent the whole import through the general importer, which generates a UUIDv7 for every message and variant and maintains merge indexes. Variants with repeated matches, which that importer merges, still use it. The loaded catalog is unchanged apart from the opaque generated message and variant IDs.

With 20,000 keys in three locales, 4% of them plurals, `createCatalogLoader().load()` after one edited message fell from 674 ms to 340 ms (medians of six paired rounds on a shared machine).
