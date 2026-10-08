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
		.insertInto("inlang_bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	expect(isUuid(bundle.id)).toBe(true);
	expect(bundle.declarations).toStrictEqual([]);
});

test("message default values", async () => {
	const db = await createDb();

	const bundle = await db
		.insertInto("inlang_bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("inlang_message")
		.values({
			bundle_id: bundle.id,
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
		.insertInto("inlang_bundle")
		.defaultValues()
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("inlang_message")
		.values({
			bundle_id: bundle.id,
			locale: "en",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	const variant = await db
		.insertInto("inlang_variant")
		.values({
			message_id: message.id,
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
		.insertInto("inlang_bundle")
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
		.insertInto("inlang_bundle")
		.values({ id: "json_array" })
		.returningAll()
		.executeTakeFirstOrThrow();

	const message = await db
		.insertInto("inlang_message")
		.values({
			bundle_id: bundle.id,
			locale: "en",
		})
		.returningAll()
		.executeTakeFirstOrThrow();

	await db
		.insertInto("inlang_variant")
		.values({
			message_id: message.id,
			pattern: [
				{
					type: "text",
					value: '["a", "b", "c"]',
				},
			],
		})
		.execute();

	const variant = await db
		.selectFrom("inlang_variant")
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
			.insertInto("inlang_message")
			.values({
				bundle_id: "non-existent",
				locale: "en",
			})
			.execute()
	).rejects.toThrow();
});
