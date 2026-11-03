# Sherlock and Parrot description UI review

The review uses the actual product components and styles through `ui-smoke`, not recreated editor mockups. Sherlock loads App and its real change/reset message flow. Parrot loads InlangEditor, its real converters, and MessageSaveQueue. The host bridge and persistence destination are local fixtures; VS Code/Figma native persistence is not claimed as verified.

## Findings and fixes

- Parrot displayed optimistic description text after a rejected save even though it showed the save error. Reproduced in the browser with the actual message queue. The Description wrapper now receives a reset generation and rebinds a fresh stored bundle snapshot when a bundle write fails. Retest shows the original stored guidance and the error together.
- Parrot guidance began at the locale-label gutter rather than under the key. It now uses the actual key inset: 16px gutter + 14px message icon + 8px label gap = 38px.
- No additional Sherlock product change was necessary. Its actual App reset message restores the stored bundle after a rejected save.

## Browser evidence

All evidence is from this review run and stored under:

`/Users/samuel/.codex/visualizations/2026/11/03/01a1a316-b64a-7233-9753-0153b4954029/design-evidence/`

- `sherlock-parrot-ui.jpg`: both actual editors in dark mode, each in a 360px frame, with preview/bridge scope visible.
- `parrot-failed-save-fixed.jpg`: error feedback with stored guidance restored after rejection.
- `parrot-light-long.jpg`: 320px light-theme panel with long multiline guidance.
- `sherlock-contrast-long.jpg`: 320px high-contrast panel with long multiline guidance.

The saved screenshots were opened/inspected. Browser DOM snapshots also verified the real description controls, editable fields, state changes, status messages and error feedback. At the tested 320px widths, document width and scroll width both equal 320px.

## Checks

1. Sherlock dark 360px: readable guidance under the key; deliberate editing; save emits the bundle change to the mocked extension bridge.
2. Sherlock light 320px: rejected save returns the stored bundle through App's actual reset message flow; guidance reverts correctly.
3. Sherlock high contrast 320px: long multiline guidance wraps and locale fields remain within the panel.
4. Parrot dark 360px: shared guidance fits Figma's compact token/font system.
5. Parrot: empty Add description, save through the real queue, local preview reload, and Clear all behave correctly.
6. Parrot: rejected save restores stored guidance after the fix and retains visible error feedback.
7. Parrot light 320px: long multiline guidance and translations fit without page overflow.
8. Parrot TypeScript and production build pass. Nineteen queue, editor-change and legacy-conversion tests pass.

Typography and density intentionally follow each host: VS Code's 13px theme font and Parrot's existing 11px Inter system. Text/surface/border/focus colors use the hosts' existing token mappings. The shared input appears only during editing. Native control focus remains visible; this is not a full accessibility compliance audit.

## Remaining release verification

- Native VS Code extension file writes and reopen.
- Native Figma document persistence, linked-layer changes, undo and reopen.
- Coordinated SDK/editor/plugin publication and dependency updates, as documented in the RFC.

The Fink repository source disclosure is not fabricated in these editors: this review concerns the shared description UI and each app's existing editing flow.
