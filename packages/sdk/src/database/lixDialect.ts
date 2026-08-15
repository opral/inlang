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
			const nextPrepared = prepareLixQuery(compiledQuery.sql);
			prepared = nextPrepared;
			this.#preparedQueries.set(compiledQuery.sql, prepared);
		}
		const parameters = prepared.parameterPositions.map(
			(position) => compiledQuery.parameters[position - 1]
		);
		encodeIdentityParameters(parameters, prepared.identityParameterPositions);
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
	identityParameterPositions: number[];
};

/** Convert Kysely's compiled query to the one Lix SQL/parameter contract. */
export function compileLixQuery(
	compiledQuery: CompiledQuery
): LixBatchStatement {
	const prepared = prepareLixQuery(compiledQuery.sql);
	const parameters = prepared.parameterPositions.map(
		(position) => compiledQuery.parameters[position - 1]
	);
	encodeIdentityParameters(parameters, prepared.identityParameterPositions);
	return {
		sql: prepared.sql,
		params: parameters as SqlParam[],
	};
}

function prepareLixQuery(compiledSql: string): PreparedLixQuery {
	const sql = ensureGeneratedPrimaryKey(
		rewriteTableNames(omitPrimaryKeyAssignments(compiledSql))
	);
	const compacted = compactSqlParameters(sql);
	return {
		sql: compacted.sql,
		parameterPositions: compacted.positions,
		identityParameterPositions: findIdentityParameterPositions(compacted.sql),
	};
}

function ensureGeneratedPrimaryKey(sql: string): string {
	const tables = "(?:inlang_bundle|inlang_message|inlang_variant)";
	const insertWithColumns = new RegExp(
		`^(insert\\s+into\\s+"${tables}"\\s*)\\(([^)]*)\\)(\\s+values\\s+)(.*)$`,
		"i"
	);
	const withColumns = sql.match(insertWithColumns);
	if (withColumns && !/(?:^|,)\s*"id"\s*(?:,|$)/i.test(withColumns[2] ?? "")) {
		const valuesAndTail = withColumns[4] ?? "";
		const tailStart = valuesAndTail.search(/\s+(?:on\s+conflict|returning)\b/i);
		const values =
			tailStart === -1 ? valuesAndTail : valuesAndTail.slice(0, tailStart);
		const tail = tailStart === -1 ? "" : valuesAndTail.slice(tailStart);
		const generatedValues = values.replace(
			/\(([^()]*)\)/g,
			(_, row: string) => {
				return `(CAST(uuidv7() AS TEXT), ${row})`;
			}
		);
		return `${withColumns[1]}("id", ${withColumns[2]})${withColumns[3]}${generatedValues}${tail}`;
	}

	const insertDefaultValues = new RegExp(
		`^(insert\\s+into\\s+"${tables}"\\s*)default\\s+values(.*)$`,
		"i"
	);
	const defaultValues = sql.match(insertDefaultValues);
	if (defaultValues) {
		return `${defaultValues[1]}("id") VALUES (CAST(uuidv7() AS TEXT))${defaultValues[2]}`;
	}
	return sql;
}

function rewriteTableNames(sql: string): string {
	return sql
		.replaceAll('"file"', '"lix_file"')
		.replaceAll('"bundle"', '"inlang_bundle"')
		.replaceAll('"message"', '"inlang_message"')
		.replaceAll('"variant"', '"inlang_variant"')
		.replaceAll('"bundleId"', '"bundle_id"')
		.replaceAll('"messageId"', '"message_id"');
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
		Object.entries(row)
			.filter(([column]) => !column.startsWith("lixcol_"))
			.map(([column, value]) => [
				column === "bundle_id"
					? "bundleId"
					: column === "message_id"
						? "messageId"
						: column,
				isIdentityColumn(column) && typeof value === "string"
					? decodeIdentity(value)
					: value,
			])
	);
}

function isIdentityColumn(column: string): boolean {
	return column === "id" || column === "bundle_id" || column === "message_id";
}

const encodedIdentityPrefix = "lixid1:";

function encodeIdentity(value: string): string {
	if (!value.includes("\0") && !value.startsWith(encodedIdentityPrefix)) {
		return value;
	}
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `${encodedIdentityPrefix}${btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "")}`;
}

function decodeIdentity(value: string): string {
	if (!value.startsWith(encodedIdentityPrefix)) return value;
	try {
		const encoded = value
			.slice(encodedIdentityPrefix.length)
			.replaceAll("-", "+")
			.replaceAll("_", "/");
		const binary = atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4));
		return new TextDecoder().decode(
			Uint8Array.from(binary, (character) => character.charCodeAt(0))
		);
	} catch {
		return value;
	}
}

function encodeIdentityParameters(
	parameters: unknown[],
	positions: number[]
): void {
	for (const position of positions) {
		const value = parameters[position - 1];
		if (typeof value === "string")
			parameters[position - 1] = encodeIdentity(value);
	}
}

function findIdentityParameterPositions(sql: string): number[] {
	const positions = new Set<number>();
	const identityColumns = "(?:id|bundle_id|message_id)";
	for (const match of sql.matchAll(
		new RegExp(`"${identityColumns}"\\s*=\\s*\\$(\\d+)`, "gi")
	)) {
		positions.add(Number(match[1]));
	}
	for (const match of sql.matchAll(
		new RegExp(`"${identityColumns}"\\s+in\\s*\\(([^)]*)\\)`, "gi")
	)) {
		for (const parameter of match[1]?.matchAll(/\$(\d+)/g) ?? []) {
			positions.add(Number(parameter[1]));
		}
	}
	const insert = sql.match(
		/insert\s+into\s+"(?:inlang_bundle|inlang_message|inlang_variant)"\s*\(([^)]*)\)\s+values\s+([\s\S]*)/i
	);
	if (insert) {
		const columns = [...(insert[1] ?? "").matchAll(/"([^"]+)"/g)]
			.map((match) => match[1])
			.filter((column): column is string => column !== undefined);
		const identityIndexes = columns.flatMap((column, index) =>
			isIdentityColumn(column) ? [index] : []
		);
		for (const row of (insert[2] ?? "").matchAll(/\(([^()]*)\)/g)) {
			const values = [...(row[1] ?? "").matchAll(/\$(\d+)/g)].map((match) =>
				Number(match[1])
			);
			for (const index of identityIndexes) {
				const position = values[index];
				if (position !== undefined) positions.add(position);
			}
		}
	}
	return [...positions].sort((left, right) => left - right);
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
