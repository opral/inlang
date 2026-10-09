import type {
	Declaration,
	FunctionReference,
	VariableReference,
} from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";

/**
 * The rules for the selectors of a message: which forms (variants) a locale
 * needs, and which selectors a translator sees as one choice. The translation
 * checks and editors share them, so an editor's "add form" buttons and the
 * `missing-variant` check never disagree.
 */

type WithMatches = { matches: readonly Match[] };
type SelectorMessage = {
	locale: string;
	selectors: readonly VariableReference[];
	variants?: readonly WithMatches[];
};
export type SelectorOptions = {
	/** The variants to look at. Defaults to `message.variants`. */
	variants?: readonly WithMatches[];
	/**
	 * The variants of the reference locale's message. The values of its select
	 * selectors (`female`, `male`) and exact numbers (ICU `=0`) are needed in
	 * the translation too. Plural categories are not: they follow the locale.
	 */
	referenceVariants?: readonly WithMatches[];
};

/** CLDR order of plural categories. `Intl` returns them in engine order. */
const PLURAL_ORDER = ["zero", "one", "two", "few", "many", "other"];

/** The function annotation that applies to a variable, following local aliases. */
export function resolveAnnotation(
	name: string,
	declarations: readonly Declaration[] | undefined,
	seen: Set<string> = new Set()
): FunctionReference | undefined {
	if (!declarations || seen.has(name)) return undefined;
	seen.add(name);
	const declaration = declarations.find((value) => value.name === name);
	if (!declaration) return undefined;
	if (declaration.type === "input-variable") return declaration.annotation;
	if (declaration.value.annotation) return declaration.value.annotation;
	return declaration.value.arg.type === "variable-reference"
		? resolveAnnotation(declaration.value.arg.name, declarations, seen)
		: undefined;
}

/**
 * The variable a declaration ultimately reads, following `.local` aliases:
 * `count` for `.local $countPlural = {$count :plural}`. A variable that is
 * not an alias of another one is its own input.
 */
export function resolveInputVariable(
	name: string,
	declarations: readonly Declaration[] | undefined,
	seen: Set<string> = new Set()
): string {
	if (seen.has(name)) return name;
	seen.add(name);
	const declaration = declarations?.find((value) => value.name === name);
	if (
		declaration?.type === "local-variable" &&
		declaration.value.arg.type === "variable-reference"
	)
		return resolveInputVariable(declaration.value.arg.name, declarations, seen);
	return name;
}

/** True when a selector chooses by plural category (`:plural`, also through aliases). */
/**
 * True when a selector chooses by plural category (`:plural`, also through
 * aliases). `:number` and `:integer` select by value: Paraglide's runtime
 * formats the number, so `count=1` matches and a category such as `one` never does.
 */
export function isPluralSelector(
	selector: string,
	declarations: readonly Declaration[] | undefined
): boolean {
	return resolveAnnotation(selector, declarations)?.name === "plural";
}

/** A match key that is a number, such as `0` or ICU's `=1` imported as `1`. */
export function isNumericKey(value: string): boolean {
	return /^-?\d+(\.\d+)?$/.test(value);
}

/** The value a variant matches for a selector; `*` for the catch-all or no match. */
export function matchValue(variant: WithMatches, selector: string): string {
	const match = variant.matches.find((value) => value.key === selector);
	return match?.type === "literal-match" ? match.value : "*";
}

const NUMERIC_OPTIONS = [
	"minimumIntegerDigits",
	"minimumFractionDigits",
	"maximumFractionDigits",
	"minimumSignificantDigits",
	"maximumSignificantDigits",
];

/** The plural rules of a `plural` selector in a locale. */
export type PluralRules = {
	type: "cardinal" | "ordinal";
	/**
	 * ICU `offset` (a literal number): categories are chosen for the number minus
	 * the offset, so example number `n` of a category stands for `n + offset`.
	 * 0 without one.
	 */
	offset: number;
	/** The categories of the locale in CLDR order (zero, one, two, few, many, other). */
	categories: string[];
	/**
	 * The categories a translation needs: `categories` without those only
	 * millions or compact exponents select, such as French, Spanish or Italian
	 * "many" (1000000). Editors can still offer them.
	 */
	requiredCategories: string[];
	/** Categories that select exactly one number, e.g. German "one" (1) but not Russian "one" (1, 21, 31, …). */
	singleNumberCategories: string[];
	/** `Intl.PluralRules` with the selector's options, to choose a category for a number. */
	rules: Intl.PluralRules;
};
const rulesCache = new Map<string, PluralRules | null>();

