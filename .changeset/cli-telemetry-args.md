---
"@inlang/cli": patch
---

Telemetry no longer sends the command's arguments. They could contain local paths (`--project /Users/…`), `--source` globs and locales. The CLI now only sends the command's name and the names of the flags used, without a project ID or IP geolocation. Crash reports no longer include the hostname, machine details (boot time, memory, CPU, locale, timezone), console output, plugin source code or local paths, and no usage session is sent on every run. `DO_NOT_TRACK=1` and `INLANG_TELEMETRY=off` turn off telemetry and crash reports.
