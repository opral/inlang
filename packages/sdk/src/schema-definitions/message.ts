export const InlangMessageSchema = {
	"x-lix-key": "message",
	"x-lix-primary-key": ["/id"],
	"x-lix-foreign-keys": [
		{
			properties: ["/bundleId"],
			references: { schemaKey: "bundle", properties: ["/id"] },
		},
	],
	type: "object",
	properties: {
		id: { type: "string", "x-lix-default": "lix_uuid_v7()" },
		bundleId: { type: "string" },
		locale: { type: "string" },
		selectors: { type: "array", items: { type: "object" }, default: [] },
	},
	required: ["id", "bundleId", "locale", "selectors"],
	additionalProperties: false,
} as const;
