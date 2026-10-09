import type { Declaration, Match, Variant } from "@inlang/sdk";

/**
 * Returns the variants in the order they are written to the file.
 *
 * Runtimes like Paraglide JS 2.26 return the first variant in file order
 * whose keys match. A variant that every input it matches also matches an
 * earlier variant is never displayed, e.g. an `=0` form that an editor added
 * after the catch-all `*`, or after the French `one` (which selects 0).
 * Only then are the variants sorted into MessageFormat 2 preference order:
 * selector by selector, an exact number or literal key before a plural
 * category before the catch-all; ties keep their order.
 *
 * Every other order is kept as it is, also if it differs from the
 * preference order, so that files don't change when the plugin is upgraded
 * and runtimes keep displaying what they displayed.
 *
 * @param selectors the selectors in the order they are written to the file
 * @param locale the locale whose plural rules select the categories
 */
export function orderVariants<V extends Pick<Variant, "matches">>(
	variants: V[],
	selectors: string[],
	declarations: Declaration[],
	locale: string
): V[] {
	if (selectors.length === 0 || variants.length < 2) return variants;
	const kinds = new Map(
		selectors.map((selector) => [selector, kindOf(selector, declarations)])
	);
	if (hasUnreachableVariant(variants, selectors, kinds, locale) === false) {
		return variants;
	}
	const rankOf = (variant: V) =>
		selectors.map((selector) => {
			const match = keyOf(variant, selector);
			if (match === undefined || match.type === "catchall-match") return 2;
			return kinds.get(selector)!.type === "plural" && !isNumber(match.value)
				? 1
				: 0;
		});
	return variants
		.map((variant, index) => ({ variant, index, rank: rankOf(variant) }))
		.sort((a, b) => {
			for (let i = 0; i < selectors.length; i++) {
				const diff = a.rank[i]! - b.rank[i]!;
				if (diff !== 0) return diff;
			}
			return a.index - b.index;
		})
		.map((entry) => entry.variant);
}

/**
 * How a selector selects: a plural of an input (categories and exact
 * numbers), the value of an input itself (exact numbers and select values,
 * also through an un-annotated alias like `local countPluralExact = count`),
 * or anything else, which is treated as an opaque value of its own.
 */
type Kind =
	| { type: "plural"; input: string; ordinal: boolean }
	| { type: "value"; input: string };

function kindOf(selector: string, declarations: Declaration[]): Kind {
	let plural: { ordinal: boolean } | undefined;
	let name = selector;
	const seen = new Set<string>();
	while (!seen.has(name)) {
		seen.add(name);
		const local = declarations.find(
			(declaration) =>
				declaration.type === "local-variable" && declaration.name === name
		) as Extract<Declaration, { type: "local-variable" }> | undefined;
		if (local === undefined) {
			return plural
				? { type: "plural", input: name, ...plural }
				: { type: "value", input: name };
		}
		if (local.value.arg.type !== "variable-reference") break;
		const annotation = local.value.annotation;
		if (annotation?.name === "plural" && plural === undefined) {
			plural = {
				ordinal: annotation.options.some(
					(option) =>
						option.name === "type" &&
						option.value.type === "literal" &&
						option.value.value === "ordinal"
				),
			};
		} else if (annotation !== undefined) {
			break;
		}
		name = local.value.arg.name;
	}
	// a formatted value, a literal or a cycle: selects only by its own keys
	return { type: "value", input: `\0${selector}` };
}

/**
 * Whether some variant can be selected by an input but, for every input that
 * selects it, a variant before it is selected instead. Checked with concrete
 * inputs: per input variable its exact keys, a number of every plural
 * category not among them, and a value that matches no key.
 */
