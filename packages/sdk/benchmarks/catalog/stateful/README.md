# Stateful catalog loader measurements

This benchmark measures the unreleased API refactor from a stateless snapshot loader to `createCatalogLoader().load()`. It does not measure an incremental parser, code generation, disk publication, bundling or browser HMR.

`baseline-loader.mjs` freezes the previous loader from SDK commit `068061aae29ef3288e1634a053da49733495a77b`, with imports redirected to unchanged SDK helpers. This fixture is not part of the package's public exports or published files. The candidate imports the built narrow catalog entry directly.

## Reproduce

Build the SDK and message-format plugin, then run this from the SDK package with Node 24.22.1:

```sh
CATALOG_BENCH_PLUGIN=../plugins/inlang-message-format/dist/index.js node benchmarks/catalog/stateful/run.mjs
```

`CATALOG_BENCH_BASELINE` can override the frozen baseline module. `CATALOG_BENCH_OUTPUT` selects another results directory. Use `--worker stateful 200 validate` to compare every intermediate update, including plural patterns, nested message keys and namespace deletion, with the old full loader. A loader's reset/update batches are applied to a consumer-owned map before comparison. Generated message/variant identities are excluded; declarations, locales, selector/variant order and full patterns are compared.

Five fresh-process trials per implementation and size, rotated serially on the same machine. Fixtures contain 6,400 or 13,300 keys in each of three locales. Both use identical built plugin bytes. Module imports, fixture setup, source-file saves, applying returned batches and validation are outside the measured loader calls. Initial loads are recorded separately. Every timed trial verifies its final catalog against a full baseline load; the separate small validation run checks every stage.

## Interpretation

See `summary.json` for medians/ranges and returned bundle counts, `results.json` for individual trials, `metadata.json` for runtime/plugin/baseline fingerprints, and `validation.json` for stage coverage.

Unchanged single-importer inputs skip parsing and normalization. One edited key emits one full bundle, rather than the entire catalog. These output deltas are the input needed for selective code generation.

Edited resources currently still run the ordinary complete plugin import and normalization, followed by semantic fingerprint comparison. This can be slower than the old snapshot loader, particularly on the first edit after initial loading. The small returned delta is not evidence of incremental parsing. Likewise, format-only edits return no bundles but still incur a full import. Multiple importers and legacy `loadMessages` retain full-import semantics. No Grai comparison or end-to-end speedup is claimed by this API-only benchmark.

Consumers can retain the loader and apply its batches to drive selective code generation. This benchmark measures only SDK loading; Paraglide emitter changes and earlier incremental-parser prototypes are separate work and their performance must not be attributed to this refactor.
