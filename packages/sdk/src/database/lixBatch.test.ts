import { expect, test } from "vitest";
import { sql } from "kysely";
import { openLix } from "@lix-js/sdk";
import { executeLixBatch } from "./lixBatch.js";
import { initDb } from "./initDb.js";
import { registerInlangSchemas } from "./registerSchemas.js";

test("executeLixBatch publishes atomically and rolls back on a later failure", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });

	const insert = db
		.insertInto("bundle")
		.values({ id: "batch-atomicity" })
		.compile();
	const invalid =
		sql`INSERT INTO "missing_batch_table" ("id") VALUES (${"must-fail"})`.compile(
			db
		);

	await expect(executeLixBatch(db, [insert, invalid])).rejects.toThrow();
	await expect(
		db
			.selectFrom("bundle")
			.select("id")
			.where("id", "=", "batch-atomicity")
			.execute()
	).resolves.toEqual([]);

	await db.destroy();
	await lix.close();
});
