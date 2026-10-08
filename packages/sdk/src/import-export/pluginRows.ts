import type { Kysely } from "kysely";
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
	const [bundles, messages, variants] = await Promise.all([
		db.selectFrom("inlang_bundle").select(["id", "declarations"]).execute(),
		db
			.selectFrom("inlang_message")
			.select(["id", "bundle_id", "locale", "selectors"])
			.execute(),
		db
			.selectFrom("inlang_variant")
			.select(["id", "message_id", "matches", "pattern"])
			.execute(),
	]);
	return {
		bundles,
		messages: messages.map(({ bundle_id, ...message }) => ({
			...message,
			bundleId: bundle_id,
		})),
		variants: variants.map(({ message_id, ...variant }) => ({
			...variant,
			messageId: message_id,
		})),
	};
}
