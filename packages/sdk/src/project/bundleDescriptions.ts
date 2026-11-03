import type { InlangProject, ExportFile } from "./api.js";
import type { BundleNested, InlangDatabaseSchema } from "../database/schema.js";
import { sql, type Kysely } from "kysely";

export const DESCRIPTION_FILE = "descriptions.json";
export const DESCRIPTION_PATH = `/${DESCRIPTION_FILE}`;
export const DESCRIPTION_CAPABILITIES = ["bundle-description"] as const;

/** Versioned SDK metadata, separate from runtime translation catalogs. */
export function parseBundleDescriptions(
	content: Uint8Array
): Map<string, string> {
	const value: unknown = JSON.parse(new TextDecoder().decode(content));
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		!("version" in value) ||
		value.version !== 1 ||
		!("descriptions" in value) ||
		!value.descriptions ||
		typeof value.descriptions !== "object" ||
		Array.isArray(value.descriptions)
	) {
		throw new Error(
			"descriptions.json must contain version: 1 and a descriptions object"
		);
	}
	const result = new Map<string, string>();
	for (const [id, description] of Object.entries(value.descriptions)) {
		if (typeof description !== "string")
			throw new Error(`Invalid description for bundle ${JSON.stringify(id)}`);
		if (description.trim()) result.set(id, description);
	}
	return result;
}

export function encodeBundleDescriptions(
	descriptions: ReadonlyMap<string, string>
): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify(
			{
				version: 1,
				descriptions: Object.fromEntries(
					[...descriptions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				),
			},
			null,
			2
		) + "\n"
	);
}

export async function readBundleDescriptions(
	project: Pick<InlangProject, "lix">
): Promise<Map<string, string>> {
	const row = await project.lix.queryOne<{ content: Uint8Array }>(
		"SELECT content FROM lix_file WHERE path = $1",
		[DESCRIPTION_PATH]
	);
	return row ? parseBundleDescriptions(row.content) : new Map();
}

/** Companion metadata can retain an empty bundle without inventing messages. */
export async function applyBundleDescriptions(
	project: Pick<InlangProject, "db">,
	descriptions: ReadonlyMap<string, string>,
	previous: ReadonlyMap<string, string> = new Map(),
	options: { transaction?: boolean; content?: Uint8Array } = {}
): Promise<void> {
	const apply = async (trx: Kysely<InlangDatabaseSchema>) => {
		for (const id of previous.keys()) {
			if (!descriptions.has(id)) {
				const bundle = await trx
					.selectFrom("inlang_bundle")
					.select("description")
					.where("id", "=", id)
					.executeTakeFirst();
				if (bundle?.description && bundle.description !== previous.get(id)) {
					throw new Error(
						`Conflicting native and companion descriptions for bundle ${JSON.stringify(id)} (descriptions.json)`
					);
				}
				await trx
					.updateTable("inlang_bundle")
					.set({ description: null })
					.where("id", "=", id)
					.execute();
			}
		}
		for (const [id, description] of descriptions) {
			const bundle = await trx
				.selectFrom("inlang_bundle")
				.select(["id", "description"])
				.where("id", "=", id)
				.executeTakeFirst();
			if (!bundle) {
				await trx
					.insertInto("inlang_bundle")
					.values({ id, description })
					.execute();
				continue;
			}
			if (
				bundle.description &&
				bundle.description !== description &&
				bundle.description !== previous.get(id)
			) {
				throw new Error(
					`Conflicting native and companion descriptions for bundle ${JSON.stringify(id)} (descriptions.json)`
				);
			}
			await trx
				.updateTable("inlang_bundle")
				.set({ description })
				.where("id", "=", id)
				.execute();
		}
		if (options.content) {
			await sql`INSERT INTO lix_file (path, content) VALUES (${DESCRIPTION_PATH}, ${options.content}) ON CONFLICT (path) DO UPDATE SET content = excluded.content`.execute(
				trx
			);
		}
	};
	if (options.transaction === false) await apply(project.db);
	else await project.db.transaction().execute(apply);
}

/** Used by the read-only compiler loader as well as database-backed projects. */
export function mergeBundleDescriptions(
	bundles: BundleNested[],
	descriptions: ReadonlyMap<string, string>
): BundleNested[] {
	for (const bundle of bundles) {
		const description = descriptions.get(bundle.id);
		if (description === undefined) continue;
		if (bundle.description && bundle.description !== description)
			throw new Error(
				`Conflicting native and companion descriptions for bundle ${JSON.stringify(bundle.id)} (descriptions.json)`
			);
		bundle.description = description;
	}
	const known = new Set(bundles.map((bundle) => bundle.id));
	for (const [id, description] of descriptions) {
		if (!known.has(id))
			bundles.push({ id, description, declarations: [], messages: [] });
	}
	return bundles;
}

/** Sync the fallback representation before directory/portable exports. */
export async function syncBundleDescriptions(
	project: Pick<InlangProject, "db" | "lix" | "settings" | "plugins">,
	options: { pluginKey?: string; persist?: boolean } = {}
): Promise<ExportFile | undefined> {
	const settings = await project.settings.get();
	const native = (await project.plugins.get()).some(
		(plugin) =>
			(!options.pluginKey || plugin.key === options.pluginKey) &&
			plugin.exportFiles &&
			plugin.supportsBundleDescriptions
	);
	const sourceIds = new Set<string>();
	if (native) {
		for await (const row of project.db
			.selectFrom("inlang_message")
			.select("bundle_id")
			.where("locale", "=", settings.baseLocale)
			.stream())
			sourceIds.add(row.bundle_id);
	}
	const descriptions = new Map<string, string>();
	for await (const bundle of project.db
		.selectFrom("inlang_bundle")
		.select(["id", "description"])
		.stream()) {
		if (bundle.description?.trim() && (!native || !sourceIds.has(bundle.id)))
			descriptions.set(bundle.id, bundle.description);
	}
	const existing = await project.lix.queryOne(
		"SELECT path FROM lix_file WHERE path = $1",
		[DESCRIPTION_PATH]
	);
	if (descriptions.size === 0 && !existing) return undefined;
	const content = encodeBundleDescriptions(descriptions);
	if (options.persist !== false) {
		await project.lix.execute(
			"INSERT INTO lix_file (path, content) VALUES ($1, $2) ON CONFLICT (path) DO UPDATE SET content = excluded.content",
			[DESCRIPTION_PATH, content]
		);
	}
	return {
		name: DESCRIPTION_FILE,
		locale: "",
		content,
		verbatim: true,
		metadata: { inlangDescriptions: true },
	};
}
