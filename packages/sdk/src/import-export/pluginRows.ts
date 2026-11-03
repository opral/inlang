import { sql, type Kysely } from "kysely";
import type {
	Bundle,
	InlangDatabaseSchema,
	Message,
	NewMessageRow,
	Variant,
} from "../database/schema.js";
import type { MessageImport, VariantImport } from "../plugin/schema.js";

/**
 * Plugins exchange camelCase `bundleId` and `messageId` with the SDK, while
 * the database uses the canonical `bundle_id` and `message_id` columns. The
 * mapping lives here so that plugins and SDK versions stay interchangeable.
 */

export type ImportedMessage = Omit<MessageImport, "bundleId"> &
	Pick<NewMessageRow, "bundle_id">;

export type ImportedVariant = VariantImport extends infer T
	? T extends { messageId?: infer MessageId }
		? Omit<T, "messageId"> & { message_id: MessageId }
		: never
	: never;

export function messageFromPlugin(message: MessageImport): ImportedMessage {
	const { bundleId, ...rest } = message;
	return { ...rest, bundle_id: bundleId };
}

export function variantFromPlugin(variant: VariantImport): ImportedVariant {
	const { messageId, ...rest } = variant;
	return { ...rest, message_id: messageId } as ImportedVariant;
}

/**
 * Selects all bundles, messages and variants in the shape plugins expect.
 */
export async function selectPluginRows(
	db: Kysely<InlangDatabaseSchema>
): Promise<{ bundles: Bundle[]; messages: Message[]; variants: Variant[] }> {
	// One statement reads a consistent state, retaining each table's scan
	// order. A join would group variants by bundle and reorder plugin output.
	const rows = db
		.selectFrom(
			sql<{
				kind: "bundle" | "message" | "variant";
				id: string;
				bundle_id: string | null;
				message_id: string | null;
				locale: string | null;
				data:
					| Bundle["declarations"]
					| Message["selectors"]
					| Variant["matches"];
				pattern: Variant["pattern"] | null;
				description: string | null;
			}>`(
			SELECT 'bundle' AS kind, id, NULL AS bundle_id, NULL AS message_id, NULL AS locale,
				declarations AS data, NULL AS pattern, description FROM inlang_bundle
			UNION ALL
			SELECT 'message', id, bundle_id, NULL, locale, selectors, NULL, NULL FROM inlang_message
			UNION ALL
			SELECT 'variant', id, NULL, message_id, NULL, matches, pattern, NULL FROM inlang_variant
		)`.as("plugin_rows")
		)
		.selectAll()
		.stream();
	const bundles: Bundle[] = [];
	const messages: Message[] = [];
	const variants: Variant[] = [];
	for await (const row of rows) {
		switch (row.kind) {
			case "bundle":
				bundles.push({
					id: row.id,
					declarations: row.data as Bundle["declarations"],
					description: row.description ?? null,
				});
				break;
			case "message":
				messages.push({
					id: row.id,
					bundleId: row.bundle_id!,
					locale: row.locale!,
					selectors: row.data as Message["selectors"],
				});
				break;
			case "variant":
				variants.push({
					id: row.id,
					messageId: row.message_id!,
					matches: row.data as Variant["matches"],
					pattern: row.pattern!,
				});
		}
	}
	return { bundles, messages, variants };
}
