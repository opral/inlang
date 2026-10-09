---
"@inlang/cli": patch
---

`machine translate` only changes the translated messages in translation files. The CLI saves with the SDK, which now passes the current files to the plugin's export, so plugins that support it keep every unchanged message, the key order and the formatting of the files as they are.
