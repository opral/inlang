---
"@inlang/plugin-android": patch
"@inlang/plugin-apple-strings": patch
"@inlang/plugin-i18next": patch
"@inlang/plugin-icu1": patch
"@inlang/plugin-message-format": patch
"@inlang/plugin-json": patch
"@inlang/plugin-m-function-matcher": patch
"@inlang/plugin-next-intl": patch
"@inlang/plugin-t-function-matcher": patch
---

Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
