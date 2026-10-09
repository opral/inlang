---
"@inlang/sdk": minor
---

Translation checks are more precise: variables and markup are compared with the reference forms that have the same exact numbers and select values (plural categories mean different numbers per locale, so a plural's input is needed in every form that isn't one number), a form for one exact number may leave out only that number's input variable, and an empty reference expects no variables. A translation that can't choose like the reference (no selector for a select's values, no plural the locale needs, or no exact-number selector for the reference's `=0`) gets the new `missing-selector` diagnostic with the `values` it can't express. Plural categories only millions select (French, Spanish, Italian, Portuguese, Catalan `many`) are no longer required; `pluralRules().requiredCategories` lists the required ones. Locales such as `pt_BR` are read as `pt-BR`. Full scans read patterns with one query per table, lowering peak memory.
