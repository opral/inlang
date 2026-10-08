import type { Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import {
	literalKeys,
	selectorPluralResolver,
	type Match,
} from "./declarations.js";
import { selectorGroups } from "./selectorGroups.js";

/**
 * The keys a selector is expected to cover in a locale.
 *
 * - plural selectors (a variable annotated with `plural`, type cardinal or
 *   ordinal, following aliases): the categories `Intl.PluralRules` reports
 *   for the locale in CLDR order (zero, one, two, few, many), with the
 *   required catch-all "*" standing in for "other".
 * - every other selector (or a plural whose rules are unknown at design
 *   time): the literal keys used anywhere in the variants, plus "*".
 */
export function selectorKeys(
	name: string,
	declarations: readonly Declaration[] | undefined,
	locale: string,
	variants: readonly Pick<VariantRow, "matches">[]
): { plural: boolean; keys: string[] } {
	const resolver = selectorPluralResolver(name, declarations, locale);
	// MF2 requires a catch-all, and it already covers CLDR's "other".
	if (resolver)
		return {
			plural: true,
			keys: [
				...resolver.categories.filter((category) => category !== "other"),
				"*",
			],
		};
	return { plural: false, keys: [...literalKeys(name, variants), "*"] };
}

/**
 * Every match combination a message is expected to have in a locale: the
 * cartesian product of the required keys of its selector groups (see
 * {@link selectorGroups}) in selector order. A message without selectors needs
 * one form with no matches.
 *
 * An exact number and a plural category of the same input (ICU
 * `=0 {…} one {…} other {…}`, imported as two selectors) are one group, so the
 * impossible form "0 and one" is never required.
 *
 * `referenceVariants` (optional): the variants of the reference language. Their
 * literal keys count as used keys of select selectors (not of plurals).
 *
 * @example
 * // ru, selectors [gender (literal keys female, male), count (plural)]
 * requiredForms(message, declarations, "ru").length // 3 × 4 = 12
 */
export function requiredForms(
	message: Pick<MessageRow, "selectors"> & { variants?: VariantRow[] },
	declarations: readonly Declaration[] | undefined,
	locale: string,
	variants: readonly Pick<VariantRow, "matches">[] = message.variants ?? [],
	referenceVariants: readonly Pick<VariantRow, "matches">[] = []
): Match[][] {
	let combinations: Record<string, string>[] = [{}];
	for (const group of selectorGroups(
		message,
		declarations,
		locale,
		variants,
		referenceVariants
	)) {
		const next: Record<string, string>[] = [];
		for (const combination of combinations) {
			for (const key of group.requiredKeys) {
				next.push({ ...combination, ...group.values(key) });
			}
		}
		combinations = next;
	}
	return combinations.map((combination) =>
		(message.selectors ?? []).map(({ name }): Match => {
			const value = combination[name] ?? "*";
			return value === "*"
				? { type: "catchall-match", key: name }
				: { type: "literal-match", key: name, value };
		})
	);
}
