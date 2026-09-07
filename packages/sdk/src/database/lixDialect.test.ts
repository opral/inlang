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

	expect(compiled.sql).toBe('select "id" from "bundle" where "id" = $1');
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

test("transaction reads find newly written messages and variants by text columns", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	try {
		await db.transaction().execute(async (trx) => {
			await trx.insertInto("bundle").values({ id: "bundle" }).execute();
			await trx
				.insertInto("message")
				.values({ id: "message", bundleId: "bundle", locale: "en" })
				.execute();
			await trx
				.insertInto("variant")
				.values({ id: "variant", messageId: "message" })
				.execute();
			expect(
				await trx
					.selectFrom("message")
					.select("id")
					.where("bundleId", "=", "bundle")
					.where("locale", "=", "en")
					.execute()
			).toEqual([{ id: "message" }]);
			expect(
				await trx
					.selectFrom("variant")
					.select("id")
					.where("messageId", "in", ["message"])
					.execute()
			).toEqual([{ id: "variant" }]);
			expect(
				await trx
					.selectFrom("message")
					.select("id")
					.where("locale", "=", "de")
					.execute()
			).toEqual([]);
		});
	} finally {
		await db.destroy();
		await lix.close();
	}
});

test("preserves encoded identities and locales in direct and nested reads", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	try {
		const bundleId = "bundle\0id";
		const messageId = "lixid1:message";
		const variantId = "variant\0id";
		const locale = "en\0US";
		await db.insertInto("bundle").values({ id: bundleId }).execute();
		await db
			.insertInto("message")
			.values({ id: messageId, bundleId, locale })
			.execute();
		await db
			.insertInto("variant")
			.values({ id: variantId, messageId })
			.execute();
		expect(
			await db
				.selectFrom("message")
				.selectAll()
				.where("locale", "=", locale)
				.executeTakeFirstOrThrow()
		).toMatchObject({ id: messageId, bundleId, locale });
		const nested = await selectBundleNested(db)
			.where("bundle.id", "=", bundleId)
			.executeTakeFirstOrThrow();
		expect(nested.id).toBe(bundleId);
		expect(nested.messages[0]).toMatchObject({ id: messageId, locale });
		expect(nested.messages[0]?.variants[0]?.id).toBe(variantId);
	} finally {
		await db.destroy();
		await lix.close();
	}
});

test("CTE transaction reads find newly written messages and variants", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	try {
		await db.transaction().execute(async (trx) => {
			await trx.insertInto("bundle").values({ id: "bundle" }).execute();
			await trx
				.insertInto("message")
				.values({ id: "message", bundleId: "bundle", locale: "en" })
				.execute();
			await trx
				.insertInto("variant")
				.values({ id: "variant", messageId: "message" })
				.execute();
			const query = trx
				.with("matching_messages", (qb) =>
					qb.selectFrom("message").select("id").where("locale", "=", "en")
				)
				.with("matching_variants", (qb) =>
					qb
						.selectFrom("variant")
						.select("id")
						.where("messageId", "=", "message")
				)
				.selectFrom("matching_messages")
				.crossJoin("matching_variants")
				.select([
					"matching_messages.id as foundMessage",
					"matching_variants.id as foundVariant",
				]);
			expect(await query.execute()).toEqual([
				{ foundMessage: "message", foundVariant: "variant" },
			]);
		});
	} finally {
		await db.destroy();
		await lix.close();
	}
});
