import type { VariantRow } from "@inlang/sdk";

/**
 * Small internal helpers for reading variant matches. Not part of the public
 * API. The rules (plural categories, required forms, aliases) live in
 * `@inlang/sdk` (`selectorGroups`, `missingVariants`, `pluralRules`, …).
 */

export type Match = VariantRow["matches"][number];

/** The match of a variant for a selector. A missing match counts as catch-all. */
export function matchFor(
	variant: Pick<VariantRow, "matches">,
	key: string
): Match {
	return (
		variant.matches.find((match) => match.key === key) ?? {
			type: "catchall-match",
			key,
		}
	);
}

/** Literal keys used for a selector across variants, in first-seen order. */
export function literalKeys(
	name: string,
	variants: readonly Pick<VariantRow, "matches">[]
): string[] {
	const keys: string[] = [];
	for (const variant of variants) {
		for (const match of variant.matches) {
			if (
				match.key === name &&
				match.type === "literal-match" &&
				!keys.includes(match.value)
			) {
				keys.push(match.value);
			}
		}
	}
	return keys;
}