/** Numbers that tell whether a category selects a single number. */
const SAMPLES = [
	...Array.from({ length: 1001 }, (_, index) => index),
	...Array.from({ length: 21 }, (_, index) => index / 2 + 0.1),
	...Array.from({ length: 21 }, (_, index) => index / 2),
];

/**
 * The plural rules of a `plural` selector in a locale. Undefined when the
 * selector is not a plural, its type or options are only known at runtime, or
 * the locale is unsupported (never guesses another language).
 */
export function pluralRules(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string
): PluralRules | undefined {
	const annotation = resolveAnnotation(selector, declarations);
	if (annotation?.name !== "plural") return undefined;
	return rulesOf(annotation, locale);
}

function rulesOf(
	annotation: FunctionReference,
	locale: string
): PluralRules | undefined {
	// `pt_BR` as written in some projects: Intl needs `pt-BR`
	locale = locale.replace(/_/g, "-");
	const key = JSON.stringify([locale, annotation.options ?? []]);
	if (!rulesCache.has(key)) {
		let result: PluralRules | null = null;
		try {
			const options: Intl.PluralRulesOptions = { type: "cardinal" };
			let known = true;
			let offset = 0;
			for (const option of annotation.options ?? []) {
				const value =
					option.value.type === "literal" ? option.value.value : undefined;
				if (
					option.name === "type" &&
					(value === "cardinal" || value === "ordinal")
				)
					options.type = value;
				else if (
					option.name === "offset" &&
					value?.trim() &&
					Number.isFinite(Number(value))
				)
					// shifts the number, the categories stay the same
					offset = Number(value);
				else if (
					NUMERIC_OPTIONS.includes(option.name) &&
					value?.trim() &&
					Number.isFinite(Number(value))
				)
					Object.assign(options, { [option.name]: Number(value) });
				else known = false;
			}
			if (known && Intl.PluralRules.supportedLocalesOf(locale).length) {
				const rules = new Intl.PluralRules(locale, options);
				const numbers = new Map<string, Set<number>>();
				for (const sample of SAMPLES) {
					const category = rules.select(sample);
					if (!numbers.has(category)) numbers.set(category, new Set());
					numbers.get(category)!.add(sample);
				}
				const categories = [...rules.resolvedOptions().pluralCategories].sort(
					(a, b) => PLURAL_ORDER.indexOf(a) - PLURAL_ORDER.indexOf(b)
				);
				result = {
					type: options.type ?? "cardinal",
					offset,
					categories,
					// the samples (0–1000 and decimals) reach every category but those for millions
					requiredCategories: categories.filter(
						(category) => category === "other" || numbers.has(category)
					),
					singleNumberCategories: [...numbers]
						.filter(
							([category, values]) => category !== "other" && values.size === 1
						)
						.map(([category]) => category),
					rules,
				};
			}
		} catch {
			result = null;
		}
		if (rulesCache.size >= 256)
			rulesCache.delete(rulesCache.keys().next().value!);
		rulesCache.set(key, result);
	}
	return rulesCache.get(key) ?? undefined;
}

/**
 * The plural categories of a `plural` selector in a locale, in CLDR order (a
 * translation needs `pluralRules().requiredCategories` of them). Undefined
 * when the plural rules are unknown, see {@link pluralRules}.
 */
export function pluralCategories(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string
): string[] | undefined {
	return pluralRules(selector, declarations, locale)?.categories;
}

/**
 * True when a plural category selects exactly one number in the locale, so a
 * translation may spell the number out ("Eine Datei" for German "one").
 */
export function isSingleNumberCategory(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string,
	category: string
): boolean {
	return (
		pluralRules(
			selector,
			declarations,
			locale
		)?.singleNumberCategories.includes(category) ?? false
	);
}

/** The variable a plural's `type` option reads (`type=$pluralType`), if any. */
function typeVariable(annotation: FunctionReference): string | undefined {
	const option = annotation.options?.find((value) => value.name === "type");
	return option?.value.type === "variable-reference"
		? option.value.name
		: undefined;
}

/** The plural annotation with its `type` option set to a literal type. */
function withType(
	annotation: FunctionReference,
	type: string
): FunctionReference {
	return {
		...annotation,
		options: (annotation.options ?? []).map((option) =>
			option.name === "type"
				? { name: "type", value: { type: "literal", value: type } }
				: option
		),
	};
}

