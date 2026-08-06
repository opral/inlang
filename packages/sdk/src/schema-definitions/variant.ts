export const InlangVariantSchema = {
	"x-lix-key": "variant",
	"x-lix-primary-key": ["/id"],
	"x-lix-foreign-keys": [
		{
			properties: ["/messageId"],
			references: { schemaKey: "message", properties: ["/id"] },
		},
	],
	type: "object",
	properties: {
		id: { type: "string", "x-lix-default": "lix_uuid_v7()" },
		messageId: { type: "string" },
		matches: { type: "array", items: { type: "object" }, default: [] },
		pattern: { type: "array", items: { type: "object" }, default: [] },
	},
	required: ["id", "messageId", "matches", "pattern"],
	additionalProperties: false,
} as const;
