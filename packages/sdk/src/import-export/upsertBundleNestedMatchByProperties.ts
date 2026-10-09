import type { Kysely } from "kysely";
import type {
	InlangDatabaseSchema,
	NewBundleNested,
} from "../database/schema.js";
import {
	orderVariantsLikeImport,
	variantMatchesKey,
} from "./variantMatches.js";

export const upsertBundleNestedMatchByProperties = async (
	db: Kysely<InlangDatabaseSchema>,
	bundle: NewBundleNested
): Promise<void> => {
	if (bundle.id === undefined) {
		throw new Error("upsert expets a bundle id for matching");
	}
	// Pick the columns explicitly so that nested arrays and `lixcol_*`
	// properties of the input never reach the insert.
	const bundleToInsert = { id: bundle.id, declarations: bundle.declarations };

	await db.transaction().execute(async (trx) => {
		const insertedBundle = await trx
			.insertInto("inlang_bundle")
			.values(bundleToInsert)
			.onConflict((oc) => oc.column("id").doUpdateSet(bundleToInsert))
			.returning("id")
			.executeTakeFirstOrThrow();

		const existingMessages = await trx
			.selectFrom("inlang_message")
			.where("bundle_id", "=", insertedBundle.id)
			.selectAll()
			.execute();

		for (const message of bundle.messages) {
			// match by locale
			const existingMessage = existingMessages.find(
				(m) => m.locale === message.locale
			);

			const messageToInsert = {
				id: existingMessage?.id,
				bundle_id: insertedBundle.id,
				locale: message.locale,
				selectors: message.selectors,
			};
			const insertedMessage = await trx
				.insertInto("inlang_message")
				.values(messageToInsert)
				.onConflict((oc) => oc.column("id").doUpdateSet(messageToInsert))
				.returning("id")
				.executeTakeFirstOrThrow();

			const existingVariants = await trx
				.selectFrom("inlang_variant")
				.where("message_id", "=", insertedMessage.id)
				.selectAll()
				.execute();

			const idsInImportOrder: string[] = [];
			for (const variant of message.variants) {
				// match by matches
				const matchesKey = variantMatchesKey(variant.matches);
				const existingVariant = existingVariants.find(
					(v) => variantMatchesKey(v.matches) === matchesKey
				);

				const variantToInsert = {
					id: existingVariant?.id,
					message_id: insertedMessage.id,
					matches: variant.matches,
					pattern: variant.pattern,
				};
				if (variantToInsert.id === undefined) {
					const inserted = await trx
						.insertInto("inlang_variant")
						.values(variantToInsert)
						.returning("id")
						.executeTakeFirstOrThrow();
					idsInImportOrder.push(inserted.id);
				} else {
					await trx
						.insertInto("inlang_variant")
						.values(variantToInsert)
						.onConflict((oc) => oc.column("id").doUpdateSet(variantToInsert))
						.execute();
					idsInImportOrder.push(variantToInsert.id);
				}
			}
			await orderVariantsLikeImport(trx, idsInImportOrder);
		}
	});
};
