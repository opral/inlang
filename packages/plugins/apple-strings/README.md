---
title: "Apple .strings plugin: import and export Localizable.strings"
description: "Import and export Apple .strings files, with positional variables, in your Git repo. Add plugin.inlang.apple-strings with a pathPattern to project.inlang/settings.json. For plurals use the .xcstrings plugin."
---

# Apple Strings plugin for Inlang

Reads and writes Apple `.strings` files through Inlang's v2 message model.

Supported: exact message keys, quoted-string escaping, Unicode, and positional variables. Apple `.strings` has no plural construct, so selector/plural messages fail explicitly. Use a future `.xcstrings` or `.stringsdict` plugin for Apple plurals.

```json
{
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-apple-strings@latest/dist/index.js"
  ],
  "plugin.inlang.apple-strings": {
    "pathPattern": "./Localizations/{locale}.lproj/Localizable.strings"
  }
}
```

## Translation descriptions

On SDK hosts supporting bundle descriptions, a block comment directly above a source-locale entry maps to `bundle.description` when it belongs to that entry alone. Blank lines separate document headings; a comment above adjacent entries is treated as a group heading. Target-locale comments remain file metadata.

The shared editor writes descriptions as native `/* ... */` comments in the source file, keeping document comments and target notes when the existing files are available. Removing the attached source comment clears the description. Description text containing `*/` cannot be represented as a block comment and is rejected.
