---
"@inlang/plugin-android": patch
---

Saving a project no longer rewrites whole `strings.xml` files. The export keeps the text of every `<string>` and plural item that didn't change, the XML declaration, comments, whitespace, order, and elements the plugin doesn't import (e.g. `<string-array>`, `<color>`), so that git only shows the edited translations. Changed elements are written in place, new ones are inserted after the element that precedes them in the plugin's order, and removed ones are removed together with the comment directly above them.
