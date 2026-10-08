import { css } from "lit";

/**
 * Design tokens for the v13 components. Public custom properties
 * (`--inlang-*`) are read with fallbacks so a host app can theme them;
 * components never set them on :host (that would block inheritance).
 *
 * Neutral zinc palette, all text colors have a contrast ≥ 4.5:1 on white.
 */
export const tokens = css`
	:host {
		--_text: var(--inlang-text, #18181b);
		--_text-muted: var(--inlang-text-muted, #52525b);
		--_text-subtle: var(--inlang-text-subtle, #71717a);
		--_border: var(--inlang-border, #e4e4e7);
		--_border-strong: var(--inlang-border-strong, #d4d4d8);
		--_surface: var(--inlang-surface, #ffffff);
		--_surface-muted: var(--inlang-surface-muted, #fafafa);
		--_hover: var(--inlang-hover, #f4f4f5);
		--_accent: var(--inlang-accent, #2563eb);
		--_accent-soft: var(--inlang-accent-soft, #eff6ff);
		--_variable: var(--inlang-variable-color, #1d4ed8);
		--_variable-bg: var(--inlang-variable-background, transparent);
		--_markup: var(--inlang-markup-color, #52525b);
		--_markup-bg: var(--inlang-markup-background, #f4f4f5);
		--_warning: var(--inlang-warning, #b45309);
		--_radius: var(--inlang-radius, 8px);
		--_radius-small: var(--inlang-radius-small, 6px);
		--_font-size-large: var(--inlang-font-size-large, 14px);
		--_font-size: var(--inlang-font-size, 13px);
		--_font-size-small: var(--inlang-font-size-small, 12px);
		--_font-size-caption: var(--inlang-font-size-caption, 11px);
		--_token-font-size: var(--inlang-token-font-size, 0.86em);
		--_token-radius: var(--inlang-token-radius, 4px);
		--_mono: var(
			--inlang-font-mono,
			"JetBrains Mono",
			ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace
		);
		font-family: inherit;
		color: var(--_text);
	}
	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}
`;

/** Styles for rendered pattern parts (variables, markup). */
export const partStyles = css`
	.variable {
		font-family: var(--_mono);
		font-size: var(--_token-font-size);
		color: var(--_variable);
		background: var(--_variable-bg);
		border-radius: var(--_token-radius);
		white-space: nowrap;
	}
	.markup-bold {
		font-weight: 600;
	}
	.markup-italic {
		font-style: italic;
	}
	.markup-underline {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.markup-tag {
		display: inline-block;
		font-family: var(--_mono);
		font-size: 0.72em;
		line-height: 1.3;
		color: var(--_markup);
		background: var(--_markup-bg);
		border: 1px solid var(--_border);
		border-radius: var(--_token-radius);
		padding: 0 3px;
		margin: 0 1px;
		vertical-align: 0.1em;
		font-weight: 400;
		font-style: normal;
	}
`;
