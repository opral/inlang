import type {
	Declaration,
	Pattern,
	VariableReference,
} from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import {
	isNumericKey,
	isPluralSelector,
	isSingleNumberCategory,
	isUnreachableVariant,
	matchValue,
	missingVariants,
	pluralRules,
	resolveAnnotation,
	resolveInputVariable,
	selectorGroups,
} from "./selectors.js";

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
	| { type: "empty-variant"; variantId?: string; matches: Match[] }
	| { type: "missing-variable"; name: string; variantId?: string }
	| {
			type: "unknown-variable";
			name: string;
			variantId?: string;
			/** The reference variable the name most likely meant ("totl" → "total"). */
			suggestion?: string;
	  }
	| { type: "missing-markup"; name: string; variantId?: string }
	| { type: "missing-variant"; matches: Match[] }
	| {
			type: "missing-selector";
			/** The reference's selector ("countPlural"). */
			selector: string;
			/** The input it reads ("count"). */
			input: string;
			/** The reference's select values or exact numbers the translation can't express. */
			values: string[];
	  };

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
 * translation alone; otherwise empty forms, variable and markup issues in the
 * order of the variants they appear in, then missing selectors and variants.
 *
 * - `missing-translation`: no message, no variants, or every pattern is empty.
 * - Variants for a plural category the target locale never selects, such as
 *   i18next's `_zero` (`countPlural=zero`) in German, are skipped by the
 *   variant checks below (`empty-variant`, `missing-variable`,
 *   `unknown-variable`, `missing-markup`), see {@link isUnreachableVariant}.
 * - `empty-variant`: one variant's pattern is empty while another variant of
 *   the message has text, e.g. an ICU `=0 {}`. Checked without a reference too.
 * - `missing-variable`: a variable of the reference form with the same matches
 *   (or, when the reference has no such form, of any reference form) is absent
 *   from a non-empty variant. A variant for one exact number on a plural
 *   selector (`0`, or a category that selects one number such as German `one`)
 *   may spell that number out: its input variable is not required. Variables
 *   used only as selectors are not required. Not checked against an empty
 *   reference.
 * - `unknown-variable`: a variant uses a variable no reference pattern uses.
 * - `missing-markup`: a markup tag of the same reference form (as for
 *   variables) is absent from a non-empty variant.
 * - `missing-selector`: the reference chooses by an input (a select's values,
 *   exact numbers, or a plural the target locale needs more than one form of)
 *   and the translation has no selector on that input.
 * - `missing-variant`: a form the target needs has no variant, see
 *   {@link missingVariants}. The reference's select values and exact numbers
 *   are needed in the target too. The catch-all is a plural's "other"; an
 *   explicit "other" variant covers it too.
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
	const referenceForms = (reference?.variants ?? []).filter(
		(variant) => !isEmptyPattern(variant.pattern)
	);
	const variables = [
		...new Set(referenceForms.flatMap((form) => variableNames(form.pattern))),
	];
	const markup = [
		...new Set(referenceForms.flatMap((form) => markupNames(form.pattern))),
	];
	const groups = selectorGroups(target, declarations);
	// A variant for one exact number may spell that number out: "=0" (on the plural selector,
	// or on the exact-number selector ICU's `=0 {…} one {…}` imports next to it), or a
	// category that selects one number such as German "one". Only that input is exempt.
	const spelledOut = (variant: VariantLike): string[] =>
		variant.matches.flatMap((match) => {
			if (match.type !== "literal-match") return [];
			const group = groups.find((value) => value.names.includes(match.key));
			if (!group) return [];
			// an exact-number selector on its own (`count=0`) also selects one number
			if (!group.isPlural)
				return isNumericKey(match.value) &&
					resolveAnnotation(match.key, declarations) === undefined
					? [group.input]
					: [];
			return isNumericKey(match.value) ||
				(match.key === group.selector &&
					isSingleNumberCategory(
						match.key,
						declarations,
						target.locale,
						match.value
					))
				? [group.input]
				: [];
		});
	// The reference forms with the same exact numbers and select values. Plural categories are
	// not compared: they mean different numbers in each locale (Russian "one" is 1, 21, 31…).
	const sameForms = (variant: VariantLike) => {
		const keys = [
			...new Set([
				...variant.matches.map((match) => match.key),
				...(reference?.selectors ?? []).map((selector) => selector.name),
			]),
		].filter((key) => !isPluralSelector(key, declarations));
		return referenceForms.filter((form) =>
			keys.every((key) => matchValue(form, key) === matchValue(variant, key))
		);
	};
	// Of those, the form for the same plural category, else the reference's other form: what
	// the variant's text should carry (markup or a variable only `one` uses stays in `one`).
	const isOther = (value: string) => value === "*" || value === "other";
	const categoryForms = (variant: VariantLike, forms: VariantLike[]) => {
		for (const group of groups) {
			if (!group.isPlural) continue;
			const value = matchValue(variant, group.selector);
			const same = forms.filter((form) => {
				const other = matchValue(form, group.selector);
				return other === value || (isOther(value) && isOther(other));
			});
			const fallback = forms.filter((form) =>
				isOther(matchValue(form, group.selector))
			);
			forms = same.length ? same : fallback.length ? fallback : forms;
		}
		return forms;
	};
	for (const variant of target.variants) {
		// A form for a plural category the locale never selects (i18next's `_zero` in German)
		// is never shown: its text can't be wrong. Latvian `zero` (10–20) is checked as usual.
		if (isUnreachableVariant(variant, declarations, target.locale)) continue;
		if (isEmptyPattern(variant.pattern)) {
			issues.push({
				type: "empty-variant",
				variantId: variant.id,
				matches: variant.matches.map((match) => ({ ...match })),
			});
			continue;
		}
		if (!reference || referenceForms.length === 0) continue;
		const variantId = variant.id;
		const forms = sameForms(variant);
		const exempt = spelledOut(variant);
		const category = categoryForms(variant, forms);
		// A plural's input ("count") is needed in every form that isn't one number when the
		// reference uses it in the forms with these select values and exact numbers.
		const inputs = groups
			.filter((group) => group.isPlural)
			.map((group) => group.input)
			.filter((input) =>
				forms.some((form) => variableNames(form.pattern).includes(input))
			);
		const expected = forms.length
			? [
					...new Set([
						...category.flatMap((form) => variableNames(form.pattern)),
						...inputs,
					]),
				]
			: variables;
		const own = variableNames(variant.pattern);
		const missing = expected.filter(
			(name) =>
				!own.includes(name) &&
				!exempt.includes(resolveInputVariable(name, declarations))
		);
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
		const expectedMarkup = forms.length
			? [...new Set(category.flatMap((form) => markupNames(form.pattern)))]
			: markup;
		for (const name of expectedMarkup)
			if (!tags.includes(name))
				issues.push({ type: "missing-markup", name, variantId });
	}
	if (reference)
		for (const group of selectorGroups(reference, declarations)) {
			const own = groups.filter((value) => value.input === group.input);
			const report = (selector: string, values: string[]) =>
				issues.push({
					type: "missing-selector",
					selector,
					input: group.input,
					values,
				});
			if (!group.isPlural) {
				const values = group.keys.filter((key) => key !== "*");
				if (values.length && !own.length) report(group.selector, values);
				continue;
			}
			// the reference's exact numbers (ICU =0) and whether the locale needs the plural
			const numbers = group.requiredKeys.filter(isNumericKey);
			const needsPlural =
				(pluralRules(group.selector, declarations, target.locale)
					?.requiredCategories.length ?? 1) > 1;
			if (!own.length) {
				if (needsPlural) report(group.selector, []);
				if (numbers.length)
					report(group.exactSelector ?? group.selector, numbers);
				continue;
			}
			if (needsPlural && !own.some((value) => value.isPlural))
				report(group.selector, []);
			// a number on the plural selector can't stand in: it selects a category at runtime
			if (
				numbers.length &&
				!own.some((value) => value.exactSelector || !value.isPlural)
			)
				report(group.exactSelector ?? group.selector, numbers);
		}
	for (const matches of missingVariants(target, declarations, {
		referenceVariants: reference?.variants,
	}))
		issues.push({ type: "missing-variant", matches });
	return issues;
}