/**
 * True when a variant can never be selected in a locale: it matches a plural
 * category the locale's rules never choose. i18next's `_zero` form
 * (`countPlural=zero`, imported next to the exact `count=0`) is unreachable
 * in German, English or French, which never select `zero`; Latvian `zero`
 * (0, 10–20, 30…) is reachable. A plural whose `type` is a variable (i18next's
 * `type=$pluralType` for keys with cardinal and ordinal forms) uses the type
 * the variant matches, or both types for its catch-all. False when the plural
 * rules are unknown, see {@link pluralRules}.
 */
export function isUnreachableVariant(
	variant: WithMatches,
	declarations: readonly Declaration[] | undefined,
	locale: string
): boolean {
	return variant.matches.some((match) => {
		if (match.type !== "literal-match" || !PLURAL_ORDER.includes(match.value))
			return false;
		const annotation = resolveAnnotation(match.key, declarations);
		if (annotation?.name !== "plural") return false;
		const variable = typeVariable(annotation);
		let types: (string | undefined)[] = [undefined];
		if (variable !== undefined) {
			// the type the variant selects, read through the selector on that variable
			const input = resolveInputVariable(variable, declarations);
			const chosen = variant.matches.find(
				(other) =>
					other.type === "literal-match" &&
					resolveAnnotation(other.key, declarations) === undefined &&
					resolveInputVariable(other.key, declarations) === input
			);
			const value = chosen?.type === "literal-match" ? chosen.value : "*";
			types =
				value === "cardinal" || value === "ordinal"
					? [value]
					: value === "*"
						? ["cardinal", "ordinal"]
						: [];
		}
		if (!types.length) return false;
		const categories = new Set<string>();
		for (const type of types) {
			const rules = rulesOf(
				type ? withType(annotation, type) : annotation,
				locale
			);
			if (!rules) return false;
			for (const category of rules.categories) categories.add(category);
		}
		return !categories.has(match.value);
	});
}

/**
 * The selectors of a message, grouped by what a translator sees as one choice.
 *
 * Usually a group is one selector. The exception is an exact number next to a
 * plural category of the same input, which is how `@inlang/plugin-icu1`
 * imports `{count, plural, =0 {…} one {…} other {…}}`: an un-annotated
 * `.local $countPluralExact = {$count}` selector for `=0` and the
 * `.local $countPlural = {$count :plural}` selector for `one` / `other`. The
 * exact number wins, so "0 and one" is never a form: the group's keys are
 * `0`, `one` and the catch-all.
 */
export type SelectorGroup = {
	/** The selector names of the group in message order: two for an exact number + plural pair. */
	names: string[];
	/** The selector that chooses by plural category, by literal value, or the only one. */
	selector: string;
	/** The exact-number selector paired with a plural (ICU `=0`), if any. */
	exactSelector?: string;
	/** The input variable the group reads ("count" for "countPlural"). */
	input: string;
	/** True for a `plural` selector, even when its rules are unknown in the locale. */
	isPlural: boolean;
	/** The plural rules of the locale, when known. */
	plural?: { type: "cardinal" | "ordinal"; categories: string[] };
	/**
	 * The keys to show, in display order: exact numbers, plural categories (an
	 * explicit "other" when used), other literal keys, "*" (catch-all) last.
	 */
	keys: string[];
	/**
	 * The keys the locale needs, see {@link requiredVariants}. For a plural
	 * with a `typeSelector`, the keys any of its types needs; which type needs
	 * which is `requiredKeysFor`.
	 */
	requiredKeys: string[];
	/**
	 * The select that chooses this plural's type: `pluralType` for
	 * `.local $countPlural = {$count :plural type=$pluralType}`, which
	 * `@inlang/plugin-i18next` imports for keys with cardinal and ordinal forms.
	 */
	typeSelector?: string;
	/**
	 * The keys the locale needs where `typeSelector` matches a value ("*" =
	 * its catch-all). The catch-all is the cardinal type: exact numbers, the
	 * cardinal categories and the catch-all. "ordinal" needs the ordinal
	 * categories and the catch-all. Any other value ("cardinal") only needs the
	 * exact numbers used with it; the rest falls through to the catch-all type.
	 * This is the layout `@inlang/plugin-i18next` imports: cardinal forms in
	 * the catch-all, `_ordinal_` forms under "ordinal", `_zero`'s exact 0 under
	 * "cardinal".
	 */
	requiredKeysFor?(typeValue: string): string[];
	/** The match value per selector name for a key ("*" = catch-all). */
	values(key: string): Record<string, string>;
	/** The key of a variant in this group. */
	keyOf(variant: WithMatches): string;
};

