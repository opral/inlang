---
"@inlang/plugin-i18next": patch
---

Fix all array returns being assumed to be i18n translators.

Previously, the plugin would match any array destructuring assignment to a call expression as a translator, which is not correct. Now, it only matches when the first element of the array is named `t`, which is the convention for i18n translators.
This is a large issue in react projects especially, where many hooks return arrays, and the plugin would incorrectly assume all of them were translators.
For example, it was assuming that the following code was a translator, which is not correct:

```ts
const [value, setValue] = useState("initial");
```
