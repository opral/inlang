import type { Kysely } from "kysely";
import type {
	BundleNestedUpdate,
	InlangDatabaseSchema,
} from "../database/schema.js";

/**
 * Update a bundle, its messages and their variants by id.
 *
 * Only the inlang columns are written: `declarations` on the bundle,
 * `bundle_id`, `locale` and `selectors` on messages, and `message_id`,
 * `matches` and `pattern` on variants. Other properties, such as the nested
 * `messages`/`variants` arrays or the `lixcol_*` columns of a `selectAll()`
 * row, are not written.
 */
export const updateBundleNested = async (
	db: Kysely<InlangDatabaseSchema>,
	bundle: BundleNestedUpdate & {
		id: string;
		messages: { id: string; variants: { id: string }[] }[];
	}
): Promise<void> => {
	const bundleColumns = definedColumns({
		declarations: bundle.declarations,
	});
	if (bundleColumns) {
		await db
			.updateTable("inlang_bundle")
			.set(bundleColumns)
			.where("id", "=", bundle.id)
			.execute();
	}

	for (const message of bundle.messages) {
		const messageColumns = definedColumns({
			bundle_id: message.bundle_id,
			locale: message.locale,
			selectors: message.selectors,
		});
		if (messageColumns) {
			await db
				.updateTable("inlang_message")
				.set(messageColumns)
				.where("id", "=", message.id)
				.execute();
		}

		for (const variant of message.variants) {
			const variantColumns = definedColumns({
				message_id: variant.message_id,
				matches: variant.matches,
				pattern: variant.pattern,
			});
			if (variantColumns) {
				await db
					.updateTable("inlang_variant")
					.set(variantColumns)
					.where("id", "=", variant.id)
					.execute();
			}
		}
	}
};

/**
 * The columns that have a value, or `undefined` if there is nothing to update.
 */
function definedColumns<T extends Record<string, unknown>>(
	columns: T
): Partial<T> | undefined {
	const defined = Object.fromEntries(
		Object.entries(columns).filter(([, value]) => value !== undefined)
	) as Partial<T>;
	return Object.keys(defined).length === 0 ? undefined : defined;
}
