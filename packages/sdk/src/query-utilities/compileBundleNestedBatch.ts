import type { CompiledQuery, Kysely } from "kysely";
import { v7 } from "uuid";
import type {
	InlangDatabaseSchema,
	NewBundleNested,
} from "../database/schema.js";

type NestedWriteMode = "insert" | "upsert";

/**
 * Compiles the inserts of a nested bundle.
 *
 * New ids are uuid v7, like the ids the database creates: messages and
 * variants are ordered by id (`selectBundleNested`, exports), so an id that
 * sorts after the ones created before keeps the order in which they were
 * created, e.g. the variants a person adds in an editor. Random (v4) ids put
 * them in a random order, and runtimes select the first matching variant.
 *
 * uuid v7 is ordered per generator (this process' `uuid`, or the database's
 * `uuidv7()`); between the two, ids of the same millisecond can sort either
 * way. Ids created in separate steps (e.g. a select, then an upsert) are
 * milliseconds apart.
 */
export function compileBundleNestedBatch(
	db: Kysely<InlangDatabaseSchema>,
	bundle: NewBundleNested,
	mode: NestedWriteMode
): readonly CompiledQuery[] {
	const bundleId = bundle.id ?? v7();
	const queries: CompiledQuery[] = [];

	const bundleInsert = db
		.insertInto("inlang_bundle")
		.values({ id: bundleId, declarations: bundle.declarations });
	queries.push(
		(mode === "upsert"
			? bundleInsert.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						declarations: bundle.declarations,
					})
				)
			: bundleInsert
		).compile()
	);

	for (const message of bundle.messages) {
		const messageId = message.id ?? v7();
		const messageInsert = db.insertInto("inlang_message").values({
			id: messageId,
			bundle_id: bundleId,
			locale: message.locale,
			selectors: message.selectors,
		});
		queries.push(
			(mode === "upsert"
				? messageInsert.onConflict((oc) =>
						oc.column("id").doUpdateSet({
							bundle_id: bundleId,
							locale: message.locale,
							selectors: message.selectors,
						})
					)
				: messageInsert
			).compile()
		);

		for (const variant of message.variants) {
			const variantId = variant.id ?? v7();
			const variantInsert = db.insertInto("inlang_variant").values({
				id: variantId,
				message_id: messageId,
				matches: variant.matches,
				pattern: variant.pattern,
			});
			queries.push(
				(mode === "upsert"
					? variantInsert.onConflict((oc) =>
							oc.column("id").doUpdateSet({
								message_id: messageId,
								matches: variant.matches,
								pattern: variant.pattern,
							})
						)
					: variantInsert
				).compile()
			);
		}
	}

	return queries;
}
