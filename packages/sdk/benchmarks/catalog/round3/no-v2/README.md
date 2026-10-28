# Catalog loading through the existing importer

All candidates use the existing `importFiles()` API. No V2 hook or sink is present.
These are the loader phases extracted from 20 serial fresh-process diagnostic
trials: five rotated trials per plugin and size, on macOS arm64 and Node 22.21.1.
The same SDK build loads three flat JSON locale files (en/de/fr), with a username
input per message, through either frozen message-format 4.5.5 or the updated plugin.

| Keys × 3 locales | Frozen plugin | Updated ordinary importer | Less loading time |
| ---------------- | ------------: | ------------------------: | ----------------: |
| 6,400            |     112.58 ms |                  65.58 ms |               42% |
| 13,300           |     258.01 ms |                 144.88 ms |               44% |

The timer measures `loadProjectCatalog({ path, fs, writePluginCache: true })`.
It includes settings, plugin and resource-file reads, parsing, validation/copying,
and nested catalog construction. The SDK module is preloaded; code generation,
declaration emission, output writes, fixture construction and verification are
excluded. Files were just created, so filesystem caches are warm. This is not a
complete compiler or CLI benchmark, and its medians must not be mixed with other
cohorts. Complex-message behavior is covered by tests rather than this fixture.

`results.jsonl` extracts only the loader time and validation/provenance fields;
`summary.json` reports median/min/max. Compiler-output hashes agree across the
plugin variants for each size. The complete diagnostic rows, five-run public
compile comparison, and reproduction commands are in the Paraglide PR's
`benchmark/project-catalog/round3/no-v2` report:
[Paraglide PR #842](https://github.com/opral/paraglide-js/pull/842).
`provenance.json` captures the measured working trees and artifact hashes;
recorded commits alone omit the uncommitted API removal at measurement time.
