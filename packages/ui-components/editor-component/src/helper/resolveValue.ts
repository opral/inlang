import type { Declaration } from "@inlang/sdk";

/**
 * Resolves the raw (unformatted) value of a variable: a value passed in
 * `values` wins; local variables otherwise evaluate their expression's
 * argument (another variable or a literal). Cycle-safe.
 */
export function resolveValue(
	name: string,
	declarations: readonly Declaration[] | undefined,
	values: Record<string, unknown> | undefined,
	seen: Set<string> = new Set()
): unknown {
	if (values && Object.prototype.hasOwnProperty.call(values, name)) {
		return values[name];
	}
	if (seen.has(name)) return undefined;
	seen.add(name);
	const declaration = declarations?.find((value) => value.name === name);
	if (!declaration || declaration.type === "input-variable") return undefined;
	const arg = declaration.value.arg;
	return arg.type === "literal"
		? arg.value
		: resolveValue(arg.name, declarations, values, seen);
}
