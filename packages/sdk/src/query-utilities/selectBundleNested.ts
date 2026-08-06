import type { Kysely } from "kysely";
import type {
	BundleNested,
	InlangDatabaseSchema,
	MessageNested,
	Variant,
} from "../database/schema.js";

/**
 * Select bundles with nested messages and variants.
 *
 * Lix uses DataFusion, which does not provide SQLite's json_group_array()
 * helper. A flat left join keeps this to one engine round-trip and the small
 * reconstruction below preserves the established SDK result shape.
 */
export const selectBundleNested = (db: Kysely<InlangDatabaseSchema>) => {
	let bundleId: string | undefined;

	const query = {
		where(column: "bundle.id", operator: "=", value: string) {
			if (column !== "bundle.id" || operator !== "=") {
				throw new Error("selectBundleNested only supports bundle.id equality");
			}
			bundleId = value;
			return query;
		},
		selectAll() {
			return query;
		},
		async execute(): Promise<BundleNested[]> {
			let flatQuery = db
				.selectFrom("bundle")
				.leftJoin("message", "message.bundleId", "bundle.id")
				.leftJoin("variant", "variant.messageId", "message.id")
				.select([
					"bundle.id as bundleId",
					"bundle.declarations as bundleDeclarations",
					"message.id as messageId",
					"message.locale as messageLocale",
					"message.selectors as messageSelectors",
					"variant.id as variantId",
					"variant.matches as variantMatches",
					"variant.pattern as variantPattern",
				]);
			if (bundleId !== undefined) {
				flatQuery = flatQuery.where("bundle.id", "=", bundleId);
			}
			const rows = await flatQuery.execute();
			const bundles = new Map<string, BundleNested>();
			const messages = new Map<string, MessageNested>();

			for (const row of rows) {
				let bundle = bundles.get(row.bundleId);
				if (!bundle) {
					bundle = {
						id: row.bundleId,
						declarations: row.bundleDeclarations,
						messages: [],
					};
					bundles.set(row.bundleId, bundle);
				}
				if (row.messageId === null) continue;
				let message = messages.get(row.messageId);
				if (!message) {
					message = {
						id: row.messageId,
						bundleId: row.bundleId,
						locale: row.messageLocale!,
						selectors: row.messageSelectors!,
						variants: [],
					};
					messages.set(row.messageId, message);
					bundle.messages.push(message);
				}
				if (row.variantId !== null) {
					message.variants.push({
						id: row.variantId,
						messageId: row.messageId,
						matches: row.variantMatches!,
						pattern: row.variantPattern!,
					} satisfies Variant);
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
