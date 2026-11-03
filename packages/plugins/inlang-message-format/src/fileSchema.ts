import { Type, type Static } from "@sinclair/typebox";

const InternalProperties = Type.Object(
	{
		$schema: Type.Optional(
			Type.Literal("https://inlang.com/schema/inlang-message-format")
		),
	},
	{ additionalProperties: false }
);

export type SimpleMessage = Static<typeof SimpleMessage>;
// Define a SimpleMessage type for string values
const SimpleMessage = Type.String();

export type ComplexMessageObject = Static<typeof ComplexMessageObject>;
// Complex message with variants
const ComplexMessageObject = Type.Object({
	description: Type.Optional(Type.String()),
	match: Type.Record(Type.String(), Type.String()),
	declarations: Type.Optional(Type.Array(Type.String())),
	selectors: Type.Optional(Type.Array(Type.String())),
});

export type ComplexMessage = Static<typeof ComplexMessage>;
// Complex message wrapped in array
const ComplexMessage = Type.Array(ComplexMessageObject);

// Define nested message structure with finite depth (5 levels deep)
// Level 1 - Deepest allowed nesting
const NestedLevel1 = Type.Union([SimpleMessage, ComplexMessage]);

// Level 2
const NestedLevel2 = Type.Union([
	SimpleMessage,
	ComplexMessage,
	Type.Record(Type.String(), NestedLevel1),
]);

// Level 3
const NestedLevel3 = Type.Union([
	SimpleMessage,
	ComplexMessage,
	Type.Record(Type.String(), NestedLevel2),
]);

// Level 4
const NestedLevel4 = Type.Union([
	SimpleMessage,
	ComplexMessage,
	Type.Record(Type.String(), NestedLevel3),
]);

// Level 5 - Top level
const NestedLevel5 = Type.Union([
	SimpleMessage,
	ComplexMessage,
	Type.Record(Type.String(), NestedLevel4),
]);

// Messages is a record of strings to our nested structure
const Messages = Type.Record(Type.String(), NestedLevel5, {
	additionalProperties: false,
});

/**
 * The storage schema is defined as object to enable the $schema
 * property. The $schema property enables typesafety in most IDEs.
 *
 * ! DO NOT USE THE SCHEMA TO PERFORM VALIDATION.
 * ! The schema disallows additional properties. If an old version
 * ! tries to parse a newer version that has new properties, the
 * ! validation will fail.
 */
export type FileSchema = Static<typeof FileSchema>;
export const FileSchema = Type.Union([InternalProperties, Messages]);