function literalKeys(
	selector: string,
	variants: readonly WithMatches[]
): string[] {
	const keys: string[] = [];
	for (const variant of variants) {
		const value = matchValue(variant, selector);
		if (value !== "*" && !keys.includes(value)) keys.push(value);
	}
	return keys;
}

const byNumber = (a: string, b: string) => Number(a) - Number(b);

/** Plural keys without duplicates: numbers, categories in CLDR order, "*" last. */
function orderKeys(keys: readonly string[]): string[] {
	return [
		...[...new Set(keys.filter(isNumericKey))].sort(byNumber),
		...PLURAL_ORDER.filter(
			(category) => category !== "other" && keys.includes(category)
		),
		...(keys.includes("*") ? ["*"] : []),
	];
}

/**
 * Groups `message.selectors` for its locale, see {@link SelectorGroup}.
 *
 * - a plural: the locale's categories; the catch-all stands in for "other"
 *   (MF2 requires a catch-all). Numbers on the plural selector itself are
 *   optional. Without known rules only the catch-all is needed.
 * - an exact number paired with a plural: its numbers are needed, like the
 *   values of a select, in addition to the plural's keys.
 * - any other selector (a select such as gender): the literal values its
 *   variants and the reference's variants use, and the catch-all.
 */
export function selectorGroups(
	message: SelectorMessage,
	declarations: readonly Declaration[] | undefined,
	options: SelectorOptions = {}
): SelectorGroup[] {
	const variants = options.variants ?? message.variants ?? [];
	// the reference's values first, so every locale lists a select's values in the same order
	const all = [...(options.referenceVariants ?? []), ...variants];
	const names = message.selectors.map((selector) => selector.name);
	// exact-number selector -> the plural selector it belongs to
	const exactOf = new Map<string, string>();
	for (const name of names) {
		if (!isPluralSelector(name, declarations)) continue;
		const input = resolveInputVariable(name, declarations);
		const partner = names.find(
			(other) =>
				other !== name &&
				!exactOf.has(other) &&
				![...exactOf.values()].includes(other) &&
				resolveAnnotation(other, declarations) === undefined &&
				resolveInputVariable(other, declarations) === input &&
				literalKeys(other, all).every(isNumericKey)
		);
		if (partner) exactOf.set(partner, name);
	}
	const exactFor = new Map(
		[...exactOf].map(([exact, plural]) => [plural, exact])
	);

	const groups: SelectorGroup[] = [];
	const typeSelectors = new Set<string>();
	for (const name of names) {
		if (exactOf.has(name)) continue; // part of its plural's group
		const input = resolveInputVariable(name, declarations);
		if (!isPluralSelector(name, declarations)) {
			const keys = [...literalKeys(name, all), "*"];
			groups.push({
				names: [name],
				selector: name,
				input,
				isPlural: false,
				keys,
				requiredKeys: keys,
				values: (key) => ({ [name]: key }),
				keyOf: (variant) => matchValue(variant, name),
			});
			continue;
		}
		const rules = pluralRules(name, declarations, message.locale);
		const exact = exactFor.get(name);
		// The reference's exact numbers on this input (its exact-number selector, whatever its
		// name) are needed on this message's exact selector. Without one, a number on the plural
		// selector can't stand in (it selects a category at runtime): `missing-selector`.
		const numbersOn = (list: readonly WithMatches[]) =>
			list.flatMap((variant) =>
				variant.matches.flatMap((match) =>
					match.type === "literal-match" &&
					isNumericKey(match.value) &&
					resolveAnnotation(match.key, declarations) === undefined &&
					resolveInputVariable(match.key, declarations) === input
						? [match.value]
						: []
				)
			);
		const referenceNumbers = numbersOn(options.referenceVariants ?? []);
		const exactNumbers = [
			...new Set([
				...(exact ? [...literalKeys(exact, all), ...referenceNumbers] : []),
			]),
		].sort(byNumber);
		// `type=$pluralType`: the select on that variable chooses cardinal or ordinal forms
		const annotation = resolveAnnotation(name, declarations)!;
		const variable = typeVariable(annotation);
		const typeInput =
			variable === undefined
				? undefined
				: resolveInputVariable(variable, declarations);
		const typeSelector =
			typeInput === undefined
				? undefined
				: names.find(
						(other) =>
							other !== name &&
							!exactOf.has(other) &&
							!typeSelectors.has(other) &&
							!isPluralSelector(other, declarations) &&
							resolveInputVariable(other, declarations) === typeInput
					);
		if (typeSelector) typeSelectors.add(typeSelector);
		const requiredKeysFor = (typeValue: string): string[] => {
			const inBranch = (variant: WithMatches) =>
				matchValue(variant, typeSelector!) === typeValue;
			const numbers = exact
				? [
						...new Set([
							...literalKeys(exact, all.filter(inBranch)),
							...numbersOn((options.referenceVariants ?? []).filter(inBranch)),
						]),
					].sort(byNumber)
				: [];
			// the catch-all type is MF2's default, cardinal
			const type = typeValue === "*" ? "cardinal" : typeValue;
			if (typeValue !== "*" && type !== "ordinal") return numbers;
			const typed = rulesOf(withType(annotation, type), message.locale);
			return [
				...numbers,
				...(typed?.requiredCategories ?? []).filter(
					(category) => category !== "other"
				),
				"*",
			];
		};
		const own = literalKeys(name, variants);
		// the type select's values ("*" = cardinal), for a plural with a variable type
		const typeValues = typeSelector
			? ["*", ...literalKeys(typeSelector, all)]
			: [];
		// with a variable type: the categories of the types the type select uses, so an editor
		// can offer every form `requiredKeysFor` needs (English ordinal "two" and "few")
		const typedCategories = PLURAL_ORDER.filter((category) =>
			typeValues.some((typeValue) =>
				typeValue === "*" || typeValue === "ordinal"
					? rulesOf(
							withType(annotation, typeValue === "*" ? "cardinal" : typeValue),
							message.locale
						)?.categories.includes(category)
					: false
			)
		);
		const categories = (
			typeSelector ? typedCategories : (rules?.categories ?? [])
		).filter((category) => category !== "other");
		const required = (rules?.requiredCategories ?? []).filter(
			(category) => category !== "other"
		);
		const numbers = [
			...new Set([...exactNumbers, ...own.filter(isNumericKey)]),
		].sort(byNumber);
		const others = own.filter(
			(key) =>
				!isNumericKey(key) && !categories.includes(key) && key !== "other"
		);
		groups.push({
			names: names.filter((value) => value === name || value === exact),
			selector: name,
			...(exact ? { exactSelector: exact } : {}),
			input,
			isPlural: true,
			...(rules
				? { plural: { type: rules.type, categories: rules.categories } }
				: {}),
			keys: [
				...numbers,
				...categories,
				...(own.includes("other") ? ["other"] : []),
				...others,
				"*",
			],
			// with a variable type: what any type needs, see `requiredKeysFor`
			requiredKeys: typeSelector
				? orderKeys(
						typeValues.flatMap((typeValue) => requiredKeysFor(typeValue))
					)
				: [...exactNumbers, ...required, "*"],
			...(typeSelector ? { typeSelector, requiredKeysFor } : {}),
			values: (key) => {
				if (!exact) return { [name]: key };
				if (key === "*") return { [exact]: "*", [name]: "*" };
				return exactNumbers.includes(key)
					? { [exact]: key, [name]: "*" }
					: { [exact]: "*", [name]: key };
			},
			keyOf: (variant) => {
				const value = exact ? matchValue(variant, exact) : "*";
				return value !== "*" ? value : matchValue(variant, name);
			},
		});
	}
	return groups;
}

