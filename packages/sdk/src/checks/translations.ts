import type {
	Declaration,
	FunctionReference,
	Pattern,
	VariableReference,
} from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";

/**
 * Translation checks for one message compared with a reference message.
 *
 * Pure functions over patterns, selectors and declarations, so editors can run
 * them on unsaved input and `checkProject` can run them on stored rows.
 */

type VariantLike = { id?: string; matches: readonly Match[]; pattern: Pattern };
type MessageLike = {
	id?: string;
	locale: string;
	selectors: readonly VariableReference[];
	variants: readonly VariantLike[];
};

/** A problem in one translation, relative to the reference. */
export type TranslationIssue =
	| { type: "missing-translation" }
	| { type: "missing-variable"; name: string; variantId?: string }
	| {
			type: "unknown-variable";
			name: string;
			variantId?: string;
			/** The reference variable the name most likely meant ("totl" → "total"). */
			suggestion?: string;
	  }
	| { type: "missing-markup"; name: string; variantId?: string }
	| { type: "missing-variant"; matches: Match[] };

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

const NUMERIC_OPTIONS = [
	"minimumIntegerDigits",
	"minimumFractionDigits",
	"maximumFractionDigits",
	"minimumSignificantDigits",
	"maximumSignificantDigits",
];
type PluralRuleSet = {
	categories: string[];
	/** Categories that only one number selects, e.g. German "one" (1) but not Russian "one" (1, 21, 31, …). */
	single: string[];
};
const rulesCache = new Map<string, PluralRuleSet | null>();

/** Numbers that tell whether a category selects a single number. */
const SAMPLES = [
	...Array.from({ length: 1001 }, (_, index) => index),
	...Array.from({ length: 21 }, (_, index) => index / 2 + 0.1),
	...Array.from({ length: 21 }, (_, index) => index / 2),
];

/**
 * The plural categories a `plural` selector needs in a locale, in CLDR order.
 * Undefined when the selector is not a plural, its type is only known at
 * runtime, or the locale is unsupported (never guesses another language).
 */
export function pluralCategories(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string
): string[] | undefined {
	return pluralRuleSet(selector, declarations, locale)?.categories;
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
		pluralRuleSet(selector, declarations, locale)?.single.includes(category) ??
		false
	);
}

