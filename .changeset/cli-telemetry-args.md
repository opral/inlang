---
"@inlang/cli": patch
---

Telemetry no longer sends the command's arguments. They could contain local paths (`--project /Users/…`), `--source` globs and locales. The CLI now only sends the command's name and the names of the flags used. Error reports no longer include the hostname or console output, and local paths in them are replaced. `DO_NOT_TRACK=1` and `INLANG_TELEMETRY=off` turn off telemetry and error reports.
