---
"@inlang/sdk": patch
---

Allow `paraglide.config.js`, `.mjs`, `.ts`, and `.cjs` in the generated project `.gitignore` so Paraglide compiler options can be committed and shared across clones and CI. Existing projects receive the updated ignore rules when the SDK upgrade regenerates project metadata. Fixes https://github.com/opral/paraglide-js/issues/775.
