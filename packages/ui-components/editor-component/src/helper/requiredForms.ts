import type { Declaration, Message, Variant } from "@inlang/sdk";
import {
	literalKeys,
	selectorPluralResolver,
	type Match,
} from "./declarations.js";

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
	variants: readonly Pick<Variant, "matches">[]
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
 * cartesian product of {@link selectorKeys} over the message's selectors (in
 * selector order). A message without selectors needs one form with no matches.
 *
 * @example
 * // ru, selectors [gender (literal keys female, male), count (plural)]
 * requiredForms(message, declarations, "ru").length // 3 × 4 = 12
 */
export function requiredForms(
	message: Pick<Message, "selectors"> & { variants?: Variant[] },
	declarations: readonly Declaration[] | undefined,
	locale: string,
	variants: readonly Pick<Variant, "matches">[] = message.variants ?? []
): Match[][] {
	let combinations: Match[][] = [[]];
	for (const selector of message.selectors ?? []) {
		const { keys } = selectorKeys(
			selector.name,
			declarations,
			locale,
			variants
		);
		const next: Match[][] = [];
		for (const combination of combinations) {
			for (const key of keys) {
				next.push([
					...combination,
					key === "*"
						? { type: "catchall-match", key: selector.name }
						: { type: "literal-match", key: selector.name, value: key },
				]);
			}
		}
		combinations = next;
	}
	return combinations;
}
