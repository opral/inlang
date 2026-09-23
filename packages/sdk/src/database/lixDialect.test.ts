import { expect, test, vi } from "vitest";
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

test("preserves a consumed commit failure and permits a subsequent transaction", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	const commitError = new Error("durable commit failed");
	const begin = lix.beginTransaction.bind(lix);
	const beginSpy = vi
		.spyOn(lix, "beginTransaction")
		.mockImplementationOnce(async () => {
			const transaction = await begin();
			vi.spyOn(transaction, "commit").mockImplementationOnce(async () => {
				// Match the Lix contract: a failed terminal call consumes its handle.
				await transaction.rollback();
				throw commitError;
			});
			return transaction;
		});
	try {
		await expect(
			db.transaction().execute(async (trx) => {
				await trx.insertInto("bundle").values({ id: "failed" }).execute();
			})
		).rejects.toBe(commitError);
		expect(await db.selectFrom("bundle").selectAll().execute()).toEqual([]);
		await db.transaction().execute(async (trx) => {
			await trx.insertInto("bundle").values({ id: "next" }).execute();
		});
		expect(await db.selectFrom("bundle").select("id").execute()).toEqual([
			{ id: "next" },
		]);
	} finally {
		beginSpy.mockRestore();
		await db.destroy();
		await lix.close();
	}
});

test("unrelated queries wait for the transaction lease and survive its rollback", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	const callbackError = new Error("abort transaction");
	let entered!: () => void;
	const transactionEntered = new Promise<void>((resolve) => {
		entered = resolve;
	});
	let abort!: () => void;
	const mayAbort = new Promise<void>((resolve) => {
		abort = resolve;
	});
	try {
		const transaction = db.transaction().execute(async (trx) => {
			await trx.insertInto("bundle").values({ id: "rolled-back" }).execute();
			entered();
			await mayAbort;
			throw callbackError;
		});
		const rejected = expect(transaction).rejects.toBe(callbackError);
		await transactionEntered;
		// Queue a write outside the transaction before releasing its lease.
		const independent = db
			.insertInto("bundle")
			.values({ id: "independent" })
			.execute();
		abort();
		await rejected;
		await independent;
		expect(await db.selectFrom("bundle").select("id").execute()).toEqual([
			{ id: "independent" },
		]);
	} finally {
		abort?.();
		await db.destroy();
		await lix.close();
	}
});

test("serializes concurrent transactions without rejecting or mixing their writes", async () => {
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	try {
		const results = await Promise.allSettled(
			["first", "second"].map((id) =>
				db.transaction().execute(async (trx) => {
					await trx.insertInto("bundle").values({ id }).execute();
				})
			)
		);
		expect(
			await db.selectFrom("bundle").select("id").orderBy("id").execute()
		).toEqual([{ id: "first" }, { id: "second" }]);
		expect(results.map((result) => result.status)).toEqual([
			"fulfilled",
			"fulfilled",
		]);
	} finally {
		await db.destroy();
		await lix.close();
	}
});

test("releases the connection lease when beginning a transaction fails", async () => {
	const lix = await openLix();
	const db = initDb({ lix });
	const beginError = new Error("cannot begin transaction");
	const beginSpy = vi
		.spyOn(lix, "beginTransaction")
		.mockRejectedValueOnce(beginError);
	try {
		await expect(db.transaction().execute(async () => {})).rejects.toBe(
			beginError
		);
		await db.transaction().execute(async () => {});
	} finally {
		beginSpy.mockRestore();
		await db.destroy();
		await lix.close();
	}
});

test("surfaces a rollback failure and releases the consumed transaction", async () => {
	const lix = await openLix();
	const db = initDb({ lix });
	const rollbackError = new Error("rollback failed");
	const begin = lix.beginTransaction.bind(lix);
	const beginSpy = vi
		.spyOn(lix, "beginTransaction")
		.mockImplementationOnce(async () => {
			const transaction = await begin();
			const rollback = transaction.rollback.bind(transaction);
			vi.spyOn(transaction, "rollback").mockImplementationOnce(async () => {
				await rollback();
				throw rollbackError;
			});
			return transaction;
		});
	try {
		await expect(
			db.transaction().execute(async () => {
				throw new Error("abort");
			})
		).rejects.toBe(rollbackError);
		await db.transaction().execute(async () => {});
	} finally {
		beginSpy.mockRestore();
		await db.destroy();
		await lix.close();
	}
});

test("controlled begin failure releases its lease", async () => {
	const lix = await openLix();
	const db = initDb({ lix });
	const failure = new Error("begin failed");
	const begin = vi
		.spyOn(lix, "beginTransaction")
		.mockRejectedValueOnce(failure);
	try {
		await expect(db.startTransaction().execute()).rejects.toBe(failure);
		const next = await db.startTransaction().execute();
		await next.rollback().execute();
	} finally {
		begin.mockRestore();
		await db.destroy();
		await lix.close();
	}
});

test.each(["commit", "rollback"] as const)(
	"controlled %s failure consumes the connection and releases its lease",
	async (kind) => {
		const lix = await openLix();
		await registerInlangSchemas(lix);
		const db = initDb({ lix });
		const failure = new Error(`${kind} failed`);
		const begin = lix.beginTransaction.bind(lix);
		const beginSpy = vi
			.spyOn(lix, "beginTransaction")
			.mockImplementationOnce(async () => {
				const transaction = await begin();
				const rollback = transaction.rollback.bind(transaction);
				vi.spyOn(transaction, kind).mockImplementationOnce(async () => {
					await rollback();
					throw failure;
				});
				return transaction;
			});
		try {
			const transaction = await db.startTransaction().execute();
			await transaction
				.insertInto("bundle")
				.values({ id: "discarded" })
				.execute();
			await expect(transaction[kind]().execute()).rejects.toBe(failure);
			await expect(
				transaction.insertInto("bundle").values({ id: "escaped" }).execute()
			).rejects.toThrow("connection is closed");
			await db.transaction().execute(async (next) => {
				await next.insertInto("bundle").values({ id: "next" }).execute();
			});
			expect(await db.selectFrom("bundle").select("id").execute()).toEqual([
				{ id: "next" },
			]);
		} finally {
			beginSpy.mockRestore();
			await db.destroy();
			await lix.close();
		}
	}
);

test("cleanup of a failed controlled commit cannot release a later caller's lease", async () => {
	const lix = await openLix();
	const db = initDb({ lix });
	const failure = new Error("commit failed");
	const begin = lix.beginTransaction.bind(lix);
	const beginSpy = vi
		.spyOn(lix, "beginTransaction")
		.mockImplementationOnce(async () => {
			const transaction = await begin();
			vi.spyOn(transaction, "commit").mockImplementationOnce(async () => {
				await transaction.rollback();
				throw failure;
			});
			return transaction;
		});
	try {
		const first = await db.startTransaction().execute();
		await expect(first.commit().execute()).rejects.toBe(failure);
		const second = await db.startTransaction().execute();
		const third = db.startTransaction().execute();
		await first.rollback().execute();
		// Drain the event loop while the second caller still owns the lease.
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(beginSpy).toHaveBeenCalledTimes(2);
		await second.rollback().execute();
		await (await third).rollback().execute();
		expect(beginSpy).toHaveBeenCalledTimes(3);
	} finally {
		beginSpy.mockRestore();
		await db.destroy();
		await lix.close();
	}
});
