import { v4 as uuid } from "uuid";
import type { ProjectSettings } from "./json-schema/settings.js";
import { humanId } from "./human-id/human-id.js";
import type {
	Match,
	NewBundleNested,
	NewMessageNested,
	VariantRow,
} from "./database/schema.js";
import type { Text } from "./json-schema/pattern.js";

/**
 * create v2 Bundle with a random human ID
 *
 * @deprecated
 *
 * use the database directly
 *
 * - less code because the database has default values
 * - `createMessage` is misleading because it does not treat expressions in the text
 *
 * @example createBundle({
 *   messages: [
 * 		 createMessage({locale: "en", text: "Hello world!"})
 * 		 createMessage({locale: "de", text: "Hallo Welt!"})
 *   ]
 * })
 */
export function createBundle(args: {
	id?: string;
	messages: NewMessageNested[];
}): NewBundleNested {
	return {
		id: args.id ?? humanId(),
		messages: args.messages,
	};
}

/**
 *
 * @deprecated
 * use the database directly
 *
 * - text will always be a string, no matter
 *   if an expression is provided like hello "{username}"
 * - the database has default values
 *
 * ```
 * await project.db.insertInto("inlang_message").values({
 * 		bundle_id: "greeting",
 *    pattern: []
 * 		...
 * })
 * ```
 *
 * create v2 Messsage AST with a randomId, and text-only pattern
 * @example createMessage({locale: "en", text: "Hello world"})
 */
export function createMessage(args: {
	bundleId: string;
	locale: ProjectSettings["locales"][number];
	text: string;
	matches?: Match[];
}): NewMessageNested {
	const messageId = uuid();
	return {
		bundle_id: args.bundleId,
		id: messageId,
		locale: args.locale,
		selectors: [],
		variants: [
			createVariant({
				messageId: messageId,
				text: args.text,
				matches: args.matches,
			}),
		],
	};
}

/**
 *
 * @deprecated
 *
 * use the database directly
 *
 * - less code because the database has default values
 * - `text` is misleading because it does not treat expressions in the text
 *
 * create v2 Variant AST with text-only pattern
 * @example createVariant({match: ["*"], text: "Hello world"})
 */
export function createVariant(args: {
	messageId: string;
	id?: string;
	text?: string;
	matches?: Match[];
	pattern?: VariantRow["pattern"];
}): VariantRow {
	return {
		message_id: args.messageId,
		id: args.id ? args.id : uuid(),
		matches: args.matches ? args.matches : [],
		pattern: args.pattern ? args.pattern : [toTextElement(args.text ?? "")],
	};
}

export function toTextElement(text: string): Text {
	return {
		type: "text",
		value: text,
	};
}
