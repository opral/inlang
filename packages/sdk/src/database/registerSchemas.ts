import type { Lix } from "@lix-js/sdk";
import {
	InlangBundleSchema,
	InlangMessageSchema,
	InlangVariantSchema,
	InlangActiveAccountSchema,
	InlangKeyValueSchema,
} from "../schema-definitions/index.js";

const schemas = [
	InlangBundleSchema,
	InlangMessageSchema,
	InlangVariantSchema,
	InlangKeyValueSchema,
	InlangActiveAccountSchema,
] as const;

export async function registerInlangSchemas(lix: Lix): Promise<void> {
	for (const schema of schemas) {
		await lix.execute(
			"INSERT INTO lix_registered_schema (value) VALUES (lix_json($1))",
			[JSON.stringify(schema)]
		);
	}
}