function toMatches(
	selectors: readonly VariableReference[],
	values: Record<string, string>
): Match[] {
	return selectors.map(({ name }): Match => {
		const value = values[name] ?? "*";
		return value === "*"
			? { type: "catchall-match", key: name }
			: { type: "literal-match", key: name, value };
	});
}

/**
 * Every match combination (form) a message needs in its locale, in selector
 * order: the product of the required keys of its {@link selectorGroups}
 * (per type for a plural with a `typeSelector`), less the exact numbers and
 * plural types a select branch doesn't use (see below). A message without
 * selectors needs one form without matches.
 *
 * Russian `count` (plural) × `gender` (female, male in the reference) needs
 * 4 × 3 = 12 forms. An ICU `=0 {…} one {…} other {…}` needs 0, one and the
 * catch-all in English, never "0 and one".
 *
 * A plural with a `typeSelector` (i18next's `type=$pluralType`) is chosen
 * together with it, per type rather than as a product: English cardinals
 * under the catch-all type (one, `*`), the exact `pluralType=cardinal` 0 and
 * ordinals under `pluralType=ordinal` (one, two, few, `*`), never
 * `pluralType=ordinal` with the cardinal 0.
 *
 * Exact numbers and plural types are needed only in the branches of the other
 * selectors (i18next context, gender) where a variant of the message or the
 * reference uses them; plural categories are needed in every branch. i18next
 * `c_male_one`, `c_male_other`, `c_zero`, `c_one`, `c_other` needs no
 * `context=male` 0.
 */
