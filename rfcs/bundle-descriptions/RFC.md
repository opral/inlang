# Bundle descriptions

Status: Implemented locally for review. Package publication and coordinated product dependency updates are pending.

Add one optional `bundle.description` field for guidance shared across a string’s translations. Developers can explain a string once, translators and agents can read the same explanation, and editors can maintain it without losing it during saves or format conversion.

Deliver this across the SDK, shared editing component, Fink, Sherlock, Parrot, supported format plugins, CLI translation and Paraglide documentation.

## User need

Short strings often omit the information needed to translate them correctly. “Save” might mean saving money or storing data. A description records the intended meaning, where the string appears, what placeholders represent, and relevant translation constraints.

The requester in [issue 4350](https://github.com/opral/inlang/issues/4350) wants this context available to LLMs without requiring a codebase investigation. They accepted an explicit metadata property and currently maintain a JSONC compilation step as a workaround.

The intended workflow is:

1. Add or edit a description in a source file or an inlang editor.
2. See that description beside the bundle in other inlang tools.
3. Use it when translating, including through CLI providers.
4. Edit translations, save and reopen without losing the description.

## Data contract

```ts
type Bundle = {
  // Existing fields remain unchanged.
  description?: string | null;
};
```

The description belongs to the bundle because the bundle identifies one translatable unit across locales. It applies even when a target translation does not exist. The description itself is plain text and may be written in any language; it is not automatically translated or copied into each locale.

Example:

```text
Final checkout button. Confirms payment immediately.
Keep it short. {amount} includes the currency.
```

| Operation | Meaning |
| --- | --- |
| Create without a description | Store `null` |
| Update with the field omitted | Retain the existing value |
| Update with a string | Replace the description |
| Update with `null` | Clear the description |
| Clear the shared editor input | Write `null` |

Preserve nonempty text, including line breaks. Normalize an empty or whitespace-only description to `null` at authoring/import boundaries.

Descriptions are maintained guidance. Discussion threads, authors, replies and resolution are outside this feature. There is no `message.description`, variant-specific field, structured context schema or freshness system in this release.

## Storage and ownership

The SDK exposes one field regardless of file format. Each bundle has one authoritative file representation: native metadata when its format can store the description, otherwise a shared SDK companion file. Files are persistence for the SDK field, not independent sources of translation instructions.

| Format | Mapping |
| --- | --- |
| Inlang message format | Explicit `description` property on the first complex object of the base-locale entry |
| Apple string catalog | Shared string-entry `comment` |
| Apple strings | Unambiguously attached entry guidance in the base-locale file |
| Android XML | Unambiguously attached entry guidance in the base-locale file |
| i18next, JSON, next-intl, ICU-in-JSON | SDK companion file |

### Inlang message format

Preserve the existing complex-array shape. Convert a plain string to that shape only when required to store a description.

Source-locale entry:

```json
{
  "checkout_submit": [{
    "description": "Final checkout button. Confirms payment immediately. Keep it short.",
    "match": { "*": "Place order" }
  }]
}
```

Export exactly one description, on the first complex object. Import may normalize identical repeats, but differing descriptions within the same source entry are an import conflict. Target translations do not receive copies of the shared description. This shape is implemented by the updated plugin.

### Native comments

Promote only identifiable translator guidance. Preserve file headings, licenses, unrelated extraction metadata and target-locale comments as file metadata. Target-locale notes do not override the bundle description.

Clearing a description must remove its native representation. Existing metadata-preservation logic must not restore the deleted text on export.

### Companion file

Use one SDK implementation for formats without native metadata. It is automatically discovered, included in project saves and portable exports, and tracked in Git. Fink must include it in commits. Applications edit `bundle.description`; they do not implement their own companion-file logic.

Companion path and versioned representation:

```text
project.inlang/descriptions.json
```

```json
{
  "version": 1,
  "descriptions": {
    "checkout_submit": "Final checkout button. Confirms payment immediately. Keep it short."
  }
}
```

The generated project `.gitignore` must explicitly allow this file. Stable bundle IDs are the keys. Clearing removes the entry, renaming moves it, and deleting a bundle removes its description. Standalone resource exports must include the companion when needed to retain descriptions; a translations-only export must explicitly report omitted metadata.

A described bundle without a writable native source entry uses the companion file. Do not fabricate source text to hold metadata. When a writable native slot becomes available or the format changes, move the representation during save and remove the old one. Conflicting native and companion values fail import with the bundle ID and both locations; do not silently select one.

## Editor presentation

Descriptions are readable text in the bundle header, beside source/code actions where available. An empty editable bundle shows a quiet “Add description” action in the same row. Click the description to edit it; Save commits one bundle change, Cancel or Escape discards the draft, and Clear writes `null`. Ctrl/Cmd+Enter saves. Merely typing or blurring does not commit a description. The shared component uses the existing `--inlang-*` theme tokens, mapped by Fink, Sherlock and Parrot to their host styles. Read-only guidance stays readable without an editing affordance.

## Import semantics

Mutation omission and source-file omission are different cases:

| Import case | Result |
| --- | --- |
| Description-aware native plugin imports the authoritative source entry with a description | Set the value |
| Same plugin imports that entry with no description | Clear the value, unless the bundle is explicitly owned by companion storage |
| Partial import excludes the authoritative source entry or companion entry | Retain the value |
| Older plugin does not support descriptions | Retain the value |
| Authoritative companion file is present and an entry has been removed | Clear the previously companion-owned description for that bundle |

The SDK must know whether a plugin supports descriptions and which entries an import authoritatively covers. Do not infer deletion from an omitted property emitted by an older plugin. Hosts pass `sdkCapabilities: ["bundle-description"]`. Native plugins advertise `supportsBundleDescriptions: true` and emit description patches only when the host advertises that capability.

Changing the base locale through a loaded project’s `settings.set()` retains its canonical descriptions. Complete a normal project save before reopening from the directory so native exports write guidance into the new source representation.

A cold directory load has no previous settings or source-ownership history. When changing `baseLocale` directly in `settings.json`, move shared guidance into the new source entries or `descriptions.json` in the same change. Former-source and other target notes remain file metadata; the SDK does not guess which target note was previously authoritative. For Apple catalogs, update `sourceLanguage` together with the project base locale. Automatic recovery from an external source-locale reconfiguration is outside this release.

## Shared editing and product integration

Implement one reusable multiline Description control in `@inlang/editor-component`. Show existing guidance as readable text and use “Add description” when empty. The textarea has an accessible Description label. The control appears once per bundle and uses the existing bundle-change mechanism.

Compose the control into each product’s actual editor. Updating the shared bundle wrapper alone is insufficient because the products also compose smaller shared editing controls.

| Product | Required integration |
| --- | --- |
| Fink | Mount the control; include descriptions in change detection, drafts, merges, SDK writes and Git output |
| Sherlock | Mount the control; preserve descriptions in webview diffs and extension writes; keep extraction unchanged and support escaped hover display |
| Parrot | Mount the control; preserve descriptions through row adapters, legacy/canvas edits, SDK writes, Figma persistence and undo |
| Paraglide | Include escaped descriptions in generated JSDoc/declarations so editor hovers show guidance |
| CLI and agents | Return descriptions through normal bundle reads; pass them to translation providers that support context |

Application adapters must preserve descriptions even when a user only changes translation text. Description-only changes must trigger persistence and route to the owning native file or companion file.

Descriptions remain data. Escape them for hover markup and generated documentation, and keep them out of runtime translation strings and production runtime payloads.

## CLI translation

Reuse the OpenAI/DeepL provider context plumbing proposed in [PR 4514](https://github.com/opral/inlang/pull/4514). Read context from `bundle.description` rather than introducing a permanent `translationDescriptors` setting.

Providers that lack context support warn and continue according to existing CLI behavior. An i18n-ally importer is outside the initial scope.

## Implementation order

1. Implement the SDK field, existing-project migration, import semantics, compatibility boundary, query/write projections, snapshots and companion persistence.
2. Implement native mappings and unchanged-entry comparisons in format plugins. Verify both fresh imports and edited exports.
3. Add the shared Description control, then compose it into Fink, Sherlock and Parrot and update their adapters and persistence paths.
4. Connect CLI context consumption, Sherlock hovers and Paraglide documentation.
5. Run the acceptance checks across the integrated products and publish compatible package versions in dependency order.

## Acceptance criteria

- An existing project upgrades without losing translations or metadata.
- A description authored through a source file or shared editor is visible through SDK reads and the other editors after synchronization.
- Editing or clearing only a description survives save, project reopen and a clean Git checkout.
- Translation-only updates and partial locale imports retain descriptions.
- Removing authoritative guidance clears the SDK value and does not resurrect old native comments.
- Rename, deletion, base-locale changes and native-to-companion conversion preserve the ownership rules.
- i18next and other JSON runtime catalogs contain only their intended runtime data; their descriptions travel in the companion file.
- Fink drafts/merges/Git output, Sherlock webview writes and Parrot canvas/legacy edits retain the field.
- Old/new host and plugin combinations either work within the compatibility contract or produce an explicit version error.
- CLI requests include the matching description; hover and generated-documentation text is safely escaped.

## Implementation decisions

The implementation uses the first complex object of the base-locale message-format entry as its native slot, the versioned companion file above, and companion fallback for bundles without a writable source entry. Companion-only bundles can exist without locale messages; no source translation is fabricated.

Native comment formats reject text they cannot represent safely, with an actionable export error: `*/` inside an Apple strings comment, or `--` inside an Android XML comment. The SDK field remains plain text.

Sherlock's extraction quick-pick keeps its current flow. Authors add descriptions afterward through the shared editor. Product builds have been verified against local SDK/editor/plugin packages; the coordinated release must publish those packages and update product dependency pins before shipping.

## References

- [Feature request and accepted explicit-property direction](https://github.com/opral/inlang/issues/4350)
- [CLI context proposal](https://github.com/opral/inlang/pull/4514)
- [i18n-ally key descriptions and separate locale review comments](https://github.com/lokalise/i18n-ally/blob/main/src/core/Review.ts)
- [Lokalise key descriptions](https://docs.lokalise.com/en/articles/2059009-key-editor-and-key-actions)
- [Lokalise discussion comments](https://docs.lokalise.com/en/articles/1400643-comments)
- [Phrase key description format](https://support.phrase.com/hc/en-us/articles/20038313421468--JSON-Phrase-Strings)

