import type {
	Declaration,
	Pattern,
	VariableReference,
} from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import {
	isNumericKey,
	isSingleNumberCategory,
	missingVariants,
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
	const referencePatterns = (reference?.variants ?? [])
		.map((variant) => variant.pattern)
		.filter((pattern) => !isEmptyPattern(pattern));
	const variables = [...new Set(referencePatterns.flatMap(variableNames))];
	const markup = [...new Set(referencePatterns.flatMap(markupNames))];
	// A variant for one exact number may spell it out: "=0" (on the plural selector, or on the
	// exact-number selector ICU's `=0 {…} one {…}` imports next to it), or a category that
	// selects one number such as German "one".
	const groups = selectorGroups(target, declarations);
	const spellsOut = (match: Match) => {
		if (match.type !== "literal-match") return false;
		const group = groups.find((value) => value.names.includes(match.key));
		if (!group?.isPlural) return false;
		return (
			isNumericKey(match.value) ||
			(match.key === group.selector &&
				isSingleNumberCategory(
					match.key,
					declarations,
					target.locale,
					match.value
				))
		);
	};
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
	for (const matches of missingVariants(target, declarations, {
		referenceVariants: reference?.variants,
	}))
		issues.push({ type: "missing-variant", matches });
	return issues;
}
