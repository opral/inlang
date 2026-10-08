# Project checks scalability profile

Measured locally on macOS arm64 with Node 22.17.0 and the SDK's pinned Lix 0.19.0. These are synthetic measurements, not latency guarantees. The final runs were sequential; no other task tests/builds or benchmark processes ran alongside them.

## Reproduce

From the repository root:

```sh
pnpm --filter @inlang/sdk build
pnpm --filter @inlang/plugin-m-function-matcher build
cd packages/sdk
node --expose-gc benchmarks/project-checks.mjs 1000 10000 25000
CHECKS_USED_RATIO=0 node --expose-gc benchmarks/project-checks.mjs 1000 10000 25000
```

The benchmark uses a real in-memory Lix and the built m-function matcher. Each bundle has two locale messages and two variants containing 130-character translations. Three locales are configured, so every bundle produces one missing-translation diagnostic. The normal scenario uses 90% of message IDs from ESM source files; the worst case uses none and retains a non-empty source snapshot.

Catalog-only, warm full scans and one-bundle refreshes report the median and maximum of five runs. Cold source analysis and an applied single deletion fix each have one sample. Fixture construction, project opening and source collection are outside the check timings. The first result is retained when reporting post-GC JavaScript heap, as it would be in an editor displaying the diagnostics.

## Catalog and source checks

Times below are milliseconds. Full scans include serializable fix revisions for unused bundles.

| Bundles | Messages / variants | Source files | Catalog only, median | Cold full scan | Warm full scan, median | One-bundle refresh, median | One deletion fix |
| ------: | ------------------: | -----------: | -------------------: | -------------: | ---------------------: | -------------------------: | ---------------: |
|   1,000 |       2,000 / 2,000 |            9 |                32.15 |          78.25 |                  52.54 |                       2.03 |            44.67 |
|  10,000 |     20,000 / 20,000 |           90 |               219.54 |         434.08 |                 371.39 |                       1.95 |           219.11 |
|  25,000 |     50,000 / 50,000 |          225 |               395.82 |       1,087.65 |               1,232.56 |                       6.15 |           916.94 |

At 25,000 bundles, the largest warm full sample was 1,731.41 ms; the largest one-bundle sample was 12.06 ms. The SDK invoked the analyzer exactly once across the cold scan, five warm scans and five scoped refreshes. Applying a fix invoked it again, deliberately.

## Worst case: every message is unused

| Bundles | Diagnostics returned | Warm full scan, median | One-bundle refresh, median | Post-GC JS heap |
| ------: | -------------------: | ---------------------: | -------------------------: | --------------: |
|   1,000 |                2,000 |              129.69 ms |                    4.43 ms |        11.6 MiB |
|  10,000 |               20,000 |              372.47 ms |                    3.69 ms |        19.0 MiB |
|  25,000 |               50,000 |            1,206.07 ms |                    5.01 ms |        33.2 MiB |

Large revision sets use one metadata join rather than repeatedly scanning/joining the catalog for 500-ID chunks. Small scopes and individual fixes retain selective predicates. Translation patterns are never selected by checks or their revision guard.

Whole-process memory is considerably larger than the JavaScript heap: the 25,000-bundle unused run had about 1,164 MiB RSS after fixture construction and 1,332 MiB after the checks/fix. This includes the native Lix engine, fixture storage, query allocations and retained allocator pages. The normal run had roughly 927 MiB before checks and 735 MiB afterward; RSS variation is not a measure of JavaScript allocations attributable to checks. Large in-memory catalogs still have a substantial process-memory cost.

## Source-volume profile

From the repository root:

```sh
node --expose-gc packages/plugins/m-function-matcher/benchmarks/analyze-usage.mjs
```

This isolates parser/traversal costs from database costs. Each ESM TSX component includes a typed parameter, JSX and 40 static message references. The analyzer runs three times per size without an SDK cache.

|  Files | Source size | Median analysis | Largest sample | Post-GC JS heap |
| -----: | ----------: | --------------: | -------------: | --------------: |
|    100 |    0.12 MiB |        12.42 ms |       49.06 ms |         5.7 MiB |
|  1,000 |    1.29 MiB |       112.44 ms |      121.00 ms |         7.6 MiB |
| 10,000 |   13.23 MiB |     1,622.83 ms |    2,252.17 ms |        21.6 MiB |

All three completed and retained the expected number of IDs. The matcher refuses snapshots above 10,000 files or 50 million characters, and individual files above two million characters, with an explicit incomplete result.

## Browser bundle cost

The existing matcher bundle was about 19 KB minified / 7 KB gzip. Including Babel's JavaScript/TypeScript parser increases the bundle to about 330 KB minified / 88 KB gzip. The parser is bundled for browsers, with no filesystem or Node parser dependency. This is a one-time download/module-load cost, not an allocation for every project check.

## Implications

- Use scoped refreshes after translation edits. A full catalog scan on every keystroke is unsuitable for large projects.
- Keep the full source snapshot stable across translation edits so the SDK can reuse analysis.
- Run large initial source scans in an application-owned worker; parser execution is synchronous even though the SDK API returns a promise.
- `applyFix` is a single-fix API and reanalyzes source every time. These results do not establish efficient bulk deletion through a loop of individual fixes.
- The SDK materializes diagnostics and fix revision metadata. There is no pagination or bulk-fix API in this release.
- Fink still owns file fetching, source revision freshness, rendering and refresh scheduling; these measurements exclude network and rendering costs.
