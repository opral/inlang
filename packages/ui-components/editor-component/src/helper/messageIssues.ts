import type { Declaration, MessageRow, Pattern, VariantRow } from "@inlang/sdk";
import {
	isEmptyPattern,
	isNumericKey,
	matchFor,
	matchValue,
	selectorPluralResolver,
	type Match,
} from "./declarations.js";
import { requiredForms } from "./requiredForms.js";

export type MessageIssue =
	| { type: "missing-translation" }
	| { type: "missing-variable"; name: string }
	| { type: "extra-variable"; name: string }
	| { type: "missing-markup"; name: string }
	| { type: "missing-form"; matches: Match[] };

export type MessageWithVariants = {
	message: Pick<MessageRow, "selectors"> & Partial<Pick<MessageRow, "id" | "locale">>;
	variants: readonly Pick<VariantRow, "matches" | "pattern">[];
};

/**
 * Compares a translation (target) with its reference and lists problems a
 * translator should fix. Deterministic: issues are ordered by type
 * (missing-translation, missing-variable, extra-variable, missing-markup,
 * missing-form) and, within a type, by first appearance.
 *
 * - `missing-translation`: the target is missing, has no variants, or every
 *   pattern is empty. No other issues are reported in that case.
 * - `missing-variable`: a variable used in the reference patterns is absent
 *   from at least one non-empty target variant. Variables used only as
 *   selectors are not considered. Target variants that match an exact number
 *   (e.g. "0" or "1") on a plural selector may spell the number out and are
 *   exempt.
 * - `extra-variable`: a target pattern uses a variable no reference pattern uses.
 * - `missing-markup`: a markup tag (start or standalone) used in the
 *   reference is absent from at least one non-empty target variant.
 * - `missing-form`: a form from `requiredForms(target)` has no variant with
 *   exactly those matches. A catch-all variant does not count as covering a
 *   plural category the locale has, but it is the plural's "other" form (an
 *   explicit "other" variant covers the catch-all form as well).
 */
export function messageIssues(args: {
	reference?: MessageWithVariants;
	target?: MessageWithVariants;
	declarations?: readonly Declaration[];
	/** Locale of the target. Defaults to `target.message.locale`. */
	locale?: string;
}): MessageIssue[] {
	const { reference, target, declarations } = args;
	const locale = args.locale ?? target?.message.locale ?? "en";
	if (
		!target ||
		target.variants.length === 0 ||
		target.variants.every((variant) => isEmptyPattern(variant.pattern))
	) {
		return [{ type: "missing-translation" }];
	}
	const issues: MessageIssue[] = [];
	const filled = target.variants.filter((v) => !isEmptyPattern(v.pattern));

	const referencePatterns = (reference?.variants ?? [])
		.map((v) => v.pattern)
		.filter((pattern) => !isEmptyPattern(pattern));
	const referenceVariables = unique(referencePatterns.flatMap(variableNames));
	const referenceMarkup = unique(referencePatterns.flatMap(markupNames));

	const exempt = (variant: Pick<VariantRow, "matches">) =>
		variant.matches.some(
			(match) =>
				match.type === "literal-match" &&
				isNumericKey(match.value) &&
				selectorPluralResolver(match.key, declarations, locale) !== undefined
		);

	if (reference) {
		for (const name of referenceVariables) {
			if (
				filled.some(
					(variant) =>
						!exempt(variant) && !variableNames(variant.pattern).includes(name)
				)
			) {
				issues.push({ type: "missing-variable", name });
			}
		}
		for (const name of unique(
			filled.flatMap((v) => variableNames(v.pattern))
		)) {
			if (!referenceVariables.includes(name)) {
				issues.push({ type: "extra-variable", name });
			}
		}
		for (const name of referenceMarkup) {
			if (
				filled.some((variant) => !markupNames(variant.pattern).includes(name))
			) {
				issues.push({ type: "missing-markup", name });
			}
		}
	}

	// The catch-all is a plural's "other" form, so an explicit "other" variant covers it too.
	const covers = (variant: Pick<VariantRow, "matches">, form: Match[]) =>
		form.every((match) => {
			const actual = matchValue(matchFor(variant, match.key));
			if (actual === matchValue(match)) return true;
			return (
				match.type === "catchall-match" &&
				actual === "other" &&
				selectorPluralResolver(match.key, declarations, locale) !== undefined
			);
		});
	for (const form of requiredForms(
		target.message,
		declarations,
		locale,
		target.variants
	)) {
		if (!target.variants.some((variant) => covers(variant, form))) {
			issues.push({ type: "missing-form", matches: form });
		}
	}
	return issues;
}

/** Variable names referenced by expressions in a pattern (first-seen order). */
export function variableNames(pattern: Pattern | undefined): string[] {
	const names: string[] = [];
	for (const part of pattern ?? []) {
		if (part.type === "expression" && part.arg.type === "variable-reference") {
			names.push(part.arg.name);
		}
	}
	return unique(names);
}

/** Markup tag names (start and standalone) used in a pattern. */
export function markupNames(pattern: Pattern | undefined): string[] {
	const names: string[] = [];
	for (const part of pattern ?? []) {
		if (part.type === "markup-start" || part.type === "markup-standalone") {
			names.push(part.name);
		}
	}
	return unique(names);
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}