export function requiredVariants(
	message: SelectorMessage,
	declarations: readonly Declaration[] | undefined,
	options: SelectorOptions = {}
): Match[][] {
	const groups = selectorGroups(message, declarations, options);
	const typed = new Set(groups.flatMap((group) => group.typeSelector ?? []));
	let combinations: Record<string, string>[] = [{}];
	for (const group of groups) {
		// a plural's type select is chosen with its plural
		if (!group.isPlural && typed.has(group.selector)) continue;
		const typeGroup = groups.find(
			(other) => !other.isPlural && other.selector === group.typeSelector
		);
		const forms =
			typeGroup && group.requiredKeysFor
				? typeGroup.requiredKeys.flatMap((typeValue) =>
						group.requiredKeysFor!(typeValue).map((key) => ({
							...typeGroup.values(typeValue),
							...group.values(key),
						}))
					)
				: group.requiredKeys.map((key) => group.values(key));
		combinations = combinations.flatMap((combination) =>
			forms.map((values) => ({ ...combination, ...values }))
		);
	}
	// An exact number or a plural type is needed only in the select branches (i18next context,
	// gender) where the message or the reference uses it: `context=male` at 0 shows the male
	// "other" form when only the catch-all context has `_zero`. A value the reference has no
	// variant for falls back to the reference's catch-all, as at runtime: its `=0` is needed in
	// every gender a translation adds.
	const own = options.variants ?? message.variants ?? [];
	const reference = options.referenceVariants ?? [];
	const selects = groups.filter((group) => !group.isPlural);
	const inBranch = (
		variant: WithMatches,
		values: Record<string, string>,
		fallback: readonly WithMatches[] | undefined
	) =>
		selects.every((group) => {
			const value = matchValue(variant, group.selector);
			const wanted = values[group.selector] ?? "*";
			return (
				value === wanted ||
				(fallback !== undefined &&
					value === "*" &&
					!fallback.some(
						(other) => matchValue(other, group.selector) === wanted
					))
			);
		});
	const candidates = (values: Record<string, string>) => [
		...own.filter((variant) => inBranch(variant, values, undefined)),
		...reference.filter((variant) => inBranch(variant, values, reference)),
	];
	combinations = combinations.filter((values) =>
		groups.every((group) => {
			if (!group.isPlural) return true;
			const number = group.exactSelector
				? (values[group.exactSelector] ?? "*")
				: "*";
			const type = group.typeSelector
				? (values[group.typeSelector] ?? "*")
				: "*";
			if (number === "*" && type === "*") return true;
			return candidates(values).some(
				(variant) =>
					number === "*" ||
					variant.matches.some(
						(match) =>
							match.type === "literal-match" &&
							match.value === number &&
							resolveAnnotation(match.key, declarations) === undefined &&
							resolveInputVariable(match.key, declarations) === group.input
					)
			);
		})
	);
	return combinations.map((values) => toMatches(message.selectors, values));
}

/**
 * True when a variant is the form for a match combination. An explicit
 * `other` of a plural selector is its catch-all form as well.
 */
export function variantCovers(
	variant: WithMatches,
	matches: readonly Match[],
	declarations: readonly Declaration[] | undefined
): boolean {
	return matches.every((match) => {
		const actual = matchValue(variant, match.key);
		if (actual === (match.type === "literal-match" ? match.value : "*"))
			return true;
		return (
			match.type === "catchall-match" &&
			actual === "other" &&
			isPluralSelector(match.key, declarations)
		);
	});
}

/**
 * The {@link requiredVariants} no variant covers: what the `missing-variant`
 * check reports, and what an editor offers to add.
 */
export function missingVariants(
	message: SelectorMessage,
	declarations: readonly Declaration[] | undefined,
	options: SelectorOptions = {}
): Match[][] {
	const variants = options.variants ?? message.variants ?? [];
	return requiredVariants(message, declarations, options).filter(
		(matches) =>
			!variants.some((variant) => variantCovers(variant, matches, declarations))
	);
}
