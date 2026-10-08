import type {
	ColumnType,
	Generated,
	Insertable,
	Selectable,
	Updateable,
} from "kysely";
import {
	Declaration,
	Pattern,
	VariableReference,
} from "../json-schema/pattern.js";

/**
 * Kysely schema of the inlang tables exactly as Lix exposes them.
 *
 * Table and column names are the canonical SQL names. Queries compile to the
 * SQL that Lix executes without any renaming in between.
 */
export type InlangDatabaseSchema = {
	inlang_bundle: InlangBundleTable & LixColumns;
	inlang_message: InlangMessageTable & LixColumns;
	inlang_variant: InlangVariantTable & LixColumns;
};

/**
 * Columns that Lix adds to every entity table.
 */
type LixColumns = {
	lixcol_file_id: ColumnType<string | null, string | null | undefined, never>;
	lixcol_metadata: Generated<unknown>;
	lixcol_global: ColumnType<boolean, boolean | undefined, never>;
	lixcol_untracked: ColumnType<boolean, boolean | undefined, never>;
	lixcol_created_at: ColumnType<string, never, never>;
	lixcol_updated_at: ColumnType<string, never, never>;
	lixcol_change_id: ColumnType<string, never, never>;
	lixcol_author_id: ColumnType<string | null, never, never>;
	lixcol_commit_id: ColumnType<string, never, never>;
};

type InlangBundleTable = {
	id: Generated<string>;
	declarations: Generated<Array<Declaration>>;
};

type InlangMessageTable = {
	id: Generated<string>;
	bundle_id: string;
	locale: string;
	selectors: Generated<Array<VariableReference>>;
};

type InlangVariantTable = {
	id: Generated<string>;
	message_id: string;
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

export type BundleRow = Selectable<InlangBundleTable>;
export type NewBundleRow = Insertable<InlangBundleTable>;
export type BundleRowUpdate = Updateable<InlangBundleTable>;

export type MessageRow = Selectable<InlangMessageTable>;
export type NewMessageRow = Insertable<InlangMessageTable>;
export type MessageRowUpdate = Updateable<InlangMessageTable>;

export type VariantRow = Selectable<InlangVariantTable>;
export type NewVariantRow = Insertable<InlangVariantTable>;
export type VariantRowUpdate = Updateable<InlangVariantTable>;

export type MessageNested = MessageRow & {
	variants: VariantRow[];
};
export type NewMessageNested = NewMessageRow & {
	variants: NewVariantRow[];
};
export type MessageNestedUpdate = MessageRowUpdate & {
	variants: VariantRowUpdate[];
};

export type BundleNested = BundleRow & {
	messages: MessageNested[];
};
export type NewBundleNested = NewBundleRow & {
	messages: NewMessageNested[];
};
export type BundleNestedUpdate = BundleRowUpdate & {
	messages: MessageNestedUpdate[];
};

/**
 * Plugin-facing shapes.
 *
 * Plugins exchange bundles, messages and variants with the SDK through
 * `importFiles()` and `exportFiles()`. That contract keeps its camelCase
 * properties so that plugins and SDK versions stay interchangeable. The SDK
 * maps between these shapes and the canonical database rows.
 */
type BundleShape = {
	id: Generated<string>;
	declarations: Generated<Array<Declaration>>;
};

type MessageShape = {
	id: Generated<string>;
	bundleId: string;
	locale: string;
	selectors: Generated<Array<VariableReference>>;
};

type VariantShape = {
	id: Generated<string>;
	messageId: string;
	matches: Generated<Array<Match>>;
	pattern: Generated<Pattern>;
};

export type Bundle = Selectable<BundleShape>;
export type NewBundle = Insertable<BundleShape>;
export type BundleUpdate = Updateable<BundleShape>;

export type Message = Selectable<MessageShape>;
export type NewMessage = Insertable<MessageShape>;
export type MessageUpdate = Updateable<MessageShape>;

export type Variant = Selectable<VariantShape>;
export type NewVariant = Insertable<VariantShape>;
export type VariantUpdate = Updateable<VariantShape>;
