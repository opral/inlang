# @inlang/plugin-icu1

## 1.1.1

### Patch Changes

- 3502588: Publish TypeScript declarations and explicit type exports for all official plugins. Keep declaration dependencies available to consumers and exclude test declarations from production builds. Fix the message-format `file-schema` export to reference published JavaScript and declarations.
- Updated dependencies [68eefaf]
  - @inlang/sdk@3.0.7

## 1.1.0

### Minor Changes

- b16efc3: Lower ICU exact `plural` and `selectordinal` cases through a dedicated exact selector during import, while keeping category cases on the plural selector. This keeps exact `=n` arms reachable with the existing Paraglide compiler and serializes the imported shape back to normal ICU `=n` syntax on export.

  This is a minor release because the imported inlang message shape changes for ICU exact plural and ordinal cases.

## 1.0.1

### Patch Changes

- 6defee0: Handle markup elements explicitly in the ICU1 serializer after SDK pattern type updates.

  - Updated serializer type handling for widened pattern unions.
  - Added an explicit user-facing error when markup placeholders are encountered, since ICU MessageFormat 1 does not support markup placeholders.

## 1.0.0

### Major Changes

- 2572cb5: Initial release
