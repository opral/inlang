---
"@inlang/editor-component": patch
---

`<inlang-pattern-editor>` keeps braces that are text of the stored pattern as text. An escaped ICU literal such as `It''s '{'literal'}'` imports as the text "It's {literal}", but the editor showed `{literal}` as a variable token and, once the user typed anything in that text, saved it as the variable `literal` (and the host declared it). Only `{name}` the user types or pastes becomes a variable now; editing next to stored braces leaves them text.
