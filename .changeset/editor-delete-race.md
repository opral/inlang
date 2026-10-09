---
"@inlang/editor-component": patch
---

`<inlang-pattern-editor>` keeps stored braces as text when keys arrive before the browser reports the caret. Pressing End and then Backspace (or Delete, or typing) faster than `selectionchange` turned a stored `{name}` between the old and the new caret into a variable. The editor now tells typed text from the text before and after an edit instead of the last known selection, so a deletion never creates a variable, regardless of event timing. Typing or pasting `{name}` still creates one.
