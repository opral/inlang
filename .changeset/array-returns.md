---
"@inlang/plugin-i18next": patch
---

Distinguish data tuples from possible translators using their source, rather than assuming every destructured array value is a translator.

The usage analyzer follows bounded local and snapshot-imported hook implementations, including simple wrappers and aliases. Proven data returned by hooks such as `useGetData()` and `useTheme()` can be passed to helpers or components without suppressing unused-message diagnostics.

Translator aliases remain tracked under any name. React state and reducer results are checked rather than unconditionally excluded, because they can themselves hold translators. TypeScript parameter properties and namespace scopes are handled when resolving bindings.

Opaque hooks, mutable or escaped return values, cycles, and unsupported shapes remain explicitly incomplete when their usages cannot be resolved. Unused-message deletion fixes are withheld in those cases. External packages and context providers whose return values are unavailable in the source snapshot are not inferred from their names alone.
