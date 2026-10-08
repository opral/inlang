# Project checks QA

Six independent GPT-6 Luna reviewers examined the checks, fix application, plugin boundary and JavaScript/TypeScript/JSX/TSX/Svelte analyzer. Findings were fixed and sent back through repeated reviews. All six returned no actionable issues on the same final source state.

| Reviewer         | Focus                                                 | Final review |
| ---------------- | ----------------------------------------------------- | ------------ |
| qa_sdk           | Catalog checks, cache, fix freshness and transactions | Clean        |
| qa_js            | ESM source usage and runtime TypeScript/JSX syntax    | Clean        |
| qa_svelte        | Svelte compiler AST and SDK integration               | Clean        |
| qa_fresh_catalog | Independent catalog/fix and dynamic evaluator QA      | Clean        |
| qa_fresh_plugins | Runtime plugin inputs, outputs and JSON contract      | Clean        |
| qa_fresh_sources | Independent usage and global/evaluator escape probes  | Clean        |

## Fixes from the loop

- Static/computed indirect message namespaces, global-object escapes, browser aliases and destructuring now make usage analysis incomplete.
- Indirect evaluator/function-constructor references and unresolved timer handlers withhold unused findings. Inline timer callbacks remain supported.
- Failure to load every plugin reports incomplete analysis instead of claiming no analyzer exists.
- Malformed runtime analyzer outputs are rejected. Indexed entries are copied into plain arrays before consumption, so custom methods or iterators cannot bypass validation.
- Plugin inputs are frozen and isolated from catalog checks and other analyzers. Public status/issue objects are isolated from the analysis cache.
- Plugin issue metadata is normalized to serializable path/reason fields. Unprintable thrown values still produce an incomplete result.

The source guards intentionally withhold findings for some harmless constructor, global-alias and unresolved timer uses; [usage docs](./checks.md) document that behavior. This release does not provide TypeScript data-flow or arbitrary module-graph analysis.

## Verification

The fixes added 58 automated regression cases across the SDK and matcher. The final suites passed 170 SDK tests and 129 matcher tests, with the SDK's existing two skips and two todos. Both package builds, SDK lint and diff whitespace validation passed. Reviewers also used temporary compiler-backed and end-to-end probes, removed after review.

[Scalability measurements](../benchmarks/README.md) include refreshed isolated TSX/Svelte source profiles and a post-QA catalog/cache sanity profile. The final browser matcher bundle is 833,318 bytes minified / 213,822 bytes gzip.
