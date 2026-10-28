---
"@inlang/plugin-i18next": minor
---

Find unused keys with `inlang check --unused-messages`. The plugin reads `t("key")` from `useTranslation`, `getFixedT` and `i18next.t`, `$t` of i18next-vue, `<Trans i18nKey>` and `<Translation>` in JavaScript and TypeScript, and resolves namespaces, plurals, context and keys written as constants (`t(KEYS.title)`, including constants imported from another file). It only reports a key as unused when every usage can be resolved: dynamic keys, `keyPrefix`, `returnObjects`, `fallbackNS`, custom separators, translators passed to other functions, translation files read directly (`en.title` of an imported `en.json`, `i18n.store`) and Vue, Svelte, Astro or CommonJS files that use i18next make the analysis incomplete, and `inlang check` lists where.
