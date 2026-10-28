# importFilesV2 import and ownership ablations

This measures **import plus catalog assembly only** with plugin/SDK modules,
settings and file contents already in memory. It excludes directory reads,
settings/plugin discovery, module startup, compiler code generation, declarations
and output writes. Do not replace whole-loader or public-compile measurements
with these numbers.

Recorded locally on macOS arm64, Node 22.21.1, five serial fresh processes per
variant/size, rotating variant order. Inputs are 6,400 or 13,300 plain messages in
en/de/fr, each reading `username`. Every trial verifies message counts, expected
rendered strings, and a canonical logical AST hash excluding opaque generated
IDs. All variants agree. This fixture does not cover complex catalog throughput.

## Production pair

Both paths use the **same optimized plugin bundle** (SHA256
`9274091ca2d0570270294bafc201286132232e1b52263b02c76ac714a721ba57`), not the older
unoptimized parser. V1 calls its ordinary `importFiles` then the SDK's
`createFreshCatalog`; V2 calls its scalar hook with `createCatalogStream`.
The recorded bundle calls the hook `tryImportCatalog`; source now names it
`importFilesV2`. The runner accepts both names without changing their behavior.

| Messages × 3 locales | Production V1 | V1 parsing | V1 normalization | Production V2 |
| -------------------- | ------------: | ---------: | ---------------: | ------------: |
| 6400                 |       56.53ms |    20.73ms |          35.60ms |       28.34ms |
| 13300                |      111.14ms |    38.62ms |          70.67ms |       45.09ms |

Columns are independent medians, so phase medians need not sum to the total.
V1 normalization includes flat-row lookup/grouping, JSON validation/copying,
identities, sorting and nested catalog construction. The V2 hook streams directly
into SDK-owned nodes, retaining its validation and alias protection.

## Matched representation control

A shared eligibility scan/tokenizer emits either alternating scalar text/input
parts or ordinary AST patterns. Scalar payloads use the production SDK sink.
The artifact AST sink copies patterns with the **exact production JSON copier**
and performs the same active/closed checks, frozen callback, duplicate-locale
Set, one-shot take and private-map clearing. It is a common-case prototype,
not a complete proposed public AST import API.

| Messages × 3 locales | Scalar sink | AST plus defensive copy | Scalar marginal saving | Unsafe AST transfer floor |
| -------------------- | ----------: | ----------------------: | ---------------------: | ------------------------: |
| 6400                 |     29.13ms |                 34.45ms |         5.32ms (15.4%) |                   26.77ms |
| 13300                |     46.84ms |                 57.64ms |        10.80ms (18.7%) |                   45.45ms |

The unsafe floor retains plugin AST references and omits defensive copying and
some generic JSON checks. Retained plugin aliases can mutate the catalog, so it
is diagnostic only and cannot be shipped as equivalent behavior.

The result supports the Pareto conclusion: bypassing flat-row and general
normalization machinery, together with a trimmed common-case tokenizer, gets
most of the gain even with an AST-copying handoff. Roughly four-fifths is a
qualitative comparison with the separately measured production pair, not an
exact causal attribution. Avoiding a plugin-owned intermediate AST remains a real 5–11 ms marginal
benefit in the matched import-stage comparison. It is not responsible for the
whole V1/V2 difference. No additional payload API or further scalar micro-
optimization is justified by this experiment alone.

The shared tokenizer differs from the general production V1 parser, which also
handles declaration merging and compatible fallback syntax. These comparisons
therefore do not isolate ownership from every parser/control-flow difference.
Full pipeline effects require separate public compile trials.

## Raw cohorts and memory

`results.jsonl` preserves the original 70 trials: production pair 20 trials plus
50 exploratory representation/queued controls. Its AST sink initially omitted
lifecycle/duplicate bookkeeping; do not use those exploratory AST timings as the
matched comparison. `matched-results.jsonl` preserves 30 new safety-matched trials.
`summary.json` labels both cohorts separately and never combines their medians.
Queued controls retain entire payloads before SDK handoff, changing allocation
lifetimes/GC; their phase times cannot be treated as streaming stage costs.

The production pair's median measured-phase heap delta was 38.2→18.2MB and
75.4→38.4MB; peak RSS before verification was 117264→88816KiB and
163104→128320KiB. Heap deltas depend on when GC runs and are not allocation
counts or retained-heap proofs. RSS includes input setup and module loading.

## CPU diagnostics

`profile-results.jsonl` and `profile-summary.json` are three separate 13,300-message
trials, excluded from all timing medians. Sampling starts **after** file/settings
construction and stops **before** logical verification. Raw profiles remain in
local artifacts under `catalog-import-ablation/*-13300.cpuprofile`.

The V1 sample attributes about 26.3 ms self time to `createFreshCatalog`, 35.2 ms to
GC, and 12.4 ms self/16.2ms inclusive to JSON copying. V2 samples show the parser
(~18.1ms), sink (~15.8ms) and GC (~12.4ms). The matched AST-copy profile still
contains JSON-copy work. These are coarse single-process diagnostics with only
108/45/53 samples. Inspector plumbing contributes roughly 9 ms in the latter
profiles; sampling/GC/JIT affect the diagnostic wall times. They corroborate
normalization/allocation costs, not precise causal percentages.

## Reproduce

Build the SDK and bundled message-format plugin first. Use a pinned Node binary
and a new results directory. Runners have no machine-specific source paths:

```sh
export SDK_ROOT=/absolute/path/to/packages/sdk
export PLUGIN=/absolute/path/to/plugin/dist/index.js
export RESULTS=/tmp/catalog-import-ablation-new
export ROUNDS=5
node packages/sdk/benchmarks/catalog/import-files-v2/run-matrix.mjs
node packages/sdk/benchmarks/catalog/import-files-v2/summarize.mjs
```

The matrix copies selected built SDK helpers and plugin into `RESULTS/frozen`
with their checksums. It adds benchmark-only exports for the SDK's private JSON
copier, text validator and identity comparator; production files are untouched.
A private helper signature change fails preparation rather than silently using
another implementation. Optional comma-separated cases can select a cohort:

```sh
node packages/sdk/benchmarks/catalog/import-files-v2/run-matrix.mjs v1,v2
```

Use another new `RESULTS` directory for each matrix. Separate diagnostic profiles
use an already prepared frozen result directory:

```sh
PROFILE=/tmp/catalog-import-ablation-new/v1.cpuprofile \
  node packages/sdk/benchmarks/catalog/import-files-v2/run-case.mjs v1 13300 900
```

Profile V2 and `shared-ast-copy` similarly. Raw profiled rows are written to
`profile-results.jsonl` and rejected by the ordinary timing summarizer.
`metadata.json` records original and matched provenance; profile URLs are
sanitized in the compact committed summary.
