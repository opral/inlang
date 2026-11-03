# Local product validation before coordinated publication

The product sources use SDK/editor exports introduced by this change. The next SDK minor (4.2.0 or later), editor-component minor (14.1.0 or later) and native format plugins must be published and the product dependency ranges/lockfiles bumped before deployment. Existing registry manifests deliberately do not name nonexistent releases. A regular install using today's published versions alone cannot build the new feature.

## Verified locally

- SDK: build, TypeScript and 403 tests passed; 2 existing skipped tests and 2 todo cases. ESLint passed with one preexisting unused-disable warning.
- Native format plugins: 376 tests, typechecks and builds passed; one existing skipped test.
- Shared editor: build, TypeScript and 113 tests passed.
- Fink: production build, TypeScript and 103 tests passed.
- Sherlock: extension TypeScript, webview production build and 28 relevant tests passed.
- Parrot: TypeScript, production UI build and 253 tests passed before final release review fixes.
- CLI: TypeScript, 66 provider/bundle tests and 15 orchestration tests passed, with two existing orchestration skips. API responses were mocked.
- Paraglide: compiler TypeScript and focused tests passed, including real local SDK/native-plugin and companion ingestion with description-only documentation refresh.
- Eight real format plugins passed directory roundtrip and portable reimport checks. Native formats also passed companion-to-native migration checks.

The inlang repository and the sibling `paraglide-js`, `inlang-fink`, `sherlock-descriptions` and `parrot-descriptions` checkouts contain the implementation on `codex/bundle-descriptions`. Existing `sherlock` and `parrot-figma` checkouts were left untouched. Feature and release PRs must be validated against published dependency versions before product deployment.

## SDK and format roundtrips

After building the SDK and plugins, run:

```sh
corepack pnpm@10.23.0 --filter @inlang/sdk test
corepack pnpm@10.23.0 --filter @inlang/sdk lint
node scripts/test-bundle-descriptions.mjs
```

The smoke test uses actual message-format, JSON, i18next, next-intl, ICU, Apple strings, Android and Apple string-catalog plugins. It checks import, description-only editing, directory reopen, portable export/reimport, clearing and native fallback migration in isolated temporary projects.

## Product builds

For local validation, keep `inlang`, `inlang-fink`, `sherlock-descriptions` and `parrot-descriptions` as sibling checkouts. Run these from `inlang`:

```sh
corepack pnpm@10.23.0 install --frozen-lockfile
corepack pnpm@10.23.0 --filter @inlang/sdk build
corepack pnpm@10.23.0 --filter './packages/plugins/**' build
corepack pnpm@10.23.0 --filter @inlang/editor-component build
corepack pnpm@10.23.0 --dir ../inlang-fink install --frozen-lockfile
corepack pnpm@10.23.0 --dir ../sherlock-descriptions install --frozen-lockfile
corepack pnpm@10.23.0 --dir ../parrot-descriptions install --frozen-lockfile
node rfcs/bundle-descriptions/link-local-workspaces.mjs ../inlang-fink ../sherlock-descriptions ../parrot-descriptions
```

The linker replaces pnpm links only for packages already installed by the product, including the nested Sherlock webview. It aligns the extension's Kysely copy with the SDK to avoid duplicate private TypeScript types. It uses relative symlinks, refuses real dependency directories and leaves manifests/lockfiles unchanged. A normal frozen install restores registry dependency links after validation.

```sh
corepack pnpm@10.23.0 --filter @inlang/editor-component test
corepack pnpm@10.23.0 --dir ../inlang-fink typecheck
corepack pnpm@10.23.0 --dir ../inlang-fink exec vitest run tests/project.test.ts tests/sync.test.ts tests/push.test.ts
corepack pnpm@10.23.0 --dir ../inlang-fink build
corepack pnpm@10.23.0 --dir ../sherlock-descriptions exec tsc --noEmit
corepack pnpm@10.23.0 --dir ../sherlock-descriptions exec vitest run src/decorations/contextTooltip.test.ts src/utilities/editor/sherlock-editor-app/src/lib/diffBundles.test.ts src/utilities/project/sdk4DataIntegrity.test.ts
corepack pnpm@10.23.0 --dir ../sherlock-descriptions/src/utilities/editor/sherlock-editor-app build
corepack pnpm@10.23.0 --dir ../parrot-descriptions tsc
corepack pnpm@10.23.0 --dir ../parrot-descriptions exec vitest run src/lib/transfer/ExportWithPlugin.test.ts src/lib/message/store/BundleRows.test.ts src/lib/message/editor/EditorChanges.test.ts src/lib/message/store/InlangV3Project.test.ts src/lib/import/MessageImporter.test.ts
corepack pnpm@10.23.0 --dir ../parrot-descriptions build
```

Sherlock tracks `tsconfig.app.tsbuildinfo`; restore only that generated file after building. Do not discard source changes. Builds here validate compiled artifacts and data boundaries, not live VS Code/Figma/OPFS user journeys. Sherlock extraction retains its existing quick-pick flow; description authoring happens afterward in the shared editor.

## Paraglide integration

The same linker accepts `../paraglide-js` after installing its locked dependencies. With local SDK and message-format links, the SDK integration tests execute rather than skip against pre-feature registry packages:

```sh
node rfcs/bundle-descriptions/link-local-workspaces.mjs ../paraglide-js
corepack pnpm@10.23.0 --dir ../paraglide-js exec tsc --noEmit
corepack pnpm@10.23.0 --dir ../paraglide-js exec vitest run src/compiler/descriptions.test.ts src/compiler/descriptions.sdk-integration.test.ts
```

## Live Fink demo

The Fink checkout includes a local sample backend and production preview:

```sh
corepack pnpm@10.23.0 --dir ../inlang-fink build
corepack pnpm@10.23.0 --dir ../inlang-fink demo:descriptions
```

Open `http://127.0.0.1:5174/?repo=https%3A%2F%2Fgithub.com%2Fdemo%2Fbundle-descriptions&project=project.inlang&open=1`. The four sample bundles cover checkout guidance, saving money, network ports and plurals. All API operations, including pushes, are handled by the local sample backend. Description editing, dirty-state detection and OPFS persistence across reload were verified in the live editor.

Fink's Vite configuration deduplicates shared SDK dependencies so linked local packages use the same Lix value classes. The preview serves compressed WASM bytes without Vite's automatic gzip response decoding because the application's loader decompresses them itself.
