---
"@inlang/editor-component": minor
---

`<inlang-pattern-editor>`: `focus()` right after the editor was created or got a new `variant` focuses it once rendered, so text typed right after "+ Add form" is not lost, and a copy of the pattern passed before (a host re-rendering while a new form is saved) no longer replaces what was typed since. `pluralExamples(locale, type, { exclude })` leaves out numbers that have their own form: with `=0`, English "other" shows 2, 3, 4…; `<inlang-message-forms>` does so for exact numbers and shows an empty form next to filled ones (the SDK's `empty-variant` check) as a warning.
