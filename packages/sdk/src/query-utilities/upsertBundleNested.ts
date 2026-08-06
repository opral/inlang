import type { Kysely } from "kysely";
import type {
	InlangDatabaseSchema,
	NewBundleNested,
} from "../database/schema.js";
import { executeLixBatch } from "../database/lixBatch.js";
import { compileBundleNestedBatch } from "./compileBundleNestedBatch.js";

export const upsertBundleNested = async (
	db: Kysely<InlangDatabaseSchema>,
	bundle: NewBundleNested
): Promise<void> => {
	await executeLixBatch(db, compileBundleNestedBatch(db, bundle, "upsert"));
};
