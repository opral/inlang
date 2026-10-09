import type { Declaration } from "@inlang/sdk";

/**
 * Returns the selector names in the given order, except that an exact-number
 * selector that comes after the plural of the same input is moved directly
 * before it. Import passes the file order, export the alphabetical order.
 *
 * That pair is how `@inlang/plugin-icu1` and editors (`addExactNumber`)
 * express ICU `{count, plural, =0 {…} one {…} other {…}}`:
 *
 * ```json
 * "declarations": [
 *   "input count",
 *   "local countPluralExact = count",
 *   "local countPlural = count: plural"
 * ],
 * "selectors": ["countPluralExact", "countPlural"]
 * ```
 *
 * Selector order is the MessageFormat 2 preference order, so the exact number
 * must come first to win over a plural category that also selects the number
 * (French "one" selects 0). Export sorts selectors alphabetically like every
 * earlier version, so that upgrading the plugin doesn't change files, and
 * only then moves the exact number. Earlier versions put `countPlural` first;
 * such files are repaired on import and export.
 *
 * An exact-number selector is an un-annotated selector that reads the same
 * input as a `plural` local: the input itself (`count`) or an alias
 * (`local countPluralExact = count`).
 */
export function orderSelectors(
	selectors: string[],
	declarations: Declaration[]
): string[] {
	const localOf = (name: string) =>
		declarations.find(
			(declaration) =>
				declaration.type === "local-variable" && declaration.name === name
		) as Extract<Declaration, { type: "local-variable" }> | undefined;
	const inputOf = (name: string) => {
		const local = localOf(name);
		if (local === undefined) return name;
		return local.value.arg.type === "variable-reference"
			? local.value.arg.name
			: undefined;
	};

	const plurals = selectors.filter(
		(name) => localOf(name)?.value.annotation?.name === "plural"
	);
	const isExactOf = (name: string, plural: string) => {
		const input = inputOf(plural);
		return (
			name !== plural &&
			input !== undefined &&
			localOf(name)?.value.annotation === undefined &&
			inputOf(name) === input
		);
	};
	// Pair every plural with its exact-number selector. A plural first gets
	// the one named after it (`countPlural` → `countPluralExact`, how
	// plugin-icu1 and editors name it), so that two plurals on the same input
	// (`countPlural`, `countPlural1`) each get their own. The others pair in
	// order.
	const pairs = new Map<string, string>();
	const paired = new Set<string>();
	for (const plural of plurals) {
		const named = `${plural}Exact`;
		if (selectors.includes(named) && isExactOf(named, plural)) {
			pairs.set(plural, named);
			paired.add(named);
		}
	}
	for (const plural of plurals) {
		if (pairs.has(plural)) continue;
		const exact = selectors.find(
			(name) => !paired.has(name) && isExactOf(name, plural)
		);
		if (exact === undefined) continue;
		pairs.set(plural, exact);
		paired.add(exact);
	}

	const result = [...selectors];
	for (const [plural, exact] of pairs) {
		// an exact number already before its plural keeps its place, also
		// with other selectors in between (`countPluralExact, gender,
		// countPlural`): it already wins over the plural
		if (result.indexOf(exact) < result.indexOf(plural)) continue;
		result.splice(result.indexOf(exact), 1);
		result.splice(result.indexOf(plural), 0, exact);
	}
	return result;
}
