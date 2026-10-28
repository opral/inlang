import type { Kysely } from "kysely";
import { v7 } from "uuid";
import type { InlangDatabaseSchema } from "../database/schema.js";
import { variantIdsToReorder } from "./variantSemantics.js";
export { findExistingVariant, variantMatchesKey } from "./variantSemantics.js";

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
	const toReinsert = variantIdsToReorder(idsInImportOrder, v7);
	if (toReinsert.length === 0) return;
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
