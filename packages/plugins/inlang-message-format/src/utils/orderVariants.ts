import type { Declaration, Match, Variant } from "@inlang/sdk";

/**
 * Returns the variants in the order they are written to the file.
 *
 * Runtimes like Paraglide JS 2.26 return the first variant in file order
 * whose keys match. MessageFormat 2 instead prefers, selector by selector, a
 * variant with an exact or literal key over one with a plural category, and
 * that over one with the catch-all `*`. If the stored order already gives the
 * same result as that preference for every input, it is kept, so that files
 * don't change when the plugin is upgraded. Otherwise, e.g. if an editor
 * added an `=0` form after the catch-all, the variants are sorted by
 * preference (stable, ties keep their order).
 *
 * @param selectors the selectors in the order they are written to the file
 */
export function orderVariants<V extends Pick<Variant, "matches">>(
	variants: V[],
	selectors: string[],
	declarations: Declaration[]
): V[] {
	if (selectors.length === 0 || variants.length < 2) return variants;

	const plurals = new Set(
		selectors.filter((name) =>
			declarations.some(
				(declaration) =>
					declaration.type === "local-variable" &&
					declaration.name === name &&
					declaration.value.annotation?.name === "plural"
			)
		)
	);
	const keyOf = (variant: V, selector: string): Match | undefined =>
		variant.matches.find((match) => match.key === selector);
	// 0 = exact number of a plural or literal of any other selector,
	// 1 = plural category, 2 = catch-all
	const rankOf = (variant: V) =>
		selectors.map((selector) => {
			const match = keyOf(variant, selector);
			if (match === undefined || match.type === "catchall-match") return 2;
			return plurals.has(selector) && !isNumber(match.value) ? 1 : 0;
		});
	const compare = (a: number[], b: number[]) => {
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return a[i]! - b[i]!;
		}
		return 0;
	};
	const ranks = variants.map(rankOf);

	// The inputs to check, per selector as the set of literal keys an input
	// matches: each literal alone, none of them, and for a plural an exact
	// number together with a category (1 is also "one").
	const inputsPerSelector = selectors.map((selector) => {
		const literals = [
			...new Set(
				variants.flatMap((variant) => {
					const match = keyOf(variant, selector);
					return match?.type === "literal-match" ? [match.value] : [];
				})
			),
		];
		if (!plurals.has(selector)) {
			return [[], ...literals.map((literal) => [literal])];
		}
		const numbers = [undefined, ...literals.filter(isNumber)];
		const categories = [
			undefined,
			...literals.filter((literal) => !isNumber(literal)),
		];
		return numbers.flatMap((number) =>
			categories.map((category) =>
				[number, category].filter((key) => key !== undefined)
			)
		);
	});
	const matches = (variant: V, input: string[][]) =>
		selectors.every((selector, i) => {
			const match = keyOf(variant, selector);
			return (
				match === undefined ||
				match.type === "catchall-match" ||
				input[i]!.includes(match.value)
			);
		});

	// Whether, for some input, the first matching variant isn't the preferred
	// one. The rule is checked on every combination of keys, which is small
	// for messages people write.
	let shadowsPreferred = false;
	const check = (input: string[][]): void => {
		if (shadowsPreferred) return;
		if (input.length < selectors.length) {
			for (const keys of inputsPerSelector[input.length]!) {
				check([...input, keys]);
			}
			return;
		}
		let first: number | undefined;
		let preferred: number | undefined;
		variants.forEach((variant, index) => {
			if (!matches(variant, input)) return;
			first ??= index;
			if (
				preferred === undefined ||
				compare(ranks[index]!, ranks[preferred]!) < 0
			) {
				preferred = index;
			}
		});
		if (first !== preferred) shadowsPreferred = true;
	};
	check([]);
	if (!shadowsPreferred) return variants;

	return variants
		.map((variant, index) => ({ variant, index, rank: ranks[index]! }))
		.sort((a, b) => compare(a.rank, b.rank) || a.index - b.index)
		.map((entry) => entry.variant);
}

function isNumber(value: string): boolean {
	return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value);
}
