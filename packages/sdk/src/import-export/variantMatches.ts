import type { Kysely } from "kysely";
import { v7 } from "uuid";
import type { InlangDatabaseSchema } from "../database/schema.js";
import { compareBinary } from "../checks/checkProject.js";

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
		.sort((a, b) => compareBinary(a.id, b.id));
	return { existing, duplicates };
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Makes the variants `ids` of a message follow each other in the given
 * order, the order of the import.
 *
 * The database has no position column: variants are ordered by id
 * (`selectBundleNested`, exports), and the database creates uuid v7 ids, so a
 * variant inserted later sorts after the ones inserted before. An import that
 * matches existing variants by their matches updates them in place, which
 * keeps their old position. If the file lists them in another order (a person
 * reordered them, or a plugin now reads a file in a different order), the
 * variants from the first one that is out of order on are inserted again,
 * with new ids, in the order of the import. Variants that are in order keep
 * their ids, so a re-import of unchanged files changes nothing.
 *
 * A new id only sorts after a uuid v7 of the past. Variants before the first
 * one out of order with other ids (uuid v4 of `insertBundleNested`, ids a
 * plugin or app chose) are inserted again as well, so that the order is
 * right after one import and stays as it is on the next.
 *
 * Runtimes like Paraglide JS select the first variant that matches, so the
 * order is part of the meaning of a message.
 */
export async function orderVariantsLikeImport(
	trx: Kysely<InlangDatabaseSchema>,
	idsInImportOrder: readonly string[]
): Promise<void> {
	const ids = [...new Set(idsInImportOrder)];
	const firstOutOfOrder = ids.findIndex(
		(id, index) => index > 0 && compareBinary(id, ids[index - 1]!) < 0
	);
	if (firstOutOfOrder === -1) return;
	const newId = v7();
	let start = firstOutOfOrder;
	while (
		start > 0 &&
		!(
			UUID_V7.test(ids[start - 1]!) && compareBinary(ids[start - 1]!, newId) < 0
		)
	) {
		start--;
	}
	const toReinsert = ids.slice(start);
	const rows = await trx
		.selectFrom("inlang_variant")
		.where("id", "in", toReinsert)
		.select(["id", "message_id", "matches", "pattern"])
		.execute();
	const rowsById = new Map(rows.map((row) => [row.id, row]));
	await trx
		.deleteFrom("inlang_variant")
		.where("id", "in", toReinsert)
		.execute();
	for (const id of toReinsert) {
		const row = rowsById.get(id);
		if (row === undefined) continue;
		await trx
			.insertInto("inlang_variant")
			.values({
				message_id: row.message_id,
				matches: row.matches,
				pattern: row.pattern,
			})
			.execute();
	}
}
