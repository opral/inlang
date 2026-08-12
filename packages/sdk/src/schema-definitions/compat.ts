export const InlangKeyValueSchema = {
	"x-lix-key": "inlang_key_value",
	"x-lix-primary-key": ["/key"],
	type: "object",
	properties: {
		key: { type: "string" },
		value: { type: "string" },
	},
	required: ["key", "value"],
	additionalProperties: false,
} as const;

export const InlangActiveAccountSchema = {
	"x-lix-key": "inlang_active_account",
	"x-lix-primary-key": ["/id"],
	type: "object",
	properties: {
		id: { type: "string" },
		name: { type: "string" },
	},
	required: ["id", "name"],
	additionalProperties: false,
} as const;
