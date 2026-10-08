import type { CompiledQuery, Kysely } from "kysely";
import type {
	InlangDatabaseSchema,
	NewBundleNested,
} from "../database/schema.js";

type NestedWriteMode = "insert" | "upsert";

export function compileBundleNestedBatch(
	db: Kysely<InlangDatabaseSchema>,
	bundle: NewBundleNested,
	mode: NestedWriteMode
): readonly CompiledQuery[] {
	const bundleId = bundle.id ?? crypto.randomUUID();
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
		const messageId = message.id ?? crypto.randomUUID();
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
			const variantId = variant.id ?? crypto.randomUUID();
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
