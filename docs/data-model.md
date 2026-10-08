# Data Model

Translations are stored in three tables: **Bundle**, **Message**, and **Variant**.

The data model is relational (SQL) and heavily inspired by [Unicode MessageFormat 2](https://unicode.org/reports/tr35/tr35-messageFormat.html).

```
Bundle (greeting)
├── Message (en)
│   └── Variant ("Hello {name}!")
├── Message (de)
│   └── Variant ("Hallo {name}!")
└── Message (fr)
    └── Variant ("Bonjour {name}!")
```

## Bundle

A bundle groups translations by key. One bundle = one translatable unit across all locales.

```typescript
type Bundle = {
  id: string; // e.g., "greeting", "error_404"
  declarations: Declaration[];
};
```

The `id` is your translation key — what you reference in code. The id is assumed to be stable; changing it would break all references. Declarations define variables available to all messages in the bundle.

See [Message Shapes](/docs/message-shapes) for concrete JSON examples of declarations, selectors, matches, and pattern parts.

## Message

A message is a locale-specific translation. One message per locale per bundle.

```typescript
type Message = {
  id: string; // auto-generated UUID
  bundle_id: string; // references Bundle.id
  locale: string; // e.g., "en", "de", "fr"
  selectors: VariableReference[];
};
```

Selectors are used for conditional matching (plurals, gender, etc.). If your message has no conditions, selectors is empty.

## Variant

A variant is the actual text pattern. Most messages have one variant, but pluralization requires multiple.

```typescript
type Variant = {
  id: string; // auto-generated UUID
  message_id: string; // references Message.id
  matches: Match[]; // conditions for this variant
  pattern: Pattern; // the text content
};
```

### Simple example

A greeting with no pluralization:

```
Bundle: "greeting"
└── Message: locale="en"
    └── Variant: pattern="Hello {name}!"
└── Message: locale="de"
    └── Variant: pattern="Hallo {name}!"
```

### Pluralization example

A message with plural forms needs multiple variants:

```
Bundle: "items_count"
  declarations: [{ type: "input-variable", name: "count" }]
└── Message: locale="en", selectors=["count"]
    └── Variant: matches=[{key: "count", value: "one"}], pattern="One item"
    └── Variant: matches=[{key: "count", value: "other"}], pattern="{count} items"
└── Message: locale="de", selectors=["count"]
    └── Variant: matches=[{key: "count", value: "one"}], pattern="Ein Artikel"
    └── Variant: matches=[{key: "count", value: "other"}], pattern="{count} Artikel"
```

## Pattern syntax

Patterns contain text, expressions (variables), and markup placeholders:

- **Text** — Plain strings: `"Hello world"`
- **Expression** — Variables wrapped in braces: `"Hello {name}!"`
- **Markup start / end** — Wrapping tags: `"{#b}Hello{/b}"`
- **Markup standalone** — Self-closing tags: `"{#icon/}"`
- **Markup options** — Named values stored on markup nodes (`options`)
- **Markup attributes** — Metadata flags/values stored on markup nodes (`attributes`)

Expressions can have annotations for formatting:

```
{count}              // plain variable
{count: number}      // format as number
{date: date}         // format as date
{count: plural}      // pluralization
{#link}Open{/link}   // markup wrapper
{#icon/}             // standalone markup
```

Markup `options`/`attributes` are part of the SDK data model. Support in import/export plugins can vary by format.

## Querying the data model

Use Kysely to query messages:

```typescript
// Get all messages for a bundle
const messages = await project.db
  .selectFrom("inlang_message")
  .where("bundle_id", "=", "greeting")
  .selectAll()
  .execute();

// Get all bundles with their messages
const bundles = await project.db
  .selectFrom("inlang_bundle")
  .leftJoin("inlang_message", "inlang_message.bundle_id", "inlang_bundle.id")
  .selectAll()
  .execute();

// Find missing translations
const allBundles = await project.db.selectFrom("inlang_bundle").selectAll().execute();
const germanMessages = await project.db
  .selectFrom("inlang_message")
  .select("bundle_id")
  .where("locale", "=", "de")
  .execute();

const translatedBundleIds = new Set(
  germanMessages.map((message) => message.bundle_id),
);
const missing = allBundles.filter(
  (bundle) => translatedBundleIds.has(bundle.id) === false,
);
```

## Next steps

- [CRUD API](/docs/crud-api) — Full reference for query operations
- [Message Shapes](/docs/message-shapes) — Concrete JSON shapes for patterns, matches, and declarations
- [Architecture](/docs/architecture) — See how the data model fits in
- [Writing a Tool](/docs/write-tool) — Build a tool that queries messages
- [Plugin API](/docs/plugin-api) — Import types for plugins
