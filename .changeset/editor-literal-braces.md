---
"@inlang/editor-component": patch
---

`<inlang-pattern-editor>` keeps braces that are text of the stored pattern as text. An escaped ICU literal such as `It''s '{'literal'}'` imports as the text "It's {literal}", but the editor showed `{literal}` as a variable token and, once the user typed anything in that text, saved it as the variable `literal` (and the host declared it). Only a `{name}` the user types or pastes (also over a selection) becomes a variable now. Braces of the stored text stay text when the user edits next to or inside them, presses Enter, inserts a variable or markup, makes them bold, or removes a token next to them. A deletion never creates a variable (deleting the `-` of `{na-me}` leaves the text `{name}`).
