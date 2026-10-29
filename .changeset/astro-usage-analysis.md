---
"@inlang/plugin-m-function-matcher": minor
---

Analyze usages in Astro (`.astro`) files: frontmatter and inline scripts outside expressions as TypeScript, plus template and attribute `{…}` expressions, backtick attribute interpolations and nested Astro shorthand attributes, with references located in the original file. Single- and double-quoted attribute values, `<style>` blocks and HTML comments are literal; external scripts (including self-closing tags and expression or unquoted `src` values), scripts nested inside expressions, and input the scanner cannot delimit keep the analysis incomplete.

Support HTML void elements inside expressions, preserve regex literals when delimiting expressions/frontmatter, and distinguish capitalized Script components and non-executable script data from native JavaScript scripts.
