import type { CompiledQuery, Kysely } from "kysely";
import type { ExecuteResult, Lix, LixBatchStatement } from "@lix-js/sdk";
import type { InlangDatabaseSchema } from "./schema.js";
import { compileLixQuery } from "./lixDialect.js";

type BatchExecutor = (
	queries: readonly CompiledQuery[]
) => Promise<readonly ExecuteResult[]>;

const batchExecutors = new WeakMap<object, BatchExecutor>();

/**
 * Installs the one atomic batch boundary owned by an Lix-backed database.
 * The executor is deliberately not exposed as a second query dialect: callers
 * provide ordinary Kysely compiled queries and Lix remains responsible for
 * normalization, execution, and atomic publication.
 */
export function attachLixBatchExecutor(
	db: Kysely<InlangDatabaseSchema>,
	lix: Lix
): void {
	batchExecutors.set(db, async (queries) => {
		const statements: LixBatchStatement[] = queries.map(compileLixQuery);
		return lix.executeBatch(statements);
	});
}

/**
 * Executes already-compiled Kysely statements as one authenticated Lix batch.
 * A database without the Lix batch capability is rejected explicitly; there
 * is no sequential or compatibility route hidden behind this API.
 */
export async function executeLixBatch(
	db: Kysely<InlangDatabaseSchema>,
	queries: readonly CompiledQuery[]
): Promise<readonly ExecuteResult[]> {
	if (queries.length === 0) {
		throw new Error("executeLixBatch requires at least one query");
	}
	const execute = batchExecutors.get(db);
	if (!execute) {
		throw new Error("The database is not an Lix-backed batch database");
	}
	return execute(queries);
}
