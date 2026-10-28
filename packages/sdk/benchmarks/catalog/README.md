# Directory catalog loading

Latest measurements and implementation details are in [round2](./round2/README.md).
The measurements below record the initial catalog implementation.

Measured on 2026-10-28 with Node22.21.1 on macOS. Both paths use this PR's SDK
build (base main6cf0158a7d, SDK4.0.4, Lix0.20.1), the same message-format4.5.5
plugin, and fresh copies of the same generated JSON files. Three locales
(en/de/fr), flat keys, one username input in every message. Three fresh-process
trials per case, serial execution and rotated backend order. The files have just
been created, so this is not a cold disk-cache or full CLI-startup measurement.

| Keys × 3 locales | Project loader + nested query | Catalog loader | Reduction |
|---|---:|---:|---:|
| 6,400 | 3,204 ms | 251 ms | 92.2% |
| 13,300 | 5,964 ms | 510 ms | 91.4% |

The timed operation ends with settings and all nested messages available. Module
import and project close times are recorded separately. No Lix handle is created
for the catalog path. The project path retains its ordinary storage/history
semantics; these APIs intentionally serve different use cases. Canonicalized
catalog hashes match at each size after removing generated row identities while
retaining variant order. This synthetic workload does not predict every plugin
or project, and these are local machine measurements.

Reproduce after building the SDK and the message-format plugin:

```sh
CATALOG_BENCH_PLUGIN=/absolute/path/to/inlang-message-format/dist/index.js \
  node packages/sdk/benchmarks/catalog/run.mjs > catalog-results.jsonl
```

`results.jsonl` contains all12trials. `summary.json` contains medians and matching
catalog hashes. Fixture creation, hash calculation and cleanup are outside the
catalog-ready timer. The script uses a fresh temporary directory for every trial.

This PR prepares an unreleased SDK API. No package version or dependency range
has been changed, and these benchmarks do not require publishing a package.
