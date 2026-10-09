---
"@inlang/cli": minor
---

Add `inlang check`, which reports a project's settings and plugin errors, translation problems and unused messages, grouped by check or as JSON for CI and editors.

```sh
npx @inlang/cli check --project ./project.inlang
```

- All checks run by default: missing and empty translations, empty forms, missing or unknown variables, missing markup, missing plural/select forms and selectors, and unused messages. Per-check flags such as `--missing-translations` or `--unused-messages` run only those checks.
- `--locales de,fr` reports only findings for these locales and validates them against the project's settings (`--languageTags` is accepted as an alias).
- Unused messages are found with the project's usage-analysis plugin (`@inlang/plugin-m-function-matcher` ≥ 2.3.0 for Paraglide) in the source under the project's parent directory, or `--source <paths...>`. Git-ignored files (outside git: dot directories and a top-level `dist`, `build` and `coverage`), `node_modules`, Paraglide's compiled output and known build tool configs are skipped. When usages can't all be resolved, e.g. a dynamic ``m[`${fieldName}_label`]()``, `check` lists the file, line and code instead of reporting unused messages. With an older matcher, it asks to update the module URL in `settings.json`.
- `--format json` prints the full report (with a `version`).
- Exits with 1 when there are findings or project errors, and with 0 otherwise or with `--no-fail`.

`inlang validate` and `inlang lint` are deprecated and hidden from `--help`. Both keep working and print a deprecation warning: `validate` still only reports settings and plugin errors, and `lint` does nothing else, as in CLI v3.
