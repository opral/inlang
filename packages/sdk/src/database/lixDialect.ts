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
	readonly #lix: Lix;
	readonly #preparedQueries = new Map<string, PreparedLixQuery>();
	#lease: Promise<void> = Promise.resolve();

	constructor(lix: Lix) {
		this.#lix = lix;
	}

	async init(): Promise<void> {}

	async acquireConnection(): Promise<DatabaseConnection> {
		// Every caller owns its own lease. Terminal failures can release it even
		// when Kysely's controlled API skips cleanup; later cleanup is idempotent.
		const previousLease = this.#lease;
		let release!: () => void;
		this.#lease = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previousLease;
		return new LixConnection(this.#lix, this.#preparedQueries, release);
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

	async releaseConnection(connection: DatabaseConnection): Promise<void> {
		(connection as LixConnection).release();
	}

	async destroy(): Promise<void> {
		this.#preparedQueries.clear();
	}
}

type TransactionState =
	| { kind: "idle" | "starting" | "finishing" | "commit-failed" | "closed" }
	| { kind: "active"; transaction: LixTransaction };

class LixConnection implements DatabaseConnection {
	#state: TransactionState = { kind: "idle" };
	#released = false;

	constructor(
		private readonly lix: Lix,
		private readonly preparedQueries: Map<string, PreparedLixQuery>,
		readonly releaseLease: () => void
	) {}

	release(): void {
		if (this.#released) return;
		this.#released = true;
		this.releaseLease();
	}

	async beginTransaction(): Promise<void> {
		if (this.#released || this.#state.kind !== "idle")
			throw new Error("The Lix connection cannot begin a transaction");
		this.#state = { kind: "starting" };
		try {
			this.#state = {
				kind: "active",
				transaction: await this.lix.beginTransaction(),
			};
		} catch (error) {
			this.#state = { kind: "closed" };
			this.release();
			throw error;
		}
	}

	async commitTransaction(): Promise<void> {
		if (this.#state.kind !== "active")
			throw new Error("No Lix transaction is active");
		const { transaction } = this.#state;
		this.#state = { kind: "finishing" };
		try {
			await transaction.commit();
			this.#state = { kind: "closed" };
		} catch (error) {
			// Lix consumes failed commits. Kysely's subsequent rollback only
			// acknowledges cleanup, preserving the original commit error.
			this.#state = { kind: "commit-failed" };
			throw error;
		} finally {
			this.release();
		}
	}

	async rollbackTransaction(): Promise<void> {
		if (this.#state.kind === "commit-failed") {
			this.#state = { kind: "closed" };
			return;
		}
		if (this.#state.kind !== "active")
			throw new Error("No Lix transaction is active");
		const { transaction } = this.#state;
		this.#state = { kind: "finishing" };
		try {
			await transaction.rollback();
		} finally {
			this.#state = { kind: "closed" };
			this.release();
		}
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		if (
			this.#released ||
			(this.#state.kind !== "idle" && this.#state.kind !== "active")
		)
			throw new Error(
				"The Lix connection is closed or completing a transaction"
			);
		const executor =
			this.#state.kind === "active" ? this.#state.transaction : this.lix;
		let prepared = this.preparedQueries.get(compiledQuery.sql);
		if (!prepared) {
			const nextPrepared = prepareLixQuery(compiledQuery.sql);
			prepared = nextPrepared;
			this.preparedQueries.set(compiledQuery.sql, prepared);
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
			rows: result.rows.map((row) => publicRow(row)) as R[],
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
				(isIdentityColumn(column) ||
					column === "messageLocale" ||
					column === "variantId") &&
				typeof value === "string"
					? decodeIdentity(value)
					: value,
			])
	);
}

function isIdentityColumn(column: string): boolean {
	return (
		column === "id" ||
		column === "bundle_id" ||
		column === "message_id" ||
		column === "locale"
	);
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
	const identityColumns = "(?:id|bundle_id|message_id|locale)";
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
