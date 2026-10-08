import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";
import type { CheckProjectArgs, CheckResult } from "./types.js";
import { projectUsage } from "./usage.js";

/** Checks derived project state without mutation, subscriptions or file I/O. */
export async function checkProject(
	args: CheckProjectArgs
): Promise<CheckResult> {
	const settings = await args.project.settings.get();
	const usage = await projectUsage(args.project, args.files, settings);
	const result: CheckResult = {
		diagnostics: [],
		checks: [
			{ id: "missing-translation", status: "complete" },
			{
				...usage.check,
				...(usage.check.issues
					? { issues: usage.check.issues.map((issue) => ({ ...issue })) }
					: {}),
			},
		],
	};
	const ignored = new Map<string, Set<string>>();
	for (const { bundleId, locale } of args.ignoreMissingTranslations ?? []) {
		if (!ignored.has(bundleId)) ignored.set(bundleId, new Set());
		ignored.get(bundleId)!.add(locale);
	}
	const locales = [...new Set([settings.baseLocale, ...settings.locales])];
	// No translation patterns are read. One query per bounded scope, never per bundle.
	const scopes =
		args.bundleIds === undefined
			? [undefined]
			: chunks([...new Set(args.bundleIds)], 500);
	for (const scope of scopes) {
		let query = args.project.db
			.selectFrom("inlang_bundle")
			.leftJoin(
				"inlang_message",
				"inlang_message.bundle_id",
				"inlang_bundle.id"
			)
			.select([
				"inlang_bundle.id as bundle_id",
				"inlang_message.locale as locale",
			]);
		if (scope) query = query.where("inlang_bundle.id", "in", scope);
		const bundles = new Map<string, Set<string>>();
		for (const row of await query.execute()) {
			if (!bundles.has(row.bundle_id)) bundles.set(row.bundle_id, new Set());
			if (row.locale !== null) bundles.get(row.bundle_id)!.add(row.locale);
		}
		const unused = [...bundles.keys()].filter(
			(id) => usage.check.status === "complete" && !usage.used.has(id)
		);
		const revisions = unused.length
			? await bundleRevisions(args.project.db, unused)
			: new Map<string, string>();
		for (const [bundleId, present] of bundles) {
			for (const locale of locales) {
				if (present.has(locale) || ignored.get(bundleId)?.has(locale)) continue;
				result.diagnostics.push({
					checkId: "missing-translation",
					bundleId,
					locale,
					severity: "warning",
					message: `Message ${JSON.stringify(bundleId)} has no translation for ${JSON.stringify(locale)}.`,
					fixes: [],
				});
			}
			const expectedRevision = revisions.get(bundleId);
			if (expectedRevision !== undefined)
				result.diagnostics.push({
					checkId: "unused-message",
					bundleId,
					severity: "warning",
					message: `Message ${JSON.stringify(bundleId)} has no detected usage in the supplied source snapshot.`,
					fixes: [
						{
							id: "delete-unused-message",
							title: "Delete message from all locales",
							expectedRevision,
						},
					],
				});
		}
	}
	return result;
}

/** Revision metadata includes every dependent row, including added/removed variants. */
export async function bundleRevisions(
	db: Kysely<InlangDatabaseSchema>,
	ids: readonly string[]
): Promise<Map<string, string>> {
	let query = db
		.selectFrom("inlang_bundle")
		.leftJoin("inlang_message", "inlang_message.bundle_id", "inlang_bundle.id")
		.leftJoin(
			"inlang_variant",
			"inlang_variant.message_id",
			"inlang_message.id"
		)
		.select([
			"inlang_bundle.id as bundle_id",
			"inlang_bundle.lixcol_change_id as bundle_change",
			"inlang_message.id as message_id",
			"inlang_message.lixcol_change_id as message_change",
			"inlang_variant.id as variant_id",
			"inlang_variant.lixcol_change_id as variant_change",
		]);
	// A broad scan avoids repeatedly joining the catalog for each 500-ID chunk.
	// Scoped refreshes and individual fixes retain their selective predicates.
	if (ids.length <= 500)
		query = query.where("inlang_bundle.id", "in", [...ids]);
	const rows = await query.execute();
	const wanted = new Set(ids);
	const parts = new Map<string, Set<string>>();
	for (const row of rows) {
		if (!wanted.has(row.bundle_id)) continue;
		if (!parts.has(row.bundle_id)) parts.set(row.bundle_id, new Set());
		const revision = parts.get(row.bundle_id)!;
		revision.add(JSON.stringify(["bundle", row.bundle_id, row.bundle_change]));
		if (row.message_id !== null)
			revision.add(
				JSON.stringify(["message", row.message_id, row.message_change])
			);
		if (row.variant_id !== null)
			revision.add(
				JSON.stringify(["variant", row.variant_id, row.variant_change])
			);
	}
	return new Map(
		[...parts].map(([id, revision]) => [
			id,
			JSON.stringify([...revision].sort()),
		])
	);
}
export function chunks<T>(items: readonly T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		result.push(items.slice(i, i + size));
	return result;
}
