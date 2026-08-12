import {
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type CompiledQuery,
	type DatabaseConnection,
	type Dialect,
	type Driver,
	type Kysely,
	type QueryResult,
} from "kysely";
import type {
	Lix,
	LixBatchStatement,
	LixTransaction,
	SqlParam,
} from "@lix-js/sdk";

/** Kysely bridge for Lix's DataFusion SQL interface. */
export class LixDialect implements Dialect {
	readonly #driver: LixDriver;

	constructor(lix: Lix) {
		this.#driver = new LixDriver(lix);
	}

	createDriver(): Driver {
		return this.#driver;
	}

	createQueryCompiler() {
		return new PostgresQueryCompiler();
	}

	createAdapter() {
		return new PostgresAdapter();
	}

	createIntrospector(db: Kysely<unknown>) {
		return new PostgresIntrospector(db);
	}
}

class LixDriver implements Driver {
	readonly #connection: LixConnection;

	constructor(lix: Lix) {
		this.#connection = new LixConnection(lix);
	}

	async init(): Promise<void> {}

	async acquireConnection(): Promise<DatabaseConnection> {
		return this.#connection;
	}

	async beginTransaction(connection: DatabaseConnection): Promise<void> {
		await (connection as LixConnection).beginTransaction();
	}

	async commitTransaction(connection: DatabaseConnection): Promise<void> {
		await (connection as LixConnection).commitTransaction();
	}

	async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
		await (connection as LixConnection).rollbackTransaction();
	}

	async releaseConnection(): Promise<void> {}
	async destroy(): Promise<void> {
		await this.#connection.destroy();
	}
}

class LixConnection implements DatabaseConnection {
	readonly #lix: Lix;
	readonly #preparedQueries = new Map<string, PreparedLixQuery>();
	#transaction: LixTransaction | undefined;

	constructor(lix: Lix) {
		this.#lix = lix;
	}

	async beginTransaction(): Promise<void> {
		if (this.#transaction)
			throw new Error("A Lix transaction is already active");
		this.#transaction = await this.#lix.beginTransaction();
	}

	async destroy(): Promise<void> {
		this.#preparedQueries.clear();
	}

	async commitTransaction(): Promise<void> {
		const transaction = this.#transaction;
		if (!transaction) throw new Error("No Lix transaction is active");
		this.#transaction = undefined;
		await transaction.commit();
	}

	async rollbackTransaction(): Promise<void> {
		const transaction = this.#transaction;
		if (!transaction) throw new Error("No Lix transaction is active");
		this.#transaction = undefined;
		await transaction.rollback();
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const executor = this.#transaction ?? this.#lix;
		let prepared = this.#preparedQueries.get(compiledQuery.sql);
		if (!prepared) {
			prepared = prepareLixQuery(compiledQuery.sql);
			this.#preparedQueries.set(compiledQuery.sql, prepared);
		}
		const parameters = prepared.parameterPositions.map(
			(position) => compiledQuery.parameters[position - 1]
		);
		const result = await executor.execute(
			prepared.sql,
			parameters as SqlParam[]
		);
		return {
			rows: result.rows.map((row) => publicRow(row.toObject())) as R[],
			numAffectedRows: BigInt(result.rowsAffected),
		};
	}

	async *streamQuery<R>(compiledQuery: CompiledQuery) {
		yield await this.executeQuery<R>(compiledQuery);
	}
}

type PreparedLixQuery = {
	sql: string;
	parameterPositions: number[];
};

/** Convert Kysely's compiled query to the one Lix SQL/parameter contract. */
export function compileLixQuery(
	compiledQuery: CompiledQuery
): LixBatchStatement {
	const prepared = prepareLixQuery(compiledQuery.sql);
	const parameters = prepared.parameterPositions.map(
		(position) => compiledQuery.parameters[position - 1]
	);
	return {
		sql: prepared.sql,
		params: parameters as SqlParam[],
	};
}

function prepareLixQuery(compiledSql: string): {
	sql: string;
	parameterPositions: number[];
} {
	const sql = rewriteTableNames(omitPrimaryKeyAssignments(compiledSql));
	const compacted = compactSqlParameters(sql);
	return {
		sql: compacted.sql,
		parameterPositions: compacted.positions,
	};
}

function rewriteTableNames(sql: string): string {
	return sql
		.replaceAll('"file"', '"lix_file"')
		.replaceAll('"bundle"', '"inlang_bundle"')
		.replaceAll('"message"', '"inlang_message"')
		.replaceAll('"variant"', '"inlang_variant"')
		.replaceAll('"key_value"', '"inlang_key_value"')
		.replaceAll('"active_account"', '"inlang_active_account"');
}

function omitPrimaryKeyAssignments(sql: string): string {
	const conflictMarker = " do update set ";
	const conflictIndex = sql.toLowerCase().indexOf(conflictMarker);
	if (conflictIndex !== -1) {
		const prefix = sql.slice(0, conflictIndex);
		const assignments = sql
			.slice(conflictIndex + conflictMarker.length)
			.split(", ")
			.filter((assignment) => !/^"id"\s*=/i.test(assignment));
		sql =
			assignments.length === 0
				? `${prefix} do nothing`
				: `${prefix}${conflictMarker}${assignments.join(", ")}`;
	}
	if (/^update\s+"(?:bundle|message|variant)"\s+set\s+/i.test(sql)) {
		const whereIndex = sql.search(/\s+where\s+/i);
		const head = whereIndex === -1 ? sql : sql.slice(0, whereIndex);
		const tail = whereIndex === -1 ? "" : sql.slice(whereIndex);
		const setIndex = head.toLowerCase().indexOf(" set ");
		const assignments = head
			.slice(setIndex + 5)
			.split(", ")
			.filter((assignment) => !/^"id"\s*=/i.test(assignment));
		return `${head.slice(0, setIndex)} set ${assignments.join(", ")}${tail}`;
	}
	return sql;
}

function publicRow(row: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(row).filter(([column]) => !column.startsWith("lixcol_"))
	);
}

function compactSqlParameters(sql: string): {
	sql: string;
	positions: number[];
} {
	const positions: number[] = [];
	for (const match of sql.matchAll(/\$(\d+)/g)) {
		const position = Number(match[1]);
		if (!positions.includes(position)) positions.push(position);
	}
	const remapped = new Map(
		positions.map((position, index) => [position, index + 1])
	);
	return {
		sql: sql.replace(/\$(\d+)/g, (_, position: string) => {
			return `$${remapped.get(Number(position))}`;
		}),
		positions,
	};
}
