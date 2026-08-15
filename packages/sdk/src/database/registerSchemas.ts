import { Value, type Lix } from "@lix-js/sdk";
import {
	InlangBundleSchema,
	InlangMessageSchema,
	InlangVariantSchema,
} from "../schema-definitions/index.js";

const schemas = [
	InlangBundleSchema,
	InlangMessageSchema,
	InlangVariantSchema,
] as const;

export async function registerInlangSchemas(lix: Lix): Promise<void> {
	const registered = await lix.execute(
		"SELECT value ->> 'key' AS schema_key FROM lix_registered_schema"
	);
	const registeredKeys = new Set(
		registered.rows
			.map((row) => row.value("schema_key").toJS())
			.filter((key): key is string => typeof key === "string")
	);

	for (const schema of schemas) {
		if (registeredKeys.has(schema.key)) continue;
		await lix.execute("INSERT INTO lix_registered_schema (value) VALUES ($1)", [
			Value.jsonb(schema),
		]);
	}
}
