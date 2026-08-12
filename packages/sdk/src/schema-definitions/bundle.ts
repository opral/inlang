export const InlangBundleSchema = {
	"x-lix-key": "inlang_bundle",
	"x-lix-primary-key": ["/id"],
	type: "object",
	properties: {
		id: { type: "string", "x-lix-default": "lix_uuid_v7()" },
		declarations: { type: "array", items: { type: "object" }, default: [] },
	},
	required: ["id", "declarations"],
	additionalProperties: false,
} as const;
