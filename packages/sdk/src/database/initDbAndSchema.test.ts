import { test, expect } from "vitest";
import { openLix } from "@lix-js/sdk";
import { initDb } from "./initDb.js";
import { registerInlangSchemas } from "./registerSchemas.js";
import { validate as isUuid } from "uuid";

async function createDb() {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	return initDb({ lix });
}

test("bundle default values", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(isUuid(bundle.id)).toBe(true);
	expect(bundle.declarations).toStrictEqual([]);
});

test("message default values", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("message")
		.values({
			bundleId: bundle.id,
			locale: "en",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(isUuid(message.id)).toBe(true);
	expect(message.selectors).toStrictEqual([]);
});

test("variant default values", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("message")
		.values({
			bundleId: bundle.id,
			locale: "en",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	const variant = await db
		.insertInto("variant")
		.values({
			messageId: message.id,
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(isUuid(variant.id)).toBe(true);
	expect(variant.matches).toStrictEqual([]);
	expect(variant.pattern).toStrictEqual([]);
});

test("it should handle json serialization and parsing for bundles", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("bundle")
		.values({
			declarations: [
				{
					type: "input-variable",
					name: "mock",
				},
			],
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(bundle.declarations).toStrictEqual([
		{
			type: "input-variable",
			name: "mock",
		},
	]);
});

// https://github.com/opral/paraglide-js/issues/571
test("it should preserve json-like text in variant patterns", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("bundle")
		.values({ id: "json_array" })
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("message")
		.values({
			bundleId: bundle.id,
			locale: "en",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	await db
		.insertInto("variant")
		.values({
			messageId: message.id,
			pattern: [
				{
					type: "text",
					value: '["a", "b", "c"]',
				},
			],
		})
		.execute();

	const variant = await db
		.selectFrom("variant")
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(variant.pattern).toStrictEqual([
		{
			type: "text",
			value: '["a", "b", "c"]',
		},
	]);
});

// https://github.com/opral/inlang/issues/209
test.todo("it should enable foreign key constraints", async () => {
	const db = await createDb();

	expect(() =>
		db
			.insertInto("message")
			.values({
				bundleId: "non-existent",
				locale: "en",
			})
			.execute()
	).rejects.toThrow();
});
