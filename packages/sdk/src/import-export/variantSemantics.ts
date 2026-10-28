/**
 * A key for the `matches` of a variant that two variants share if and only if
 * they match the same selector values.
 *
 * `JSON.stringify` can't be used to compare matches: the database returns
 * JSON with its object keys sorted (`{"key", "type", "value"}`), while
 * plugins create matches with their own key order (`{type, key, value}`),
 * and the matches of a variant with several selectors may be listed in any
 * order, since every match names its selector with `key`.
 *
 * Missing matches are the same as no matches (`[]`, the column default).
 */
export function variantMatchesKey(matches: unknown): string {
	if (matches === undefined || matches === null) return "[]";
	if (!Array.isArray(matches)) return canonicalJson(matches);
	return `[${matches.map(canonicalJson).sort().join(",")}]`;
}

/** JSON with the keys of every object sorted. */
function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value
			.map((item) => (item === undefined ? "null" : canonicalJson(item)))
			.join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.keys(value)
			.sort()
			.filter((key) => (value as Record<string, unknown>)[key] !== undefined)
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalJson(
						(value as Record<string, unknown>)[key]
					)}`
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/**
 * The existing variant of a message with the given matches, and the other
 * variants with the same matches.
 *
 * A message has at most one variant per matches. Earlier SDK versions
 * duplicated variants with matches on every re-import (see
 * `variantMatchesKey`); an import of those matches keeps the first one (the
 * oldest) and the caller deletes the duplicates, so the project is repaired
 * by the next import.
 */
export function findExistingVariant<T extends { id: string; matches: unknown }>(
	existingVariants: readonly T[],
	matches: unknown
): { existing: T | undefined; duplicates: T[] } {
	const key = variantMatchesKey(matches);
	const [existing, ...duplicates] = existingVariants
		.filter((variant) => variantMatchesKey(variant.matches) === key)
		.sort((a, b) => compareVariantIds(a.id, b.id));
	return { existing, duplicates };
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Public UTF-8 binary order used for matching and variant precedence. */
export function compareVariantIds(a: string, b: string): number {
	let i = 0,
		j = 0;
	while (i < a.length && j < b.length) {
		const x = a.codePointAt(i)!,
			y = b.codePointAt(j)!;
		if (x !== y) return x - y;
		i += x > 0xffff ? 2 : 1;
		j += y > 0xffff ? 2 : 1;
	}
	return a.length - i - (b.length - j);
}

/** IDs whose identities must be regenerated to retain the import's priority. */
export function variantIdsToReorder(
	idsInImportOrder: readonly string[],
	createId: () => string
): string[] {
	const ids = [...new Set(idsInImportOrder)];
	const firstOutOfOrder = ids.findIndex(
		(id, index) => index > 0 && compareVariantIds(id, ids[index - 1]!) < 0
	);
	if (firstOutOfOrder === -1) return [];
	const newId = createId();
	let start = firstOutOfOrder;
	while (
		start > 0 &&
		!(
			UUID_V7.test(ids[start - 1]!) &&
			compareVariantIds(ids[start - 1]!, newId) < 0
		)
	)
		start--;
	return ids.slice(start);
}
