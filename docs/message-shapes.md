# Message Shapes

This page shows the concrete JSON shapes used by bundles, messages, variants, declarations, selectors, matches, and patterns.

Use these shapes when inserting data through `project.db` or `insertBundleNested()`. A plugin's `importFiles()` returns the same shapes with camelCase `bundleId` and `messageId` in place of `bundle_id` and `message_id`. The SDK maps them to the database columns.

## Minimal Message

```typescript
const messageId = crypto.randomUUID();
const variantId = crypto.randomUUID();

await insertBundleNested(project.db, {
  id: "greeting",
  declarations: [],
  messages: [
    {
      id: messageId,
      bundle_id: "greeting",
      locale: "en",
      selectors: [],
      variants: [
        {
          id: variantId,
          message_id: messageId,
          matches: [],
          pattern: [{ type: "text", value: "Hello world!" }],
        },
      ],
    },
  ],
});
```

## Pattern

A `pattern` is an array. It can mix text, expressions, and markup.

### Text

```typescript
[{ type: "text", value: "Hello world!" }];
```

### Interpolation

Use an `input-variable` declaration for variables provided by the caller, then reference it with an expression.

```typescript
const messageId = crypto.randomUUID();
const variantId = crypto.randomUUID();

{
  id: "greeting",
  declarations: [{ type: "input-variable", name: "name" }],
  messages: [
    {
      id: messageId,
      bundle_id: "greeting",
      locale: "en",
      selectors: [],
      variants: [
        {
          id: variantId,
          message_id: messageId,
          matches: [],
          pattern: [
            { type: "text", value: "Hello " },
            {
              type: "expression",
              arg: { type: "variable-reference", name: "name" },
            },
            { type: "text", value: "!" },
          ],
        },
      ],
    },
  ],
}
```

### Expression With Annotation

Annotations describe formatting functions. Plugins decide which annotations they can import or export.

```typescript
{
  type: "expression",
  arg: { type: "variable-reference", name: "count" },
  annotation: {
    type: "function-reference",
    name: "number",
    options: [],
  },
}
```

Options can use literals or variable references:

```typescript
{
  type: "function-reference",
  name: "number",
  options: [
    {
      name: "style",
      value: { type: "literal", value: "currency" },
    },
    {
      name: "currency",
      value: { type: "variable-reference", name: "currency" },
    },
  ],
}
```

### Markup

Markup is represented as pattern parts. This example corresponds to `Click <link>here</link><icon/>`.

```typescript
[
  { type: "text", value: "Click " },
  { type: "markup-start", name: "link" },
  { type: "text", value: "here" },
  { type: "markup-end", name: "link" },
  { type: "markup-standalone", name: "icon" },
];
```

Markup can include options and attributes:

```typescript
{
  type: "markup-start",
  name: "link",
  options: [
    {
      name: "href",
      value: { type: "literal", value: "/pricing" },
    },
  ],
  attributes: [
    {
      name: "external",
      value: true,
    },
  ],
}
```

## Selectors And Matches

Selectors choose which variables a message uses to pick a variant. Matches on each variant must refer to selector names.

### Literal Match

```typescript
{
  type: "literal-match",
  key: "platform",
  value: "ios",
}
```

### Catch-All Match

```typescript
{
  type: "catchall-match",
  key: "platform",
}
```

## Plural-Style Selector

Use an input variable for the caller-provided value, a local variable for the derived selector value, and variants that match the local variable.

```typescript
const messageId = crypto.randomUUID();
const oneVariantId = crypto.randomUUID();
const otherVariantId = crypto.randomUUID();

{
  id: "items_count",
  declarations: [
    { type: "input-variable", name: "count" },
    {
      type: "local-variable",
      name: "countPlural",
      value: {
        type: "expression",
        arg: { type: "variable-reference", name: "count" },
        annotation: {
          type: "function-reference",
          name: "plural",
          options: [],
        },
      },
    },
  ],
  messages: [
    {
      id: messageId,
      bundle_id: "items_count",
      locale: "en",
      selectors: [{ type: "variable-reference", name: "countPlural" }],
      variants: [
        {
          id: oneVariantId,
          message_id: messageId,
          matches: [{ type: "literal-match", key: "countPlural", value: "one" }],
          pattern: [{ type: "text", value: "One item" }],
        },
        {
          id: otherVariantId,
          message_id: messageId,
          matches: [
            { type: "literal-match", key: "countPlural", value: "other" },
          ],
          pattern: [
            {
              type: "expression",
              arg: { type: "variable-reference", name: "count" },
            },
            { type: "text", value: " items" },
          ],
        },
      ],
    },
  ],
}
```

## Variant Linkage: CRUD Versus Plugin Import

Use `message_id` when you already have a concrete message row id. This is the normal shape for direct CRUD writes and `insertBundleNested()`.

```typescript
const messageId = crypto.randomUUID();

{
  id: "variant_1",
  message_id: messageId,
  matches: [],
  pattern: [{ type: "text", value: "Hello" }],
}
```

Use `messageBundleId` and `messageLocale` when returning variants from a plugin's `importFiles()`. In that flow, message ids are often omitted so the SDK can generate or reuse them while importing.

```typescript
{
  messageBundleId: "greeting",
  messageLocale: "en",
  matches: [],
  pattern: [{ type: "text", value: "Hello" }],
}
```

The SDK resolves `messageBundleId` plus `messageLocale` to the matching message and generates ids when needed.

Rule of thumb:

- Direct database writes: use `message_id`.
- `insertBundleNested()`: use `message_id`, and reuse the same id from the message object.
- Plugin `importFiles()`: use `messageBundleId` plus `messageLocale`, unless your plugin deliberately manages stable message ids itself. Then use `messageId`.

## Next Steps

- [Data Model](/docs/data-model) - Understand bundles, messages, and variants
- [CRUD API](/docs/crud-api) - Insert and query these shapes
- [Writing a Plugin](/docs/write-plugin) - Return these shapes from `importFiles()`
