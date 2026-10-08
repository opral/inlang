import type { Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import {
	isNumericKey,
	literalKeys,
	matchFor,
	matchValue,
	resolveAnnotation,
	resolveInputName,
	selectorPluralResolver,
	type PluralResolver,
} from "./declarations.js";

/**
 * The selectors of a message, grouped by what a translator sees as one choice.
 *
 * Usually a group is one selector. The exception is an exact number next to a
 * plural category of the same input, which is how ICU `{count, plural, =0 {…}
 * one {…} other {…}}` is imported: an un-annotated selector for `=0` and a
 * `:plural` selector for `one` / `other`, both reading `count`. MessageFormat 2
 * lets one `:number`/plural selector carry `0`, `one` and `*` keys, so such a
 * pair is presented as a single choice ("0", "one", "other") and a form never
 * needs an exact number *and* a category at the same time (that combination
 * can never be chosen, the exact number wins).
 */
export type SelectorGroup = {
	/** The selector names of the group, in message order (two for an exact-number + plural pair). */
	names: string[];
	/** The input variable the group reads from ("count" for "countPlural"). */
	input: string;
	/** Plural rules of the locale, when the group selects by plural category. */
	plural?: PluralResolver;
	/** All keys to show, in display order: exact numbers, categories, other literal keys, "*" last. */
	keys: string[];
	/** The keys a locale is expected to cover. */
	requiredKeys: string[];
	/** The match value per selector name for a key ("*" = catch-all). */
	values(key: string): Record<string, string>;
	/** The key of a variant in this group. */
	keyOf(variant: Pick<VariantRow, "matches">): string;
};

type SelectorMessage = Pick<MessageRow, "selectors"> & {
	variants?: readonly Pick<VariantRow, "matches">[];
};

function pluralKeys(
	name: string,
	plural: PluralResolver,
	variants: readonly Pick<VariantRow, "matches">[]
) {
	const used = literalKeys(name, variants);
	const numbers = used
		.filter(isNumericKey)
		.sort((a, b) => Number(a) - Number(b));
	const others = used.filter(
		(key) => !isNumericKey(key) && !plural.categories.includes(key)
	);
	const categories = plural.categories.filter(
		(category) => category !== "other"
	);
	return {
		numbers,
		keys: [
			...categories,
			...(used.includes("other") ? ["other"] : []),
			...others,
			"*",
		],
		// MF2 requires a catch-all, and it already covers CLDR's "other".
		required: [...categories, "*"],
	};
}

/**
 * Groups `message.selectors` (see {@link SelectorGroup}) for a locale. The
 * variants default to `message.variants`. The literal keys of a selector that
 * is not a plural (a select such as gender) are the ones used in `variants`
 * and in `referenceVariants` (the reference language), so that a translation
 * is asked for the same genders as the source.
 */
export function selectorGroups(
	message: SelectorMessage,
	declarations: readonly Declaration[] | undefined,
	locale: string,
	variants: readonly Pick<VariantRow, "matches">[] = message.variants ?? [],
	referenceVariants: readonly Pick<VariantRow, "matches">[] = []
): SelectorGroup[] {
	const names = (message.selectors ?? []).map((selector) => selector.name);
	// exact-number selector -> the plural selector it belongs to
	const exactOf = new Map<string, string>();
	const taken = new Set<string>();
	for (const name of names) {
		if (!selectorPluralResolver(name, declarations, locale)) continue;
		const input = resolveInputName(name, declarations);
		const partner = names.find(
			(other) =>
				other !== name &&
				!taken.has(other) &&
				!exactOf.has(other) &&
				input !== undefined &&
				resolveInputName(other, declarations) === input &&
				resolveAnnotation(other, declarations) === undefined &&
				literalKeys(other, variants).every(isNumericKey)
		);
		if (partner) {
			exactOf.set(partner, name);
			taken.add(partner);
		}
	}
	const pluralOf = new Map(
		[...exactOf].map(([exact, plural]) => [plural, exact])
	);

	const groups: SelectorGroup[] = [];
	for (const name of names) {
		if (exactOf.has(name)) continue; // part of the group of its plural selector
		const input = resolveInputName(name, declarations) ?? name;
		const plural = selectorPluralResolver(name, declarations, locale);
		const exact = pluralOf.get(name);
		if (plural && exact) {
			const exactNumbers = literalKeys(exact, variants)
				.filter(isNumericKey)
				.sort((a, b) => Number(a) - Number(b));
			const pluralPart = pluralKeys(name, plural, variants);
			const onPlural = pluralPart.numbers.filter(
				(key) => !exactNumbers.includes(key)
			);
			const numbers = [...exactNumbers, ...onPlural].sort(
				(a, b) => Number(a) - Number(b)
			);
			const pair = names.filter((value) => value === exact || value === name);
			groups.push({
				names: pair,
				input,
				plural,
				keys: [...numbers, ...pluralPart.keys],
				requiredKeys: [...exactNumbers, ...pluralPart.required],
				values: (key) => {
					const result = { [exact]: "*", [name]: "*" };
					if (key === "*") return result;
					if (exactNumbers.includes(key)) result[exact] = key;
					else result[name] = key;
					return result;
				},
				keyOf: (variant) => {
					const exactValue = matchValue(matchFor(variant, exact));
					return exactValue !== "*"
						? exactValue
						: matchValue(matchFor(variant, name));
				},
			});
			continue;
		}
		if (plural) {
			const { numbers, keys, required } = pluralKeys(name, plural, variants);
			groups.push({
				names: [name],
				input,
				plural,
				keys: [...numbers, ...keys],
				requiredKeys: required,
				values: (key) => ({ [name]: key }),
				keyOf: (variant) => matchValue(matchFor(variant, name)),
			});
			continue;
		}
		const keys = [
			...new Set([
				...literalKeys(name, variants),
				...literalKeys(name, referenceVariants),
			]),
			"*",
		];
		groups.push({
			names: [name],
			input,
			keys,
			requiredKeys: keys,
			values: (key) => ({ [name]: key }),
			keyOf: (variant) => matchValue(matchFor(variant, name)),
		});
	}
	return groups;
}