function pluralRuleSet(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string
): PluralRuleSet | undefined {
	const annotation = resolveAnnotation(selector, declarations);
	if (annotation?.name !== "plural") return undefined;
	const key = JSON.stringify([locale, annotation.options ?? []]);
	if (!rulesCache.has(key)) {
		let result: PluralRuleSet | null = null;
		try {
			const options: Intl.PluralRulesOptions = { type: "cardinal" };
			let known = true;
			for (const option of annotation.options ?? []) {
				const value =
					option.value.type === "literal" ? option.value.value : undefined;
				if (
					option.name === "type" &&
					(value === "cardinal" || value === "ordinal")
				)
					options.type = value;
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
				result = {
					categories: [...rules.resolvedOptions().pluralCategories].sort(
						(a, b) => PLURAL_ORDER.indexOf(a) - PLURAL_ORDER.indexOf(b)
					),
					single: [...numbers]
						.filter(
							([category, values]) => category !== "other" && values.size === 1
						)
						.map(([category]) => category),
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

const matchValue = (variant: Pick<VariantLike, "matches">, key: string) => {
	const match = variant.matches.find((value) => value.key === key);
	return match?.type === "literal-match" ? match.value : "*";
};
const isNumeric = (value: string) => /^-?\d+(\.\d+)?$/.test(value);

/**
 * The keys a selector must cover in a locale: a plural's categories, with the
 * required catch-all standing in for "other", or the literal keys used by the
 * variants plus the catch-all for every other selector.
 */
export function selectorKeys(
	selector: string,
	declarations: readonly Declaration[] | undefined,
	locale: string,
	variants: readonly Pick<VariantLike, "matches">[]
): { plural: boolean; keys: string[] } {
	const categories = pluralCategories(selector, declarations, locale);
	if (categories)
		return {
			plural: true,
			keys: [...categories.filter((category) => category !== "other"), "*"],
		};
	const keys: string[] = [];
	for (const variant of variants) {
		const value = matchValue(variant, selector);
		if (value !== "*" && !keys.includes(value)) keys.push(value);
	}
	return { plural: false, keys: [...keys, "*"] };
}

/** Every match combination a message needs in a locale (cartesian product over its selectors). */
export function requiredVariants(
	message: Pick<MessageLike, "selectors" | "locale"> & {
		variants?: readonly Pick<VariantLike, "matches">[];
	},
	declarations: readonly Declaration[] | undefined,
	variants: readonly Pick<VariantLike, "matches">[] = message.variants ?? []
): Match[][] {
	let combinations: Match[][] = [[]];
	for (const selector of message.selectors) {
		const { keys } = selectorKeys(
			selector.name,
			declarations,
			message.locale,
			variants
		);
		combinations = combinations.flatMap((combination) =>
			keys.map((key): Match[] => [
				...combination,
				key === "*"
					? { type: "catchall-match", key: selector.name }
					: { type: "literal-match", key: selector.name, value: key },
			])
		);
	}
	return combinations;
}

/** True when a pattern has no visible text, variables or markup. */
export function isEmptyPattern(pattern: Pattern | undefined): boolean {
	return (pattern ?? []).every(
		(part) => part.type === "text" && part.value.trim() === ""
	);
}

/** Variable names a pattern uses, in first-seen order. */
export function variableNames(pattern: Pattern | undefined): string[] {
	const names: string[] = [];
	for (const part of pattern ?? [])
		if (
			part.type === "expression" &&
			part.arg.type === "variable-reference" &&
			!names.includes(part.arg.name)
		)
			names.push(part.arg.name);
	return names;
}

/** Markup tag names (start and standalone) a pattern uses. */
export function markupNames(pattern: Pattern | undefined): string[] {
	const names: string[] = [];
	for (const part of pattern ?? [])
		if (
			(part.type === "markup-start" || part.type === "markup-standalone") &&
			!names.includes(part.name)
		)
			names.push(part.name);
	return names;
}

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i++) {
		let previous = row[0]!;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const current = row[j]!;
			const same = a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase();
			row[j] = Math.min(
				row[j]! + 1,
				row[j - 1]! + 1,
				previous + (same ? 0 : 1)
			);
			previous = current;
		}
	}
	return row[b.length]!;
}

/** The candidate a misspelled name most likely meant, if it is close enough. */
export function closestName(
	name: string,
	candidates: readonly string[]
): string | undefined {
	let best: string | undefined;
	let score = Infinity;
	for (const candidate of candidates) {
		const value = distance(name, candidate);
		if (value < score) {
			best = candidate;
			score = value;
		}
	}
	return best !== undefined && score <= Math.max(2, Math.floor(best.length / 3))
		? best
		: undefined;
}

/**
 * Compares a translation with its reference. Deterministic order: a missing
 * translation alone; otherwise variable, markup and variant issues in the order
 * of the variants they appear in.
 *
 * - `missing-translation`: no message, no variants, or every pattern is empty.
 * - `missing-variable`: a reference variable is absent from a non-empty
 *   variant. Variants for one exact number on a plural selector (`0`, or a
 *   category that selects one number such as German `one`) may spell the
 *   number out and are exempt. Variables used only as selectors are not required.
 * - `unknown-variable`: a variant uses a variable no reference pattern uses.
 * - `missing-markup`: a reference markup tag is absent from a non-empty variant.
 * - `missing-variant`: a required match combination (see {@link requiredVariants})
 *   has no variant. The catch-all is a plural's "other"; an explicit "other"
 *   variant covers it too.
 */
export function checkTranslation(args: {
	reference?: MessageLike;
	target?: MessageLike;
	declarations?: readonly Declaration[];
}): TranslationIssue[] {
	const { reference, target, declarations } = args;
	if (
		!target ||
		target.variants.every((variant) => isEmptyPattern(variant.pattern))
	)
		return [{ type: "missing-translation" }];
	const issues: TranslationIssue[] = [];
	const referencePatterns = (reference?.variants ?? [])
		.map((variant) => variant.pattern)
		.filter((pattern) => !isEmptyPattern(pattern));
	const variables = [...new Set(referencePatterns.flatMap(variableNames))];
	const markup = [...new Set(referencePatterns.flatMap(markupNames))];
	const plural = (selector: string) =>
		pluralCategories(selector, declarations, target.locale) !== undefined;
	// A variant for one exact number may spell it out: "=0", or a category such as German "one".
	const spellsOut = (match: Match) =>
		match.type === "literal-match" &&
		plural(match.key) &&
		(isNumeric(match.value) ||
			isSingleNumberCategory(
				match.key,
				declarations,
				target.locale,
				match.value
			));
	if (reference)
		for (const variant of target.variants) {
			if (isEmptyPattern(variant.pattern)) continue;
			const variantId = variant.id;
			const own = variableNames(variant.pattern);
			const exactNumber = variant.matches.some(spellsOut);
			const missing = exactNumber
				? []
				: variables.filter((name) => !own.includes(name));
			for (const name of missing)
				issues.push({ type: "missing-variable", name, variantId });
			for (const name of own)
				if (!variables.includes(name)) {
					const suggestion = closestName(
						name,
						missing.length ? missing : variables
					);
					issues.push({
						type: "unknown-variable",
						name,
						variantId,
						...(suggestion ? { suggestion } : {}),
					});
				}
			const tags = markupNames(variant.pattern);
			for (const name of markup)
				if (!tags.includes(name))
					issues.push({ type: "missing-markup", name, variantId });
		}
	for (const matches of requiredVariants(target, declarations)) {
		const covered = target.variants.some((variant) =>
			matches.every((match) => {
				const actual = matchValue(variant, match.key);
				if (actual === (match.type === "literal-match" ? match.value : "*"))
					return true;
				return (
					match.type === "catchall-match" &&
					actual === "other" &&
					plural(match.key)
				);
			})
		);
		if (!covered) issues.push({ type: "missing-variant", matches });
	}
	return issues;
}
