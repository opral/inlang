import type { Kysely } from "kysely";
import type {
	InlangDatabaseSchema,
	NewBundleNested,
} from "../database/schema.js";

export const upsertBundleNestedMatchByProperties = async (
	db: Kysely<InlangDatabaseSchema>,
	bundle: NewBundleNested
): Promise<void> => {
	if (bundle.id === undefined) {
		throw new Error("upsert expets a bundle id for matching");
	}
	const bundleToInsert = { ...bundle, messages: undefined };

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
				...message,
				id: existingMessage?.id,
				bundle_id: insertedBundle.id,
				variants: undefined,
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

			for (const variant of message.variants) {
				// match by matches
				const existingVariant = existingVariants.find(
					(v) => JSON.stringify(v.matches) === JSON.stringify(variant.matches)
				);

				const variantToInsert = {
					...variant,
					id: existingVariant?.id,
					message_id: insertedMessage.id,
				};
				await trx
					.insertInto("inlang_variant")
					.values(variantToInsert)
					.onConflict((oc) => oc.column("id").doUpdateSet(variantToInsert))
					.execute();
			}
		}
	});
};
