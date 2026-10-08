import type { Kysely } from "kysely";
import type {
	BundleNestedUpdate,
	InlangDatabaseSchema,
} from "../database/schema.js";

export const updateBundleNested = async (
	db: Kysely<InlangDatabaseSchema>,
	bundle: BundleNestedUpdate & {
		id: string;
		messages: { id: string; variants: { id: string }[] }[];
	}
): Promise<void> => {
	await db
		.updateTable("inlang_bundle")
		.set(bundle)
		.where("id", "=", bundle.id)
		.execute();

	for (const message of bundle.messages) {
		await db
			.updateTable("inlang_message")
			.set(message)
			.where("id", "=", message.id)
			.execute();

		for (const variant of message.variants) {
			await db
				.updateTable("inlang_variant")
				.set(variant)
				.where("id", "=", variant.id)
				.execute();
		}
	}
};
