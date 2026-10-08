import type { Kysely } from "kysely";
import type {
	BundleNested,
	InlangDatabaseSchema,
	VariantRow,
	MessageNested,
} from "../database/schema.js";

/**
 * Select bundles with nested messages and variants.
 *
 * A flat left join keeps this to one Lix engine round-trip and the small
 * reconstruction below preserves the established SDK result shape.
 */
export const selectBundleNested = (db: Kysely<InlangDatabaseSchema>) => {
	let bundleId: string | undefined;

	const query = {
		where(column: "inlang_bundle.id", operator: "=", value: string) {
			if (column !== "inlang_bundle.id" || operator !== "=") {
				throw new Error(
					"selectBundleNested only supports inlang_bundle.id equality"
				);
			}
			bundleId = value;
			return query;
		},
		selectAll() {
			return query;
		},
		async execute(): Promise<BundleNested[]> {
			let flatQuery = db
				.selectFrom("inlang_bundle")
				.leftJoin(
					"inlang_message",
					"inlang_message.bundle_id",
					"inlang_bundle.id"
				)
				.leftJoin(
					"inlang_variant",
					"inlang_variant.message_id",
					"inlang_message.id"
				)
				.select([
					"inlang_bundle.id as bundle_id",
					"inlang_bundle.declarations as bundle_declarations",
					"inlang_message.id as message_id",
					"inlang_message.locale as message_locale",
					"inlang_message.selectors as message_selectors",
					"inlang_variant.id as variant_id",
					"inlang_variant.matches as variant_matches",
					"inlang_variant.pattern as variant_pattern",
				])
				.orderBy("inlang_bundle.id")
				.orderBy("inlang_message.id")
				.orderBy("inlang_variant.id");
			if (bundleId !== undefined) {
				flatQuery = flatQuery.where("inlang_bundle.id", "=", bundleId);
			}
			const rows = await flatQuery.execute();
			const bundles = new Map<string, BundleNested>();
			const messages = new Map<string, MessageNested>();

			for (const row of rows) {
				let bundle = bundles.get(row.bundle_id);
				if (!bundle) {
					bundle = {
						id: row.bundle_id,
						declarations: row.bundle_declarations,
						messages: [],
					};
					bundles.set(row.bundle_id, bundle);
				}
				if (row.message_id === null) continue;
				let message = messages.get(row.message_id);
				if (!message) {
					message = {
						id: row.message_id,
						bundle_id: row.bundle_id,
						locale: row.message_locale!,
						selectors: row.message_selectors!,
						variants: [],
					};
					messages.set(row.message_id, message);
					bundle.messages.push(message);
				}
				if (row.variant_id !== null) {
					message.variants.push({
						id: row.variant_id,
						message_id: row.message_id,
						matches: row.variant_matches!,
						pattern: row.variant_pattern!,
					} satisfies VariantRow);
				}
			}
			return [...bundles.values()];
		},
		async executeTakeFirst(): Promise<BundleNested | undefined> {
			return (await query.execute())[0];
		},
		async executeTakeFirstOrThrow(): Promise<BundleNested> {
			const result = await query.executeTakeFirst();
			if (!result) throw new Error("No bundle found");
			return result;
		},
	};

	return query;
};
