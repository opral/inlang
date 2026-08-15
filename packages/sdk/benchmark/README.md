# Lix 0.10 in-memory performance

This benchmark models the common database operations used by Paraglide JS and
Sherlock. It compares the Lix 0.10 in-memory message store with the former
SQLite-WASM store through the same public inlang Kysely APIs.

## Workload

- 500 bundles
- two locales per bundle (`en`, `de`)
- 1,000 messages and 1,000 variants total
- Paraglide: read the complete nested project for compilation
- Sherlock: read one nested bundle, update one variant, and insert one bundle
  with two translations
- Project load: restore the populated inlang snapshot into a fresh in-memory
  Lix and close it

## Results

The table reports the mean latency averaged across two benchmark runs. Lower is
better. The delta is Lix latency divided by SQLite-WASM latency.

| Operation                        | Lix 0.10 memory | SQLite-WASM |         Delta |
| -------------------------------- | -------------: | ----------: | ------------: |
| Paraglide full nested read       |      22.053 ms |   50.556 ms |  2.29x faster |
| Sherlock point nested read       |       0.110 ms |    0.165 ms |  1.50x slower |
| Sherlock variant update          |       3.045 ms |    0.025 ms | 121.32x slower |
| Sherlock nested insert           |       4.440 ms |    0.289 ms | 15.39x slower |
| Load populated in-memory project |     140.645 ms |         n/a |           n/a |

The two individual Lix means were:

| Operation         |      Run 1 |      Run 2 |
| ----------------- | ---------: | ---------: |
| Full nested read  | 20.146 ms | 23.960 ms |
| Point nested read |  0.104 ms |  0.116 ms |
| Variant update    |  3.051 ms |  3.039 ms |
| Nested insert     |  4.195 ms |  4.686 ms |
| Project load      |134.250 ms |147.040 ms |

The bulk Paraglide query benefits from a single flat join and JavaScript
reconstruction. Lix 0.10's native `INSERT ... RETURNING` and `DEFAULT VALUES`
support remove the v0.9 compatibility readbacks, bringing nested insert latency
down substantially. Point writes still pay a higher Lix engine round-trip and
change-recording cost than SQLite-WASM.

## Environment

- Linux 7.0.0-22-generic, x86_64
- AMD EPYC-Genoa, 16 vCPUs
- Node.js 22.22.1
- pnpm 10.23.0
- Vitest 3.2.4 / Tinybench
- `@lix-js/sdk` 0.10.0

## Reproduce

From the repository root:

```sh
pnpm --filter @inlang/sdk bench
```

Vitest runs each operation for 1.5 seconds after a 300 ms warmup. Project load
runs for 2 seconds after the same warmup.

## Persistence note

The v0.10 Node native in-memory backend cannot export or import an opaque Lix
snapshot; the SDK explicitly reports that memory snapshots are browser-only.
The migration therefore serializes the current inlang entities and project
files into a portable JSON blob and restores them into a fresh in-memory Lix.
This preserves current project state but not Lix branch/history metadata, and
legacy v0.4 SQLite `.inlang` blobs require a separate migration path.
