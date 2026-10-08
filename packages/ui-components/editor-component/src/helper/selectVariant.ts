import type { Declaration, MessageRow, VariantRow } from "@inlang/sdk";
import {
	isNumericKey,
	matchFor,
	resolveAnnotation,
	pluralResolver,
} from "./declarations.js";
import { resolveValue } from "./resolveValue.js";

export type SelectVariantArgs<V extends Pick<VariantRow, "matches"> = VariantRow> = {
	message: Pick<MessageRow, "selectors">;
	variants: readonly V[];
	declarations?: readonly Declaration[];
	/** Values of input variables (or local variables to override), keyed by name. */
	values?: Record<string, unknown>;
	locale: string;
};

/**
 * Picks the variant MessageFormat 2 would choose for the given values.
 *
 * Each selector is resolved to an ordered list of preferred keys:
 * - plural selectors: exact numeric literal keys equal to the value (e.g.
 *   "1" or "0") first, then the `Intl.PluralRules` category.
 * - everything else: `String(value)`.
 *
 * A variant applies when every match is a preferred key or a catch-all
 * (a missing match counts as catch-all). Applicable variants are ranked
 * selector by selector in selector order (the first selector is most
 * significant): preferred keys in order, catch-all last. Ties keep the
 * original order. Returns undefined when no variant applies.
 */
export function selectVariant<V extends Pick<VariantRow, "matches">>(
	args: SelectVariantArgs<V>
): V | undefined {
	const { message, variants, declarations, values = {}, locale } = args;
	const rankers = (message.selectors ?? []).map((selector) => ({
		key: selector.name,
		rank: keyRanker(selector.name, declarations, values, locale),
	}));
	let best: V | undefined;
	let bestRank: number[] | undefined;
	for (const variant of variants) {
		const rank: number[] = [];
		let applicable = true;
		for (const { key, rank: rankOf } of rankers) {
			const match = matchFor(variant, key);
			if (match.type === "catchall-match") {
				rank.push(Number.MAX_SAFE_INTEGER);
				continue;
			}
			const value = rankOf(match.value);
			if (value === -1) {
				applicable = false;
				break;
			}
			rank.push(value);
		}
		if (!applicable) continue;
		if (!bestRank || compare(rank, bestRank) < 0) {
			best = variant;
			bestRank = rank;
		}
	}
	return best;
}

function compare(a: number[], b: number[]) {
	for (let index = 0; index < a.length; index++) {
		if (a[index]! !== b[index]!) return a[index]! - b[index]!;
	}
	return 0;
}

/** Returns a function ranking a literal key: 0 = best, -1 = does not match. */
function keyRanker(
	name: string,
	declarations: readonly Declaration[] | undefined,
	values: Record<string, unknown>,
	locale: string
): (key: string) => number {
	const value = resolveValue(name, declarations, values);
	if (value === undefined || value === null) return () => -1;
	const annotation = resolveAnnotation(name, declarations);
	if (annotation?.name === "plural") {
		const number = typeof value === "number" ? value : Number(value);
		if (typeof value === "string" && value.trim() === "") return () => -1;
		if (!Number.isFinite(number))
			return (key) => (key === String(value) ? 0 : -1);
		let category: string | undefined;
		try {
			category = (
				pluralResolver(annotation, locale)?.rules ??
				new Intl.PluralRules(locale)
			).select(number);
		} catch {
			category = undefined;
		}
		return (key) => {
			// exact numeric matches (e.g. "1", "1.0") take precedence over categories
			if (isNumericKey(key)) return Number(key) === number ? 0 : -1;
			return key === category ? 1 : -1;
		};
	}
	const string = String(value);
	return (key) => (key === string ? 0 : -1);
}