function hasUnreachableVariant<V extends Pick<Variant, "matches">>(
	variants: V[],
	selectors: string[],
	kinds: Map<string, Kind>,
	locale: string
): boolean {
	const inputs = [...new Set([...kinds.values()].map((kind) => kind.input))];
	const candidates = inputs.map((input) => {
		const own = selectors.filter(
			(selector) => kinds.get(selector)!.input === input
		);
		const values = new Set<string | number>();
		// the exact keys; plural categories are covered by the numbers below
		for (const selector of own) {
			for (const variant of variants) {
				const match = keyOf(variant, selector);
				if (match?.type !== "literal-match") continue;
				if (isNumber(match.value)) values.add(Number(match.value));
				else if (kinds.get(selector)!.type !== "plural") {
					values.add(match.value);
				}
			}
		}
		// a number of every plural category that isn't an exact key
		const exact = new Set(values);
		const plurals = own
			.map((selector) => kinds.get(selector)!)
			.filter((kind) => kind.type === "plural");
		for (const kind of plurals) {
			const rules = pluralRules(locale, kind.ordinal);
			const covered = new Set<string>();
			for (const number of SAMPLE_NUMBERS) {
				if (exact.has(number)) continue;
				const category = rules.select(number);
				if (covered.has(category)) continue;
				covered.add(category);
				values.add(number);
			}
		}
		// a value that matches no key
		if (plurals.length === 0) values.add("\0other");
		return [...values];
	});
	const combinations = candidates.reduce((n, values) => n * values.length, 1);
	// too many to check: keep the order, which never changes a file
	if (combinations * variants.length * selectors.length > 5_000_000) {
		return false;
	}
	const keys = variants.map((variant) =>
		selectors.map((selector) => keyOf(variant, selector))
	);

	const selected = new Set<number>();
	const selectable = new Set<number>();
	const valueOf = new Map<string, string | number>();
	const selectorKinds = selectors.map((selector) => kinds.get(selector)!);
	const matches = (index: number) =>
		keys[index]!.every((match, i) => {
			if (match === undefined || match.type === "catchall-match") return true;
			const kind = selectorKinds[i]!;
			const value = valueOf.get(kind.input)!;
			if (isNumber(match.value)) {
				return typeof value === "number" && value === Number(match.value);
			}
			if (kind.type === "plural") {
				return (
					typeof value === "number" &&
					pluralRules(locale, kind.ordinal).select(value) === match.value
				);
			}
			return value === match.value;
		});
	const visit = (index: number): void => {
		if (index < inputs.length) {
			for (const value of candidates[index]!) {
				valueOf.set(inputs[index]!, value);
				visit(index + 1);
			}
			return;
		}
		let first = true;
		variants.forEach((_, i) => {
			if (!matches(i)) return;
			selectable.add(i);
			if (first) selected.add(i);
			first = false;
		});
	};
	visit(0);
	return [...selectable].some((index) => !selected.has(index));
}

/** 0–200, larger numbers and fractions, enough for every category of CLDR */
const SAMPLE_NUMBERS = [
	...Array.from({ length: 201 }, (_, i) => i),
	1000,
	1_000_000,
	0.5,
	1.5,
	2.5,
	5.5,
];

const pluralRulesCache = new Map<string, Intl.PluralRules>();
function pluralRules(locale: string, ordinal: boolean): Intl.PluralRules {
	const key = `${locale}\0${ordinal}`;
	let rules = pluralRulesCache.get(key);
	if (rules === undefined) {
		const type = ordinal ? "ordinal" : "cardinal";
		try {
			rules = new Intl.PluralRules(locale, { type });
		} catch {
			rules = new Intl.PluralRules("en", { type });
		}
		pluralRulesCache.set(key, rules);
	}
	return rules;
}

function keyOf(
	variant: Pick<Variant, "matches">,
	selector: string
): Match | undefined {
	return variant.matches.find((match) => match.key === selector);
}

/** the same numbers as the SDK's `isNumericKey` */
function isNumber(value: string): boolean {
	return /^-?\d+(\.\d+)?$/.test(value);
}
