import type {
	Declaration,
	FunctionReference,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";

/**
 * Shared, internal helpers for reasoning about declarations, selectors and
 * plural rules. Not part of the public API (subject to change).
 */

export type Match = Variant["matches"][number];

/** CLDR order of plural categories. `Intl` returns them in engine order. */
export const PLURAL_CATEGORY_ORDER = [
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
] as const;

export function sortPluralCategories(categories: readonly string[]): string[] {
	const rank = (value: string) => {
		const index = (PLURAL_CATEGORY_ORDER as readonly string[]).indexOf(value);
		return index === -1 ? PLURAL_CATEGORY_ORDER.length : index;
	};
	return [...categories].sort((a, b) => rank(a) - rank(b));
}

/**
 * Finds the function annotation that applies to a variable, following
 * local-variable aliases (`.local $a = {$b}`) and guarding against cycles.
 */
export function resolveAnnotation(
	name: string,
	declarations: readonly Declaration[] | undefined,
	seen: Set<string> = new Set()
): FunctionReference | undefined {
	if (!declarations || seen.has(name)) return undefined;
	seen.add(name);
	const declaration = declarations.find((value) => value.name === name);
	if (!declaration) return undefined;
	if (declaration.type === "input-variable") {
		return (declaration as { annotation?: FunctionReference }).annotation;
	}
	if (declaration.value.annotation) return declaration.value.annotation;
	return declaration.value.arg.type === "variable-reference"
		? resolveAnnotation(declaration.value.arg.name, declarations, seen)
		: undefined;
}

/**
 * Returns the name of the input variable a variable ultimately reads from
 * (following local-variable chains), or undefined if it ends in a literal.
 */
export function resolveInputName(
	name: string,
	declarations: readonly Declaration[] | undefined,
	seen: Set<string> = new Set()
): string | undefined {
	if (seen.has(name)) return undefined;
	seen.add(name);
	const declaration = declarations?.find((value) => value.name === name);
	if (!declaration || declaration.type === "input-variable") return name;
	return declaration.value.arg.type === "variable-reference"
		? resolveInputName(declaration.value.arg.name, declarations, seen)
		: undefined;
}

const NUMERIC_PLURAL_OPTIONS = [
	"minimumIntegerDigits",
	"minimumFractionDigits",
	"maximumFractionDigits",
	"minimumSignificantDigits",
	"maximumSignificantDigits",
];

export type PluralResolver = {
	type: "cardinal" | "ordinal";
	rules: Intl.PluralRules;
	/** Categories in CLDR order. */
	categories: string[];
};

const rulesCache = new Map<string, PluralResolver | null>();

/**
 * Builds plural rules for a `plural` annotation in a locale. Returns undefined
 * when the annotation is not a plural, the plural type is only known at
 * runtime, or the locale is not supported (never silently guesses English).
 */
export function pluralResolver(
	annotation: FunctionReference | undefined,
	locale: string
): PluralResolver | undefined {
	if (annotation?.name !== "plural") return undefined;
	const key = JSON.stringify([locale, annotation.options ?? []]);
	if (rulesCache.has(key)) return rulesCache.get(key) ?? undefined;
	let result: PluralResolver | null = null;
	try {
		const typeOption = annotation.options?.find((o) => o.name === "type");
		let known =
			!typeOption ||
			(typeOption.value.type === "literal" &&
				["cardinal", "ordinal"].includes(typeOption.value.value));
		const type: "cardinal" | "ordinal" =
			typeOption?.value.type === "literal" &&
			typeOption.value.value === "ordinal"
				? "ordinal"
				: "cardinal";
		const options: Intl.PluralRulesOptions = { type };
		for (const option of annotation.options ?? []) {
			if (option.name === "type") continue;
			if (
				NUMERIC_PLURAL_OPTIONS.includes(option.name) &&
				option.value.type === "literal" &&
				option.value.value.trim() &&
				Number.isFinite(Number(option.value.value))
			) {
				Object.assign(options, { [option.name]: Number(option.value.value) });
			} else {
				known = false;
			}
		}
		if (known && Intl.PluralRules.supportedLocalesOf(locale).length) {
			const rules = new Intl.PluralRules(locale, options);
			result = {
				type,
				rules,
				categories: sortPluralCategories(
					rules.resolvedOptions().pluralCategories
				),
			};
		}
	} catch {
		result = null;
	}
	if (rulesCache.size >= 256)
		rulesCache.delete(rulesCache.keys().next().value!);
	rulesCache.set(key, result);
	return result ?? undefined;
}

/** Plural rules for the selector `name` of a message, if it is a known plural. */
export function selectorPluralResolver(
	name: string,
	declarations: readonly Declaration[] | undefined,
	locale: string
): PluralResolver | undefined {
	return pluralResolver(resolveAnnotation(name, declarations), locale);
}

/** The match of a variant for a selector. A missing match counts as catch-all. */
export function matchFor(
	variant: Pick<Variant, "matches">,
	key: string
): Match {
	return (
		variant.matches.find((match) => match.key === key) ?? {
			type: "catchall-match",
			key,
		}
	);
}

/** Serialises a match value: literal value or "*" for catch-all. */
export function matchValue(match: Match): string {
	return match.type === "literal-match" ? match.value : "*";
}

/** True when a variant has exactly the given match combination. */
export function variantHasMatches(
	variant: Pick<Variant, "matches">,
	matches: readonly Match[]
): boolean {
	return matches.every(
		(match) => matchValue(matchFor(variant, match.key)) === matchValue(match)
	);
}

/** Literal keys used for a selector across variants, in first-seen order. */
export function literalKeys(
	name: string,
	variants: readonly Pick<Variant, "matches">[]
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

/** A pattern is empty when it has no parts or only whitespace text. */
export function isEmptyPattern(pattern: Pattern | undefined): boolean {
	if (!pattern || pattern.length === 0) return true;
	return pattern.every(
		(part) => part.type === "text" && part.value.trim() === ""
	);
}

/** Selector names of a message (empty when there are none). */
export function selectorNames(message: Pick<Message, "selectors"> | undefined) {
	return (message?.selectors ?? []).map((selector) => selector.name);
}

/** Literal numbers in match keys such as "0" or "1" (MF2 exact matches). */
export function isNumericKey(value: string): boolean {
	return value.trim() !== "" && Number.isFinite(Number(value));
}
