import type { Kysely } from "kysely";
import { applyBundleDescriptions } from "../project/bundleDescriptions.js";
import {
	PluginDoesNotImplementFunctionError,
	PluginMissingError,
} from "../plugin/errors.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type {
	InlangDatabaseSchema,
	NewBundleRow,
	NewMessageRow,
	NewVariantRow,
} from "../database/schema.js";
import {
	messageFromPlugin,
	variantFromPlugin,
	type ImportedVariant,
} from "./pluginRows.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { ImportFile } from "../project/api.js";
import { v7 } from "uuid";
import {
	findExistingVariant,
	orderVariantsLikeImport,
	variantMatchesKey,
} from "./variantMatches.js";

const messageReferenceKey = (bundleId: string, locale: string) =>
	JSON.stringify(["reference", bundleId, locale]);

const INSERT_BATCH_SIZE = 500;

/**
 * Target number of bundle, message and variant rows written by one commit of a fresh
 * project import. Lix validates and indexes every staged row when the
 * transaction commits, and its worker treats a commit that runs past its
 * operation deadline as lost. Projects with hundreds of thousands of
 * translations therefore commit in bundle-aligned groups below this size;
 * smaller projects still import in a single transaction.
 */
export const IMPORT_ROWS_PER_COMMIT = 100_000;

type FreshImportCommit = {
	bundles: NewBundleRow[];
	messages: (NewMessageRow & { id: string })[];
	variants: NewVariantRow[];
};

/**
 * Splits a fresh import into groups of whole bundles, so every group
 * satisfies its own foreign keys (variants → messages → bundles).
 */
function groupFreshImportCommits(
	bundles: readonly NewBundleRow[],
	messages: readonly (NewMessageRow & { id: string })[],
	variants: readonly NewVariantRow[],
	rowsPerCommit: number
): FreshImportCommit[] {
	const messagesByBundle = new Map<
		string,
		(NewMessageRow & { id: string })[]
	>();
	for (const message of messages) {
		const list = messagesByBundle.get(message.bundle_id);
		if (list) list.push(message);
		else messagesByBundle.set(message.bundle_id, [message]);
	}
	const variantsByMessage = new Map<string, NewVariantRow[]>();
	for (const variant of variants) {
		const list = variantsByMessage.get(variant.message_id);
		if (list) list.push(variant);
		else variantsByMessage.set(variant.message_id, [variant]);
	}
	const commits: FreshImportCommit[] = [];
	let current: FreshImportCommit = { bundles: [], messages: [], variants: [] };
	for (const bundle of bundles) {
		const bundleMessages = messagesByBundle.get(bundle.id!) ?? [];
		const bundleVariants = bundleMessages.flatMap(
			(message) => variantsByMessage.get(message.id) ?? []
		);
		const rows = 1 + bundleMessages.length + bundleVariants.length;
		if (
			current.bundles.length > 0 &&
			current.bundles.length +
				current.messages.length +
				current.variants.length +
				rows >
				rowsPerCommit
		) {
			commits.push(current);
			current = { bundles: [], messages: [], variants: [] };
		}
		current.bundles.push(bundle);
		for (const message of bundleMessages) current.messages.push(message);
		for (const variant of bundleVariants) current.variants.push(variant);
	}
	commits.push(current);
	return commits;
}

/**
 * Writes one commit group with multi-row INSERTs inside its transaction.
 * This is faster here than Lix `executeMany` (one statement per row): for
 * 40k variants with their messages and bundles, 2.8 s against 3.6 s through
 * `tx.executeMany` and 7.8 s through auto-commit `executeMany`.
 */
async function insertFreshImportCommit(
	trx: Kysely<InlangDatabaseSchema>,
	commit: FreshImportCommit
) {
	await insertInBatchesByShape({
		rows: commit.bundles,
		optionalColumns: ["declarations", "description"],
		insert: async (rows) => {
			await trx.insertInto("inlang_bundle").values(rows).execute();
		},
	});
	await insertInBatchesByShape({
		rows: commit.messages,
		optionalColumns: ["selectors"],
		insert: async (rows) => {
			await trx.insertInto("inlang_message").values(rows).execute();
		},
	});
	await insertInBatchesByShape({
		rows: commit.variants,
		optionalColumns: ["matches", "pattern"],
		insert: async (rows) => {
			await trx.insertInto("inlang_variant").values(rows).execute();
		},
	});
}

/**
 * Kysely uses one column list for every row in a multi-row insert. Keep rows
 * with different optional-column shapes in separate statements so omitted
 * columns receive their schema defaults.
 */
