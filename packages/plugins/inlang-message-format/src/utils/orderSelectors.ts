import type { Declaration } from "@inlang/sdk";

/**
 * Returns the selector names in message order. An exact-number selector that
 * comes after the plural of the same input is moved directly before it.
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
 * (French "one" selects 0). Earlier versions of this plugin sorted selectors
 * alphabetically on export, which put `countPlural` first; such files are
 * repaired on import and export.
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

	const result = [...selectors];
	const paired = new Set<string>();
	for (const plural of selectors) {
		const local = localOf(plural);
		if (local?.value.annotation?.name !== "plural") continue;
		const input = inputOf(plural);
		const exact = selectors.find(
			(name) =>
				name !== plural &&
				!paired.has(name) &&
				localOf(name)?.value.annotation === undefined &&
				inputOf(name) === input
		);
		if (exact === undefined) continue;
		paired.add(exact);
		// an exact number already before its plural keeps its place, also
		// with other selectors in between (`countPluralExact, gender,
		// countPlural`): it already wins over the plural
		if (result.indexOf(exact) < result.indexOf(plural)) continue;
		result.splice(result.indexOf(exact), 1);
		result.splice(result.indexOf(plural), 0, exact);
	}
	return result;
}
