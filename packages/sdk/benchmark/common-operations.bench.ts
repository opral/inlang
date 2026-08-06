import { afterAll, beforeAll, bench } from "vitest";
import { CamelCasePlugin, Kysely } from "kysely";
import { openLix, type Lix, type LixBatchStatement } from "@lix-js/sdk";
import {
	createDialect,
	createInMemoryDatabase,
	type SqliteWasmDatabase,
} from "sqlite-wasm-kysely";
import { v7 } from "uuid";
import {
	applySchema,
	type InlangDatabaseSchema,
} from "../src/database/schema.js";
import { JsonbPlugin } from "../src/database/jsonbPlugin.js";
import { initDb } from "../src/database/initDb.js";
import { registerInlangSchemas } from "../src/database/registerSchemas.js";
import { selectBundleNested } from "../src/query-utilities/selectBundleNested.js";
import { insertBundleNested } from "../src/query-utilities/insertBundleNested.js";
import { projectToBlob } from "../src/project/snapshot.js";
import { loadProjectInMemory } from "../src/project/loadProjectInMemory.js";
import { humanId } from "../src/human-id/human-id.js";

const BUNDLE_COUNT = 500;
const LOCALES = ["en", "de"] as const;

let lix: Lix;
let lixDb: Kysely<InlangDatabaseSchema>;
let sqlite: SqliteWasmDatabase;
let sqliteDb: Kysely<InlangDatabaseSchema>;
let populatedBlob: Blob;
let mutationCounter = 0;

beforeAll(async () => {
	lix = await openLix();
	await registerInlangSchemas(lix);
	lixDb = initDb({ lix });
	await seedLix(lix);

	sqlite = await createInMemoryDatabase({ readOnly: false });
	sqlite.createFunction({ name: "uuid_v7", arity: 0, xFunc: () => v7() });
	sqlite.createFunction({ name: "human_id", arity: 0, xFunc: () => humanId() });
	applySchema({ sqlite });
	sqliteDb = new Kysely({
		dialect: createDialect({ database: sqlite }),
		plugins: [new CamelCasePlugin(), new JsonbPlugin({ database: sqlite })],
	});
	await seedKysely(sqliteDb);

	await lix.executeBatch([
		{
			sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
			params: ["/project_id", new TextEncoder().encode("benchmark-project")],
		},
		{
			sql: "INSERT INTO lix_file (path, content) VALUES ($1, $2)",
			params: [
				"/settings.json",
				new TextEncoder().encode(
					JSON.stringify({
						baseLocale: "en",
						locales: [...LOCALES],
						modules: [],
					})
				),
			],
		},
	]);
	populatedBlob = await projectToBlob(lix);
}, 120_000);

afterAll(async () => {
	await lixDb.destroy();
	await lix.close();
	await sqliteDb.destroy();
	sqlite.close();
});

bench(
	"paraglide: select 500 bundles / 1,000 messages nested — Lix 0.10 memory",
	async () => {
		await selectBundleNested(lixDb).execute();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"paraglide: select 500 bundles / 1,000 messages nested — SQLite WASM baseline",
	async () => {
		await selectBundleNested(sqliteDb).execute();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: select one nested bundle — Lix 0.10 memory",
	async () => {
		await selectBundleNested(lixDb)
			.where("bundle.id", "=", "bundle-250")
			.executeTakeFirst();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: select one nested bundle — SQLite WASM baseline",
	async () => {
		await selectBundleNested(sqliteDb)
			.where("bundle.id", "=", "bundle-250")
			.executeTakeFirst();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: update one variant pattern — Lix 0.10 memory",
	async () => {
		mutationCounter++;
		await lixDb
			.updateTable("variant")
			.set({ pattern: [{ type: "text", value: `edited-${mutationCounter}` }] })
			.where("id", "=", "variant-250-en")
			.execute();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: update one variant pattern — SQLite WASM baseline",
	async () => {
		mutationCounter++;
		await sqliteDb
			.updateTable("variant")
			.set({ pattern: [{ type: "text", value: `edited-${mutationCounter}` }] })
			.where("id", "=", "variant-250-en")
			.execute();
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: insert bundle with two translations — Lix 0.10 memory",
	async () => {
		mutationCounter++;
		await insertBundleNested(lixDb, nestedBundle(`lix-new-${mutationCounter}`));
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"sherlock: insert bundle with two translations — SQLite WASM baseline",
	async () => {
		mutationCounter++;
		await insertBundleNested(
			sqliteDb,
			nestedBundle(`sqlite-new-${mutationCounter}`)
		);
	},
	{ time: 1_500, warmupTime: 300 }
);

bench(
	"paraglide/sherlock: load populated in-memory project — Lix 0.10 memory",
	async () => {
		const project = await loadProjectInMemory({ blob: populatedBlob });
		await project.close();
	},
	{ time: 2_000, warmupTime: 300 }
);

async function seedLix(target: Lix) {
	const statements: LixBatchStatement[] = [];
	for (let index = 0; index < BUNDLE_COUNT; index++) {
		const bundleId = `bundle-${index}`;
		statements.push({
			sql: "INSERT INTO bundle (id, declarations) VALUES ($1, $2)",
			params: [bundleId, []],
		});
		for (const locale of LOCALES) {
			const messageId = `message-${index}-${locale}`;
			statements.push({
				sql: 'INSERT INTO message (id, "bundleId", locale, selectors) VALUES ($1, $2, $3, $4)',
				params: [messageId, bundleId, locale, []],
			});
			statements.push({
				sql: 'INSERT INTO variant (id, "messageId", matches, pattern) VALUES ($1, $2, $3, $4)',
				params: [
					`variant-${index}-${locale}`,
					messageId,
					[],
					[{ type: "text", value: `Message ${index} (${locale})` }],
				],
			});
		}
	}
	await target.executeBatch(statements);
}

async function seedKysely(db: Kysely<InlangDatabaseSchema>) {
	for (let index = 0; index < BUNDLE_COUNT; index++) {
		await insertBundleNested(db, nestedBundle(`bundle-${index}`, index));
	}
}

function nestedBundle(id: string, index = mutationCounter) {
	return {
		id,
		declarations: [],
		messages: LOCALES.map((locale) => {
			const messageId = id.startsWith("bundle-")
				? `message-${index}-${locale}`
				: `${id}-message-${locale}`;
			return {
				id: messageId,
				bundleId: id,
				locale,
				selectors: [],
				variants: [
					{
						id: id.startsWith("bundle-")
							? `variant-${index}-${locale}`
							: `${id}-variant-${locale}`,
						messageId,
						matches: [],
						pattern: [
							{ type: "text" as const, value: `Message ${index} (${locale})` },
						],
					},
				],
			};
		}),
	};
}
