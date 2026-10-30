---
"@inlang/sdk": minor
---

Support the `{language}` placeholder in path patterns, resolved to the primary language subtag of a locale (BCP 47), e.g. `en` for `en-US`. Adds the `getPrimaryLanguageSubtag()` helper and the `@inlang/sdk/language-subtag` export. The existing `{locale}` and legacy `{languageTag}` placeholders are unchanged.

---

```json
{
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{language}.json"
  }
}
```
