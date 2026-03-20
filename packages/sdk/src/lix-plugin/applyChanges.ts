// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import {
	getLeafChange,
	type Change,
	type LixPlugin,
	type LixReadonly,
} from "@lix-js/sdk";
import { contentFromDatabase, loadDatabaseInMemory } from "sqlite-wasm-kysely";
import { initDb } from "../database/initDb.js";
import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";

export const applyChanges: NonNullable<LixPlugin["applyChanges"]> = async ({
	lix,
	file,
	changes,
}) => {
	if (file.path?.endsWith("db.sqlite") === false) {
		throw new Error(
			"Unimplemented. Only the db.sqlite file can be handled for now."
		);
	}

	// todo make transactional

	const sqlite = await loadDatabaseInMemory(file.data);
	const db = initDb({ sqlite });

	// the award for the most inefficient deduplication goes to...
	const leafChanges = [
		...new Set(
			await Promise.all(
				changes.map(async (change) => {
					const leafChange = await getLeafChange({ change, lix });
					// enable string comparison to avoid duplicates
					return JSON.stringify(leafChange);
				})
			)
		),
	].map((v) => JSON.parse(v));

	// changes need to be applied in order of foreign keys to avoid constraint violations
	// 1. bundles
	// 2. messages
	// 3. variants
	const applyOrder: Record<string, number> = {
		bundle: 1,
		message: 2,
		variant: 3,
	};

	// future optimization potential here but sorting in one go
	const orderedLeafChanges = [...leafChanges].sort((a, b) => {
		const orderA = applyOrder[a.type];
		const orderB = applyOrder[b.type];

		if (orderA === undefined || orderB === undefined) {
			throw new Error(
				`Received an unknown entity type: ${a.type} && ${
					b.type
				}. Expected one of: ${Object.keys(applyOrder)}`
			);
		}

		return orderA - orderB;
	});
	for (const leafChange of orderedLeafChanges) {
		// deletion
		if (leafChange.value === undefined) {
			await db
				.deleteFrom(leafChange.type as "bundle" | "message" | "variant")
				.where("id", "=", leafChange.meta?.id)
				.execute();
			continue;
		}

		// upsert the value
		const value = leafChange.value as any;

		try {
			await db
				.insertInto(leafChange.type as "bundle" | "message" | "variant")
				.values(value)
				.onConflict((c) => c.column("id").doUpdateSet(value))
				.execute();
		} catch (e) {
			// 787 = SQLITE_CONSTRAINT_FOREIGNKEY
			if (e instanceof Error && (e as any)?.resultCode === 787) {
				await handleForeignKeyViolation({ change: leafChange, lix, db });
			} else {
				throw e;
			}
		}
	}
	return { fileData: contentFromDatabase(sqlite) };
};

/**
 * Handles foreign key violations e.g. a change
 * doesn't exist in the target database but is referenced
 * by an entity.
 */
async function handleForeignKeyViolation(args: {
	change: Change;
	lix: LixReadonly;
	db: Kysely<InlangDatabaseSchema>;
}) {
	const lastKnown = async (
		type: "bundle" | "message" | "variant",
		id: string
	) =>
		await args.lix.db
			.selectFrom("change")
			.selectAll()
			// heuristic that getting the last bundle value is fine
			// and using created_at is fine too. if the change is undesired
			// , a user can revert it with lix change control
			.orderBy("created_at", "desc")
			.where("type", "=", type)
			.where((eb) => eb.ref("value", "->>").key("id"), "=", id)
			.where("operation", "in", ["create", "update"])
			// TODO shouldn't throw. The API needs to be able to
			// report issues back to the app without throwing and potentially failing
			// to apply 1000 changes because 1 change is invalid
			// same requirement as in inlang, see https://github.com/opral/inlang/issues/213
			.executeTakeFirstOrThrow();

	if (args.change.type === "message") {
		const lastKnownBundle = await lastKnown(
			"bundle",
			args.change.value?.bundleId
		);
		await args.db
			.insertInto("bundle")
			.values(lastKnownBundle.value as any)
			.execute();
	} else if (args.change.type === "variant") {
		const lastKnownMessage = await lastKnown(
			"message",
			args.change.value?.messageId
		);
		// getting the bundle too out of precaution
		const lastKnownBundle = await lastKnown(
			"bundle",
			lastKnownMessage.value?.bundleId
		);
		await args.db
			.insertInto("bundle")
			.values(lastKnownBundle.value as any)
			// the bundle exists, so we can ignore the conflict
			.onConflict((c) => c.doNothing())
			.execute();
		await args.db
			.insertInto("message")
			.values(lastKnownMessage.value as any)
			.execute();
		await args.db
			.insertInto(args.change.type as "bundle" | "message" | "variant")
			.values(args.change.value as any)
			.onConflict((c) => c.column("id").doUpdateSet(args.change.value as any))
			.execute();
	}
	// re-execute applying the change
	await args.db
		.insertInto(args.change.type as "bundle" | "message" | "variant")
		.values(args.change.value as any)
		.onConflict((c) => c.column("id").doUpdateSet(args.change.value as any))
		.execute();
}
