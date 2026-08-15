export const InlangBundleSchema = {
	$schema: "https://lix.dev/schema-v1.json",
	key: "inlang_bundle",
	columns: [
		{
			name: "id",
			type: "text",
			nullable: false,
		},
		{
			name: "declarations",
			type: "jsonb",
			nullable: false,
			default_value: [],
		},
	],
	primary_key: ["id"],
} as const;
