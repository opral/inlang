import type { Kysely } from "kysely";
import {
	PluginDoesNotImplementFunctionError,
	PluginMissingError,
} from "../plugin/errors.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { InlangDatabaseSchema, NewVariant } from "../database/schema.js";
import type { InlangPlugin, VariantImport } from "../plugin/schema.js";
import type { ImportFile } from "../project/api.js";

export async function importFiles(args: {
	files: ImportFile[];
	readonly pluginKey: string;
	readonly settings: ProjectSettings;
	readonly plugins: readonly InlangPlugin[];
	readonly db: Kysely<InlangDatabaseSchema>;
}) {
	const plugin = args.plugins.find((p) => p.key === args.pluginKey);

	if (!plugin) throw new PluginMissingError({ plugin: args.pluginKey });

	if (!plugin.importFiles) {
		throw new PluginDoesNotImplementFunctionError({
			plugin: args.pluginKey,
			function: "importFiles",
		});
	}

	const imported = await plugin.importFiles({
		files: args.files,
		settings: structuredClone(args.settings),
	});

	await args.db.transaction().execute(async (trx) => {
		// upsert every bundle
		for (const bundle of imported.bundles) {
			await trx
				.insertInto("bundle")
				.values(bundle)
				.onConflict((oc) => oc.column("id").doUpdateSet(bundle))
				.execute();
		}
		// upsert every message
		for (const message of imported.messages) {
			// match the message by bundle id and locale if
			// no id is provided by the importer
			if (message.id === undefined) {
				const exisingMessage = await trx
					.selectFrom("message")
					.where("bundleId", "=", message.bundleId)
					.where("locale", "=", message.locale)
					.select("id")
					.executeTakeFirst();
				message.id = exisingMessage?.id;
			}
			const referencedBundle = await trx
				.selectFrom("bundle")
				.select("id")
				.where("id", "=", message.bundleId)
				.executeTakeFirst();
			if (!referencedBundle) {
				await trx
					.insertInto("bundle")
					.values({ id: message.bundleId })
					.execute();
			}
			await trx
				.insertInto("message")
				.values(message)
				.onConflict((oc) => oc.column("id").doUpdateSet(message))
				.execute();
		}
		// upsert every variant
		for (const variant of imported.variants) {
			// match the variant by message id and matches if
			// no id is provided by the importer
			if (variant.id === undefined) {
				let existingMessage = await trx
					.selectFrom("message")
					.where("bundleId", "=", variant.messageBundleId)
					.where("locale", "=", variant.messageLocale)
					.select("id")
					.executeTakeFirst();

				// if the message does not exist, create it
				if (existingMessage === undefined) {
					const existingBundle = await trx
						.selectFrom("bundle")
						.where("id", "=", variant.messageBundleId)
						.select("id")
						.executeTakeFirst();
					// if the bundle does not exist, create it
					if (existingBundle === undefined) {
						await trx
							.insertInto("bundle")
							.values({ id: variant.messageBundleId })
							.execute();
					}
					// insert the message
					existingMessage = await trx
						.insertInto("message")
						.values({
							bundleId: variant.messageBundleId,
							locale: variant.messageLocale,
						})
						.returningAll()
						.executeTakeFirstOrThrow();
				}

				const existingVariants = await trx
					.selectFrom("variant")
					.where("messageId", "=", existingMessage.id)
					.selectAll()
					.execute();

				const existingVariant = existingVariants.find(
					(v) => JSON.stringify(v.matches) === JSON.stringify(variant.matches)
				);

				// need to reset typescript's type narrowing
				(variant as VariantImport).id = existingVariant?.id;
				(variant as VariantImport).messageId = existingMessage.id;
			}
			const toBeInsertedVariant: NewVariant = {
				...variant,
				// @ts-expect-error - bundle id is provided by VariantImport but not needed when inserting
				messageBundleId: undefined,
				messageLocale: undefined,
			};
			await trx
				.insertInto("variant")
				.values(toBeInsertedVariant)
				.onConflict((oc) => oc.column("id").doUpdateSet(toBeInsertedVariant))
				.execute();
		}
	});
}
