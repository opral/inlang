# Actual editor UI previews

This local harness imports Sherlock's real Editor, Parrot's real InlangEditor, the shared editor package and the existing host styles. It replaces only the host bridges with local fixture persistence: Sherlock posts actual change messages, while Parrot uses its actual MessageSaveQueue. No VS Code or Figma APIs are called.

From this directory, after linking and building the workspaces as described in `../LOCAL_VALIDATION.md`:

```sh
../../../../inlang-fink/node_modules/.bin/vite build --config vite.config.mjs
../../../../inlang-fink/node_modules/.bin/vite preview --config vite.config.mjs
```

Open port 5182, or `/compare.html` for both editors together. Query parameters select `app=sherlock|parrot`, `theme=dark|light|contrast` and `fixture=normal|empty|long|error`. Parrot uses its actual light/dark Figma token files; contrast is a VS Code fixture. The error fixture rejects writes and exercises rollback. Saves stay in the preview origin's local storage. This verifies rendered UI and edit callbacks, not native VS Code extension writes or Figma document persistence.
