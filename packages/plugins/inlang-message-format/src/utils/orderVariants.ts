import type { Declaration, Match, Variant } from "@inlang/sdk";

/**
 * Returns the variants in the order they are written to the file.
 *
 * Runtimes like Paraglide JS 2.26 return the first variant in file order
 * whose keys match. A variant that every input it matches also matches an
 * earlier variant is never displayed, e.g. an `=0` form that an editor added
 * after the catch-all `*`, or after the French `one` (which selects 0).
 * Only such a variant moves: before the earlier variants that MessageFormat 2
 * prefers less (selector by selector, an exact number or literal key before
 * a plural category before the catch-all), but not before a variant that
 * shares an input with it and is preferred over it. If that doesn't make
 * every variant selectable, all variants are sorted into preference order;
 * ties keep their order.
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
	const inputs = selectedVariants(variants, selectors, kinds, locale);
	if (inputs === undefined) return variants;

	const ranks = variants.map((variant) =>
		selectors.map((selector) => {
			const match = keyOf(variant, selector);
			if (match === undefined || match.type === "catchall-match") return 2;
			return kinds.get(selector)!.type === "plural" && !isNumber(match.value)
				? 1
				: 0;
		})
	);
	const compare = (a: number, b: number) => {
		for (let i = 0; i < selectors.length; i++) {
			const diff = ranks[a]![i]! - ranks[b]![i]!;
			if (diff !== 0) return diff;
		}
		return 0;
	};
	const overlap = (a: number, b: number) =>
		inputs.some((selected) => selected.includes(a) && selected.includes(b));
	// the first variant (by position in `order`) that is never displayed
	const unreachable = (order: number[]): number | undefined => {
		const position = new Map(order.map((index, at) => [index, at]));
		const first = new Set(
			inputs.map((selected) =>
				selected.reduce((a, b) => (position.get(a)! < position.get(b)! ? a : b))
			)
		);
		return order.find(
			(index) =>
				!first.has(index) && inputs.some((selected) => selected.includes(index))
		);
	};

	const order = variants.map((_, index) => index);
	for (let step = 0; step < variants.length; step++) {
		const variant = unreachable(order);
		if (variant === undefined) return order.map((index) => variants[index]!);
		const at = order.indexOf(variant);
		// the earliest place before variants it is preferred over, without
		// passing a variant that shares an input and is preferred over it
		let before = -1;
		for (let position = at - 1; position >= 0; position--) {
			const other = order[position]!;
			const preferred = compare(variant, other) < 0;
			if (!preferred && overlap(other, variant)) break;
			if (preferred) before = position;
		}
		if (before === -1) break;
		order.splice(at, 1);
		order.splice(before, 0, variant);
	}
	// moving single variants doesn't make all of them selectable
	return variants
		.map((variant, index) => ({ variant, index }))
		.sort((a, b) => compare(a.index, b.index) || a.index - b.index)
		.map((entry) => entry.variant);
}

/**
 * How a selector selects: a plural of an input (categories and exact
 * numbers), the value of an input itself (exact numbers and select values,
 * also through an un-annotated alias like `local countPluralExact = count`),
 * or anything else, which is treated as an opaque value of its own.
 */
type Kind =
	| { type: "plural"; input: string; ordinal: boolean; offset: number }
	| { type: "value"; input: string };

function kindOf(selector: string, declarations: Declaration[]): Kind {
	let plural: { ordinal: boolean; offset: number } | undefined;
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
			const option = (optionName: string) => {
				const value = annotation.options.find(
					(o) => o.name === optionName
				)?.value;
				return value?.type === "literal" ? value.value : undefined;
			};
			const offset = option("offset");
			plural = {
				ordinal: option("type") === "ordinal",
				offset: offset !== undefined && isNumber(offset) ? Number(offset) : 0,
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
 * The indexes of the variants that match, for every input that matters, or
 * undefined if every input selects its first matching variant already.
 * Inputs are concrete values per input variable: its exact keys, a number
 * of every plural category not among them, and a value that matches no key.
 */
function selectedVariants<V extends Pick<Variant, "matches">>(
	variants: V[],
	selectors: string[],
	kinds: Map<string, Kind>,
	locale: string
): number[][] | undefined {
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
				const category = rules.select(number - kind.offset);
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
		return undefined;
	}
	const keys = variants.map((variant) =>
		selectors.map((selector) => keyOf(variant, selector))
	);

	const selected = new Set<number>();
	const matchingPerInput: number[][] = [];
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
					pluralRules(locale, kind.ordinal).select(value - kind.offset) ===
						match.value
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
		const matching = variants.flatMap((_, i) => (matches(i) ? [i] : []));
		if (matching.length === 0) return;
		matchingPerInput.push(matching);
		selected.add(matching[0]!);
	};
	visit(0);
	return matchingPerInput.some((matching) =>
		matching.some((i) => !selected.has(i))
	)
		? matchingPerInput
		: undefined;
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

/**
 * `Intl.PluralRules` of a locale with the categories it selected, by number.
 * Every message of a file selects the same numbers, and `select` is slow.
 */
const pluralRulesCache = new Map<
	string,
	{ select: (number: number) => string }
>();
function pluralRules(
	locale: string,
	ordinal: boolean
): { select: (number: number) => string } {
	const key = `${locale}\0${ordinal}`;
	let rules = pluralRulesCache.get(key);
	if (rules === undefined) {
		const type = ordinal ? "ordinal" : "cardinal";
		let intl: Intl.PluralRules;
		try {
			// `pt_BR` as `pt-BR`, like the SDK
			intl = new Intl.PluralRules(locale.replace(/_/g, "-"), { type });
		} catch {
			intl = new Intl.PluralRules("en", { type });
		}
		const categories = new Map<number, string>();
		rules = {
			select: (number) => {
				let category = categories.get(number);
				if (category === undefined) {
					category = intl.select(number);
					categories.set(number, category);
				}
				return category;
			},
		};
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
