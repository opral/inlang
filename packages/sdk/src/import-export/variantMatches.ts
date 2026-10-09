import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";

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
 * Makes the variants `ids` of a message follow each other in the given
 * order, the order of the import.
 *
 * The database has no position column: variants are ordered by id
 * (`selectBundleNested`, exports), and ids are uuid v7, so a variant
 * inserted later sorts after the ones inserted before. An import that matches
 * existing variants by their matches updates them in place, which keeps their
 * old position. If the file lists them in another order (a person reordered
 * them, or a plugin now reads a file in a different order), the variants from
 * the first one that is out of order on are inserted again, with new ids, in
 * the order of the import. Variants that are in order keep their ids, so a
 * re-import of unchanged files changes nothing.
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
		(id, index) => index > 0 && id < ids[index - 1]!
	);
	if (firstOutOfOrder === -1) return;
	const toReinsert = ids.slice(firstOutOfOrder);
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
