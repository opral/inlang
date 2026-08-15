export const InlangVariantSchema = {
	$schema: "https://lix.dev/schema-v1.json",
	key: "inlang_variant",
	columns: [
		{
			name: "id",
			type: "text",
			nullable: false,
		},
		{
			name: "message_id",
			type: "text",
			nullable: false,
		},
		{
			name: "matches",
			type: "jsonb",
			nullable: false,
			default_value: [],
		},
		{
			name: "pattern",
			type: "jsonb",
			nullable: false,
			default_value: [],
		},
	],
	primary_key: ["id"],
	foreign_keys: [
		{
			columns: ["message_id"],
			references: { schema_key: "inlang_message", columns: ["id"] },
		},
	],
} as const;
