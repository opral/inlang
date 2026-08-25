import { expect, test } from "vitest";
import { openLix } from "@lix-js/sdk";
import { initDb } from "./initDb.js";
import { registerInlangSchemas } from "./registerSchemas.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";

test("compiles Kysely parameters with PostgreSQL placeholders", async () => {
	const lix = await openLix();
	const db = initDb({ lix });

	const compiled = db
		.selectFrom("bundle")
		.select("id")
		.where("id", "=", "example")
		.compile();

	expect(compiled.sql).toBe(
		'select "id" from "bundle" where "id" = $1'
	);
	expect(compiled.parameters).toEqual(["example"]);

	await db.destroy();
	await lix.close();
});

test("executes Kysely reads, writes, defaults, and transactions on Lix", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });

	const bundle = await db
		.insertInto("bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();
	expect(bundle.id).toBeTypeOf("string");
	expect(bundle.declarations).toEqual([]);

	await db.transaction().execute(async (trx) => {
		const message = await trx
			.insertInto("message")
			.values({ bundleId: bundle.id, locale: "en" })
			.returningAll()
			.executeTakeFirstOrThrow();
		await trx.insertInto("variant").values({ messageId: message.id }).execute();
	});

	expect(await db.selectFrom("message").selectAll().execute()).toHaveLength(1);
	expect(await db.selectFrom("variant").selectAll().execute()).toHaveLength(1);
	const nested = await selectBundleNested(db).executeTakeFirstOrThrow();
	expect(nested.messages[0]?.variants).toHaveLength(1);

	await db.destroy();
	await lix.close();
});
