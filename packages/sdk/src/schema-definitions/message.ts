export const InlangMessageSchema = {
	$schema: "https://lix.dev/schema-v1.json",
	key: "inlang_message",
	columns: [
		{
			name: "id",
			type: "text",
			nullable: false,
		},
		{
			name: "bundle_id",
			type: "text",
			nullable: false,
		},
		{
			name: "locale",
			type: "text",
			nullable: false,
		},
		{
			name: "selectors",
			type: "jsonb",
			nullable: false,
			default_value: [],
		},
	],
	primary_key: ["id"],
	foreign_keys: [
		{
			columns: ["bundle_id"],
			references: { schema_key: "inlang_bundle", columns: ["id"] },
		},
	],
} as const;
