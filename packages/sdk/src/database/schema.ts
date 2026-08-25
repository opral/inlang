import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import {
	Declaration,
	Pattern,
	VariableReference,
} from "../json-schema/pattern.js";

export type InlangDatabaseSchema = {
	bundle: BundleTable;
	message: MessageTable;
	variant: VariantTable;
};

type BundleTable = {
	id: Generated<string>;
	declarations: Generated<Array<Declaration>>;
};

type MessageTable = {
	id: Generated<string>;
	bundleId: string;
	locale: string;
	selectors: Generated<Array<VariableReference>>;
};

type VariantTable = {
	id: Generated<string>;
	messageId: string;
	matches: Generated<Array<Match>>;
	pattern: Generated<Pattern>;
};

/**
 * A match is a variable reference that is either a literal or a catch-all.
 *
 * https://github.com/opral/inlang/issues/205
 *
 * @example
 *   match = { type: "match", name: "gender", value: { type: "literal", value: "male"  }}
 */
export type Match = LiteralMatch | CatchAllMatch;

export type LiteralMatch = {
	type: "literal-match";
	key: VariableReference["name"];
	value: string;
};
export type CatchAllMatch = {
	type: "catchall-match";
	key: VariableReference["name"];
};

export type Bundle = Selectable<BundleTable>;
export type NewBundle = Insertable<BundleTable>;
export type BundleUpdate = Updateable<BundleTable>;

export type Message = Selectable<MessageTable>;
export type NewMessage = Insertable<MessageTable>;
export type MessageUpdate = Updateable<MessageTable>;

export type Variant = Selectable<VariantTable>;
export type NewVariant = Insertable<VariantTable>;
export type VariantUpdate = Updateable<VariantTable>;

export type MessageNested = Message & {
	variants: Variant[];
};
export type NewMessageNested = NewMessage & {
	variants: NewVariant[];
};
export type MessageNestedUpdate = Updateable<MessageTable> & {
	variants: VariantUpdate[];
};

export type BundleNested = Bundle & {
	messages: MessageNested[];
};
export type NewBundleNested = NewBundle & {
	messages: NewMessageNested[];
};
export type BundleNestedUpdate = BundleUpdate & {
	messages: MessageNestedUpdate[];
};
