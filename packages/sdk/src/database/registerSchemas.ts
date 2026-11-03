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
	const registered = await lix.query(
		"SELECT value ->> 'key' AS schema_key, value FROM lix_registered_schema"
	);
	const registeredKeys = new Set(
		registered
			.map((row) => row.schema_key)
			.filter((key): key is string => typeof key === "string")
	);

	for (const schema of schemas) {
		if (registeredKeys.has(schema.key)) {
			if (schema.key === "inlang_bundle") {
				const existing = registered.find(
					(row) => row.schema_key === schema.key
				)!.value as { columns: Array<{ name: string }> };
				if (!existing.columns.some((column) => column.name === "description")) {
					await lix.execute(
						"UPDATE lix_registered_schema SET value = $1 WHERE value ->> 'key' = $2",
						[
							Value.jsonb({
								...existing,
								columns: [
									...existing.columns,
									{ name: "description", type: "text", nullable: true },
								],
							}),
							schema.key,
						]
					);
				}
			}
			continue;
		}
		await lix.execute("INSERT INTO lix_registered_schema (value) VALUES ($1)", [
			Value.jsonb(schema),
		]);
	}
}
