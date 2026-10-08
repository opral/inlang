import { Kysely } from "kysely";
import { InlangDatabaseSchema } from "@inlang/sdk";

/**
 * Delete a bundle along with its nested messages and variants.
 *
 * @param db - The Kysely database instance.
 * @param bundleId - The ID of the bundle to delete.
 */
export const deleteBundleNested = async (
	db: Kysely<InlangDatabaseSchema>,
	bundleId: string
) => {
	// Step 1: Delete variants associated with the messages of the bundle
	await db
		.deleteFrom("inlang_variant")
		.where("inlang_variant.message_id", "in", (qb) =>
			qb
				.selectFrom("inlang_message")
				.select("inlang_message.id")
				.where("inlang_message.bundle_id", "=", bundleId)
		)
		.execute();

	// Step 2: Delete messages associated with the bundle
	await db
		.deleteFrom("inlang_message")
		.where("inlang_message.bundle_id", "=", bundleId)
		.execute();

	// Step 3: Delete the bundle itself
	await db.deleteFrom("inlang_bundle").where("inlang_bundle.id", "=", bundleId).execute();
};
