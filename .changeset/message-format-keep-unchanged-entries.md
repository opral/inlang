---
"@inlang/plugin-message-format": patch
---

Exports keep the text of unchanged messages. When the SDK passes the current files to `exportFiles` (SDK 4), a message whose data didn't change keeps its exact text in the file: legacy shapes, escaping, inline arrays, key order, indentation, line endings and a missing `$schema` stay as they are, so that only edited messages change in git. New messages are inserted after the message before them (sorted with `sort`), removed ones are dropped. Without the current file, e.g. for a new locale, the file is written as before. The export is also no longer quadratic in the number of messages.
