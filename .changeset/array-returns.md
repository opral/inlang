---
"@inlang/plugin-i18next": patch
---

Stop inferring React state hook results as i18n translators while preserving custom tuple translator aliases.

Tuples from `useState` and `useReducer` imported from React, including aliased and namespace imports, no longer cause state values to be treated as translators. For example:

```ts
const [value, setValue] = useState("initial");
```

Custom tuple translators remain tracked under any name, such as `const [translate] = useCustomTranslation()`. Dynamic keys and translators passed elsewhere still make analysis incomplete, preventing potentially used messages from being offered for deletion.