async function insertInBatchesByShape<T extends object>(args: {
	rows: readonly T[];
	optionalColumns: readonly string[];
	insert: (rows: T[]) => Promise<void>;
}) {
	const rowsByShape = new Map<string, T[]>();
	for (const row of args.rows) {
		const shape = args.optionalColumns
			.map((column) =>
				(row as Record<string, unknown>)[column] === undefined ? "0" : "1"
			)
			.join("");
		const rowsForShape = rowsByShape.get(shape);
		if (rowsForShape) {
			rowsForShape.push(row);
		} else {
			rowsByShape.set(shape, [row]);
		}
	}

	for (const rowsForShape of rowsByShape.values()) {
		for (
			let offset = 0;
			offset < rowsForShape.length;
			offset += INSERT_BATCH_SIZE
		) {
			await args.insert(rowsForShape.slice(offset, offset + INSERT_BATCH_SIZE));
		}
	}
}

export async function importFiles(args: {
	files: ImportFile[];
	readonly pluginKey: string;
	readonly settings: ProjectSettings;
	readonly plugins: readonly InlangPlugin[];
	readonly db: Kysely<InlangDatabaseSchema>;
	/** Allow partial progress across commits on fresh imports. Defaults to atomic. */
	readonly allowPartialImport?: boolean;
	/** Testing hook for the partial import commit budget. */
	readonly rowsPerCommit?: number;
	/** Existing fallback ownership, without reapplying possibly stale companion text. */
	readonly companionOwnedBundleIds?: ReadonlySet<string>;
	/** Internal portable companion import; shares the resource transaction. */
	readonly descriptionImport?: {
		next: ReadonlyMap<string, string>;
		previous: ReadonlyMap<string, string>;
		content: Uint8Array;
	};
}) {
	const plugin = args.plugins.find((p) => p.key === args.pluginKey);

	if (!plugin) throw new PluginMissingError({ plugin: args.pluginKey });

	if (!plugin.importFiles) {
		throw new PluginDoesNotImplementFunctionError({
			plugin: args.pluginKey,
			function: "importFiles",
		});
	}

	const pluginResult = await plugin.importFiles({
		files: args.files,
		sdkCapabilities: ["bundle-description"],
		settings: structuredClone(args.settings),
	});
	const imported = {
		bundles: pluginResult.bundles.map((bundle) => {
			if (bundle.description === undefined) return bundle;
			if (bundle.description !== null && typeof bundle.description !== "string")
				throw new Error(
					`Invalid description for bundle ${JSON.stringify(bundle.id)}`
				);
			const description = bundle.description?.trim()
				? bundle.description
				: null;
			// A source added after guidance was authored can have no native comment.
			// Retain the current row (including a newer authored clear), not stale file text.
			if (
				description === null &&
				bundle.id !== undefined &&
				args.companionOwnedBundleIds?.has(bundle.id)
			) {
				const preserved = { ...bundle };
				delete preserved.description;
				return preserved;
			}
			return {
				...bundle,
				description,
			};
		}),
		messages: pluginResult.messages.map(messageFromPlugin),
		variants: pluginResult.variants.map(variantFromPlugin),
	};

	// Groups of a large fresh import that commit after the first one.
	let remainingFreshCommits: FreshImportCommit[] = [];
	await args.db.transaction().execute(async (trx) => {
		for (const bundle of imported.bundles) {
			if (
				bundle.description === undefined ||
				bundle.id === undefined ||
				!args.companionOwnedBundleIds?.has(bundle.id)
			)
				continue;
			const existing = await trx
				.selectFrom("inlang_bundle")
				.select("description")
				.where("id", "=", bundle.id)
				.executeTakeFirst();
			if (existing && existing.description !== bundle.description) {
				throw new Error(
					`Conflicting native and companion descriptions for bundle ${JSON.stringify(bundle.id)} (descriptions.json)`
				);
			}
		}
		const hasExistingBundles = await trx
			.selectFrom("inlang_bundle")
			.select("id")
			.limit(1)
			.executeTakeFirst();
		const bundleIds = new Set<string>();
		let bundlesHaveUniqueIds = true;
		for (const bundle of imported.bundles) {
			if (bundle.id === undefined || bundleIds.has(bundle.id)) {
				bundlesHaveUniqueIds = false;
				break;
			}
			bundleIds.add(bundle.id);
		}
		// Older plugins can emit one ID-less message for every plural/context
		// variant. Sequential upserts retain the last defined selectors; fold
		// only those duplicates, leaving explicit identities to the fallback.
		const messagesByKey = new Map<string, (typeof imported.messages)[number]>();
		const explicitMessageIds = new Set<string>();
		let messagesHaveUnambiguousKeys = true;
		for (const message of imported.messages) {
			const key = messageReferenceKey(message.bundle_id, message.locale);
			const previous = messagesByKey.get(key);
			if (previous) {
				if (previous.id !== undefined || message.id !== undefined) {
					messagesHaveUnambiguousKeys = false;
					break;
				}
				if (message.selectors !== undefined) {
					previous.selectors = message.selectors;
				}
			} else {
				messagesByKey.set(key, { ...message });
			}
			if (message.id !== undefined) {
				if (explicitMessageIds.has(message.id)) {
					messagesHaveUnambiguousKeys = false;
					break;
				}
				explicitMessageIds.add(message.id);
			}
		}
		const variantKeys = new Set<string>();
		const explicitVariantIds = new Set<string>();
		let variantsHaveUnambiguousKeys = true;
		for (const variant of imported.variants) {
			let messageKey: string;
			if (variant.id !== undefined) {
				if (
					!explicitMessageIds.has(variant.message_id) ||
					explicitVariantIds.has(variant.id)
				) {
					variantsHaveUnambiguousKeys = false;
					break;
				}
				explicitVariantIds.add(variant.id);
				messageKey = JSON.stringify(["id", variant.message_id]);
			} else {
				if (
					variant.messageBundleId === undefined ||
					variant.messageLocale === undefined ||
					variant.message_id !== undefined
				) {
					variantsHaveUnambiguousKeys = false;
					break;
				}
				messageKey = messageReferenceKey(
					variant.messageBundleId,
					variant.messageLocale
				);
				if (!messagesByKey.has(messageKey)) {
					variantsHaveUnambiguousKeys = false;
					break;
				}
				// Use the explicit identity for both reference forms so a mixed
				// import cannot accidentally bypass duplicate-match detection.
				const messageId = messagesByKey.get(messageKey)!.id;
				if (messageId !== undefined) {
					messageKey = JSON.stringify(["id", messageId]);
				}
			}
			const key = JSON.stringify([
				messageKey,
				variantMatchesKey(variant.matches),
			]);
			if (variantKeys.has(key)) {
				variantsHaveUnambiguousKeys = false;
				break;
			}
			variantKeys.add(key);
		}
		const canBatchImportFreshProject =
			hasExistingBundles === undefined &&
			bundlesHaveUniqueIds &&
			messagesHaveUnambiguousKeys &&
			variantsHaveUnambiguousKeys &&
			imported.messages.every((message) => bundleIds.has(message.bundle_id));

		if (canBatchImportFreshProject) {
			const messagesWithIds = [...messagesByKey.values()].map((message) => ({
				...message,
				id: message.id ?? v7(),
			}));

			const messageIds = new Map(
				messagesWithIds.map((message) => [
					messageReferenceKey(message.bundle_id, message.locale),
					message.id,
				])
			);
			const variantsWithMessageIds: NewVariantRow[] = imported.variants.map(
				(variant) => {
					const messageId =
						variant.message_id ??
						messageIds.get(
							messageReferenceKey(
								variant.messageBundleId!,
								variant.messageLocale!
							)
						);
					if (messageId === undefined) {
						throw new Error("Imported variant does not reference a message");
					}
					return {
						// Generate IDs in import order before batching by shape: IDs
						// determine variant precedence when selecting/exporting.
						id: variant.id ?? v7(),
						message_id: messageId,
						matches: variant.matches,
						pattern: variant.pattern,
					};
				}
			);
			const [first, ...rest] = groupFreshImportCommits(
				imported.bundles,
				messagesWithIds,
				variantsWithMessageIds,
				args.allowPartialImport && !args.descriptionImport
					? (args.rowsPerCommit ?? IMPORT_ROWS_PER_COMMIT)
					: Number.POSITIVE_INFINITY
			);
			await insertFreshImportCommit(trx, first!);
			remainingFreshCommits = rest;
			if (args.descriptionImport)
				await applyBundleDescriptions(
					{ db: trx },
					args.descriptionImport.next,
					args.descriptionImport.previous,
					{ transaction: false, content: args.descriptionImport.content }
				);
			return;
		}

		// Cache only imports matched by properties. Explicit IDs can move rows
		// between references; they retain the original sequential lookup path.
		let useLookupCache =
			bundlesHaveUniqueIds &&
			imported.messages.every((message) => message.id === undefined) &&
			imported.variants.every(
				(variant) =>
					variant.id === undefined &&
					variant.message_id === undefined &&
					variant.messageBundleId !== undefined &&
					variant.messageLocale !== undefined
			);
		const knownBundles = new Set<string>();
		const knownMessages = new Map<string, { id: string }>();
		const knownVariants = new Map<
			string,
			Array<{ id: string; matches: unknown }>
		>();
		if (useLookupCache) {
			const requestedMessages = new Set([
				...imported.messages.map((message) =>
					messageReferenceKey(message.bundle_id, message.locale)
				),
				...imported.variants.map((variant) =>
					messageReferenceKey(variant.messageBundleId!, variant.messageLocale!)
				),
			]);
			const referencedBundles = [
				...new Set([
					...imported.messages.map((message) => message.bundle_id),
					...imported.variants.map((variant) => variant.messageBundleId!),
				]),
			];
			for (
				let offset = 0;
				offset < referencedBundles.length;
				offset += INSERT_BATCH_SIZE
			) {
				const ids = referencedBundles.slice(offset, offset + INSERT_BATCH_SIZE);
				for (const bundle of await trx
					.selectFrom("inlang_bundle")
					.select("id")
					.where("id", "in", ids)
					.execute()) {
					knownBundles.add(bundle.id);
				}
				for (const message of await trx
					.selectFrom("inlang_message")
					.select(["id", "bundle_id", "locale"])
					.where("bundle_id", "in", ids)
					.execute()) {
					const key = messageReferenceKey(message.bundle_id, message.locale);
					if (!requestedMessages.has(key)) continue;
					// The schema permits explicit-ID messages sharing a reference.
					// Retain the sequential SELECT choice for these ambiguous rows.
					if (knownMessages.has(key)) useLookupCache = false;
					knownMessages.set(key, { id: message.id });
				}
			}
			const messageIds = useLookupCache
				? [...knownMessages.values()].map((message) => message.id)
				: [];
			for (
				let offset = 0;
				offset < messageIds.length;
				offset += INSERT_BATCH_SIZE
			) {
				const ids = messageIds.slice(offset, offset + INSERT_BATCH_SIZE);
				for (const variant of await trx
					.selectFrom("inlang_variant")
					.select(["id", "message_id", "matches"])
					.where("message_id", "in", ids)
					.execute()) {
					const variants = knownVariants.get(variant.message_id) ?? [];
					variants.push(variant);
					knownVariants.set(variant.message_id, variants);
				}
			}
		}
		// upsert every bundle
		for (const bundle of imported.bundles) {
			await trx
				.insertInto("inlang_bundle")
				.values(bundle)
				.onConflict((oc) => oc.column("id").doUpdateSet(bundle))
				.execute();
			if (useLookupCache) knownBundles.add(bundle.id!);
		}
		// upsert every message
		for (const message of imported.messages) {
			// match the message by bundle id and locale if
			// no id is provided by the importer
			if (message.id === undefined) {
				const exisingMessage = useLookupCache
					? knownMessages.get(
							messageReferenceKey(message.bundle_id, message.locale)
						)
					: await trx
							.selectFrom("inlang_message")
							.where("bundle_id", "=", message.bundle_id)
							.where("locale", "=", message.locale)
							.select("id")
							.executeTakeFirst();
				message.id = exisingMessage?.id;
			}
			const referencedBundle = useLookupCache
				? knownBundles.has(message.bundle_id)
				: await trx
						.selectFrom("inlang_bundle")
						.select("id")
						.where("id", "=", message.bundle_id)
						.executeTakeFirst();
			if (!referencedBundle) {
				await trx
					.insertInto("inlang_bundle")
					.values({ id: message.bundle_id })
					.execute();
				if (useLookupCache) knownBundles.add(message.bundle_id);
			}
			const upsertMessage = trx
				.insertInto("inlang_message")
				.values(message)
				.onConflict((oc) => oc.column("id").doUpdateSet(message));
			if (useLookupCache && message.id === undefined) {
				const inserted = await upsertMessage
					.returning("id")
					.executeTakeFirstOrThrow();
				knownMessages.set(
					messageReferenceKey(message.bundle_id, message.locale),
					inserted
				);
			} else {
				await upsertMessage.execute();
			}
		}
		// the variants of each message in the order of the import, to keep that
		// order for variants that already existed (see `orderVariantsLikeImport`)
		const importedVariantIdsByMessage = new Map<string, string[]>();
		// messages with variants that the plugin gave ids: the plugin manages
		// those ids, so they are not replaced to reorder the variants
		const messagesWithPluginVariantIds = new Set<string>();
		// upsert every variant
		for (const variant of imported.variants) {
			const variantHadId = variant.id !== undefined;
			// match the variant by message id and matches if
			// no id is provided by the importer
			if (variant.id === undefined) {
				let existingMessage = useLookupCache
					? knownMessages.get(
							messageReferenceKey(
								variant.messageBundleId!,
								variant.messageLocale!
							)
						)
					: await trx
							.selectFrom("inlang_message")
							.where("bundle_id", "=", variant.messageBundleId)
							.where("locale", "=", variant.messageLocale)
							.select("id")
							.executeTakeFirst();

				// if the message does not exist, create it
				if (existingMessage === undefined) {
					const existingBundle = useLookupCache
						? knownBundles.has(variant.messageBundleId!)
						: await trx
								.selectFrom("inlang_bundle")
								.where("id", "=", variant.messageBundleId)
								.select("id")
								.executeTakeFirst();
					// if the bundle does not exist, create it
					if (existingBundle === undefined || existingBundle === false) {
						await trx
							.insertInto("inlang_bundle")
							.values({ id: variant.messageBundleId })
							.execute();
						if (useLookupCache) knownBundles.add(variant.messageBundleId!);
					}
					// insert the message
					existingMessage = await trx
						.insertInto("inlang_message")
						.values({
							bundle_id: variant.messageBundleId,
							locale: variant.messageLocale,
						})
						.returningAll()
						.executeTakeFirstOrThrow();
					if (useLookupCache)
						knownMessages.set(
							messageReferenceKey(
								variant.messageBundleId!,
								variant.messageLocale!
							),
							existingMessage
						);
				}

				const existingVariants = useLookupCache
					? (knownVariants.get(existingMessage.id) ?? [])
					: await trx
							.selectFrom("inlang_variant")
							.where("message_id", "=", existingMessage.id)
							.selectAll()
							.execute();

				const { existing: existingVariant, duplicates } = findExistingVariant(
					existingVariants,
					variant.matches
				);
				if (duplicates.length > 0) {
					await trx
						.deleteFrom("inlang_variant")
						.where(
							"id",
							"in",
							duplicates.map((duplicate) => duplicate.id)
						)
						.execute();
					if (useLookupCache)
						knownVariants.set(
							existingMessage.id,
							existingVariants.filter((row) => !duplicates.includes(row))
						);
				}

				// need to reset typescript's type narrowing
				(variant as ImportedVariant).id = existingVariant?.id;
				(variant as ImportedVariant).message_id = existingMessage.id;
			}
			const toBeInsertedVariant: NewVariantRow = {
				...variant,
				// @ts-expect-error - bundle id is provided by VariantImport but not needed when inserting
				messageBundleId: undefined,
				messageLocale: undefined,
			};
			let upserted: { id: string; message_id: string };
			if (toBeInsertedVariant.id === undefined) {
				upserted = await trx
					.insertInto("inlang_variant")
					.values(toBeInsertedVariant)
					.returning(["id", "message_id"])
					.executeTakeFirstOrThrow();
			} else {
				await trx
					.insertInto("inlang_variant")
					.values(toBeInsertedVariant)
					.onConflict((oc) => oc.column("id").doUpdateSet(toBeInsertedVariant))
					.execute();
				upserted = {
					id: toBeInsertedVariant.id,
					message_id: toBeInsertedVariant.message_id,
				};
			}
			if (useLookupCache) {
				const variants = knownVariants.get(upserted.message_id) ?? [];
				const existing = variants.find((row) => row.id === upserted.id);
				if (existing) {
					if (variant.matches !== undefined) existing.matches = variant.matches;
				} else {
					variants.push({ id: upserted.id, matches: variant.matches ?? [] });
				}
				knownVariants.set(upserted.message_id, variants);
			}
			if (variantHadId) {
				messagesWithPluginVariantIds.add(upserted.message_id);
			} else {
				const ids = importedVariantIdsByMessage.get(upserted.message_id);
				if (ids) ids.push(upserted.id);
				else
					importedVariantIdsByMessage.set(upserted.message_id, [upserted.id]);
			}
		}
		for (const [messageId, ids] of importedVariantIdsByMessage) {
			if (messagesWithPluginVariantIds.has(messageId)) continue;
			await orderVariantsLikeImport(trx, ids);
		}
		if (args.descriptionImport)
			await applyBundleDescriptions(
				{ db: trx },
				args.descriptionImport.next,
				args.descriptionImport.previous,
				{ transaction: false, content: args.descriptionImport.content }
			);
	});
	for (const commit of remainingFreshCommits) {
		await args.db
			.transaction()
			.execute((trx) => insertFreshImportCommit(trx, commit));
	}
}
