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

Catalog-only, IDs-only, warm full scans and one-bundle refreshes report the median and maximum of five runs. Cold source analysis and an applied single deletion fix each have one sample. Fixture construction, project opening and source collection are outside the check timings. The first result is retained when reporting post-GC JavaScript heap, as it would be in an editor displaying the diagnostics.

These numbers were re-measured after the translation checks became part of the default run (October 2026): every check without a `checks` option now loads all patterns. The three sizes run one after another in one process, so process memory below grows across rows; the isolated 25,000-bundle run is reported separately.

## Catalog and source checks

Times below are milliseconds. "Catalog only" is `checkProject({ project })` without source files: missing translations plus the translation checks, which read every pattern. "IDs only" is `checks: ["missing-translation"]`, which reads IDs and locales only. Full scans include the translation checks and serializable fix revisions for unused bundles.

| Bundles | Messages / variants | Source files | IDs only, median | Catalog only, median | Cold full scan | Warm full scan, median | One-bundle refresh, median | One deletion fix |
| ------: | ------------------: | -----------: | ---------------: | -------------------: | -------------: | ---------------------: | -------------------------: | ---------------: |
|   1,000 |       2,000 / 2,000 |            9 |            34.88 |                93.62 |         115.18 |                  84.78 |                       3.92 |            47.47 |
|  10,000 |     20,000 / 20,000 |           90 |           119.32 |               460.66 |         725.77 |                 661.84 |                       3.53 |           218.85 |
|  25,000 |     50,000 / 50,000 |          225 |           321.98 |             1,211.89 |       1,931.55 |               1,751.30 |                       5.13 |           539.06 |

At 25,000 bundles, the largest warm full sample was 1,853.85 ms; the largest one-bundle sample was 10.18 ms. The SDK invoked the analyzer exactly once across the cold scan, five warm scans and five scoped refreshes. Applying a fix invoked it again, deliberately. About 0.9 s of a 25,000-bundle full scan is loading and checking patterns; skip the translation checks with `checks` when only missing translations and unused messages matter.

## Worst case: every message is unused

| Bundles | Diagnostics returned | Warm full scan, median | One-bundle refresh, median | Post-GC JS heap |
| ------: | -------------------: | ---------------------: | -------------------------: | --------------: |
|   1,000 |                2,000 |              132.79 ms |                    3.68 ms |        14.0 MiB |
|  10,000 |               20,000 |              688.69 ms |                    5.10 ms |        21.2 MiB |
|  25,000 |               50,000 |            1,981.52 ms |                    9.13 ms |        35.5 MiB |

Large revision sets use one metadata join rather than repeatedly scanning/joining the catalog for 500-ID chunks. Small scopes and individual fixes retain selective predicates. The revision guard never selects patterns; the translation checks do.

## Process memory

Whole-process memory is far larger than the JavaScript heap: it is dominated by the native Lix engine, which keeps the memory a query needed. In an isolated 25,000-bundle run, the process had about 915 MiB RSS after fixture construction. Loading every pattern with one join of the bundle, message and variant tables raised the peak to about 2,011 MiB. Full scans now read the three tables with one query each and nest the rows in JavaScript, which keeps the same speed and brings the peak to about 1,610 MiB (−400 MiB). Chunking the join by bundle IDs (an `IN` list or an ID range) cut the peak to about 1,040–1,100 MiB but took 16–18 s instead of 1.2 s, because every chunk scanned the tables again, so it isn't used. In the sequential run above, the peak RSS was 418 MiB, 930 MiB and 1,654 MiB after the 1,000-, 10,000- and 25,000-bundle rows. Large in-memory catalogs still have a substantial process-memory cost.

## Source-volume profile

From the repository root:

```sh
node --expose-gc packages/plugins/m-function-matcher/benchmarks/analyze-usage.mjs
node --expose-gc packages/plugins/m-function-matcher/benchmarks/analyze-usage.mjs svelte
```

The source tables below were measured after the QA fixes, with no concurrent review tests/builds (not re-measured after the parser now also tries decorator syntaxes; a file that parses on the first try costs the same). This isolates parser/traversal costs from database costs. Each ESM TSX component includes a typed parameter, JSX and 40 static message references. The analyzer runs three times per size without an SDK cache.

|  Files | Source size | Median analysis | Largest sample | Post-GC JS heap |
| -----: | ----------: | --------------: | -------------: | --------------: |
|    100 |    0.12 MiB |        16.82 ms |       53.22 ms |         8.0 MiB |
|  1,000 |    1.29 MiB |       127.26 ms |      160.96 ms |         9.9 MiB |
| 10,000 |   13.23 MiB |     1,162.45 ms |    2,883.93 ms |        23.9 MiB |

All three completed and retained the expected number of IDs. The matcher refuses snapshots above 10,000 files or 50 million characters, and individual files above two million characters, with an explicit incomplete result.

Svelte was profiled separately after adding its compiler parser. Each TypeScript component has 20 script references and 20 template references. All runs completed with the expected IDs.

|  Files | Source size | Median analysis | Largest sample | Post-GC JS heap |
| -----: | ----------: | --------------: | -------------: | --------------: |
|    100 |    0.09 MiB |        29.29 ms |       64.37 ms |         8.0 MiB |
|  1,000 |    0.93 MiB |       206.47 ms |      230.14 ms |         9.6 MiB |
| 10,000 |    9.72 MiB |     2,845.37 ms |    3,295.58 ms |        19.0 MiB |

## Browser bundle cost

The existing matcher bundle was about 19 KB minified / 7 KB gzip. Including Babel's JavaScript/TypeScript parser increases the bundle to about 330 KB minified / 88 KB gzip. Adding the Svelte compiler parser brings the final bundle to about 835 KB minified / 214 KB gzip (about 503 KB minified / 126 KB gzip more than Babel alone). Both parsers are bundled for browsers, with no filesystem or Node parser dependency. This is a one-time download/module-load cost, not an allocation for every project check. It can't be lazy-loaded: the SDK imports a plugin as one `data:` URL module, where a separately loaded chunk can't be resolved.

## Implications

- Use scoped refreshes after translation edits. A full catalog scan on every keystroke is unsuitable for large projects.
- Keep the full source snapshot stable across translation edits so the SDK can reuse analysis.
- Run large initial source scans in an application-owned worker; parser execution is synchronous even though the SDK API returns a promise.
- `applyFix` is a single-fix API and reanalyzes source every time. These results do not establish efficient bulk deletion through a loop of individual fixes.
- The SDK materializes diagnostics and fix revision metadata. There is no pagination or bulk-fix API in this release.
- Fink still owns file fetching, source revision freshness, rendering and refresh scheduling; these measurements exclude network and rendering costs.
