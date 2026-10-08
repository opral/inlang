import type { Kysely } from "kysely";
import type { InlangDatabaseSchema } from "../database/schema.js";
import type {
	CheckDiagnostic,
	CheckId,
	CheckProjectArgs,
	CheckResult,
} from "./types.js";
import { projectUsage } from "./usage.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import type { BundleNested } from "../database/schema.js";
import { checkTranslation } from "./translations.js";

// Results list checks in this order; unused-message stays second as in the first release.
const ALL_CHECKS: readonly CheckId[] = [
	"missing-translation",
	"unused-message",
	"empty-translation",
	"missing-variable",
	"unknown-variable",
	"missing-markup",
	"missing-variant",
];
/** Checks that compare translation patterns and therefore read them. */
const PATTERN_CHECKS: readonly CheckId[] = [
	"empty-translation",
	"missing-variable",
	"unknown-variable",
	"missing-markup",
	"missing-variant",
];

/** Checks derived project state without mutation, subscriptions or file I/O. */
export async function checkProject(
	args: CheckProjectArgs
): Promise<CheckResult> {
	const settings = await args.project.settings.get();
	const enabled = new Set(args.checks ?? ALL_CHECKS);
	const usage = enabled.has("unused-message")
		? await projectUsage(args.project, args.files, settings)
		: undefined;
	const result: CheckResult = {
		diagnostics: [],
		checks: ALL_CHECKS.filter((id) => enabled.has(id)).map((id) =>
			id === "unused-message" && usage
				? {
						...usage.check,
						...(usage.check.issues
							? { issues: usage.check.issues.map((issue) => ({ ...issue })) }
							: {}),
					}
				: { id, status: "complete" as const }
		),
	};
	const referenceLocale = args.referenceLocale ?? settings.baseLocale;
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
		const unused = usage
			? [...bundles.keys()].filter(
					(id) => usage.check.status === "complete" && !usage.used.has(id)
				)
			: [];
		const revisions = unused.length
			? await bundleRevisions(args.project.db, unused)
			: new Map<string, string>();
		for (const [bundleId, present] of bundles) {
			for (const locale of enabled.has("missing-translation") ? locales : []) {
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
		if (PATTERN_CHECKS.some((id) => enabled.has(id)))
			for (const bundle of await nestedBundles(args.project, scope, [
				...bundles.keys(),
			]))
				result.diagnostics.push(
					...translationDiagnostics(
						bundle,
						locales,
						referenceLocale,
						ignored
					).filter((diagnostic) => enabled.has(diagnostic.checkId))
				);
	}
	return result;
}

/** Bundles with patterns: one query for a full scan, per bundle for scoped refreshes. */
async function nestedBundles(
	project: CheckProjectArgs["project"],
	scope: string[] | undefined,
	ids: string[]
): Promise<BundleNested[]> {
	if (scope === undefined) return selectBundleNested(project.db).execute();
	const result: BundleNested[] = [];
	for (const id of ids) {
		const bundle = await selectBundleNested(project.db)
			.where("inlang_bundle.id", "=", id)
			.executeTakeFirst();
		if (bundle) result.push(bundle);
	}
	return result;
}

/** Compares every locale's message with the reference locale's message. */
export function translationDiagnostics(
	bundle: BundleNested,
	locales: readonly string[],
	referenceLocale: string,
	ignored: Map<string, Set<string>> = new Map()
): CheckDiagnostic[] {
	const diagnostics: CheckDiagnostic[] = [];
	const reference = bundle.messages.find(
		(message) => message.locale === referenceLocale
	);
	const id = JSON.stringify(bundle.id);
	const base = { bundleId: bundle.id, severity: "warning" as const, fixes: [] };
	for (const locale of locales) {
		if (locale === referenceLocale) continue;
		const target = bundle.messages.find((message) => message.locale === locale);
		if (!target) continue;
		const where = JSON.stringify(locale);
		const messageId = target.id;
		for (const issue of checkTranslation({
			reference,
			target,
			declarations: bundle.declarations,
		})) {
			if (issue.type === "missing-translation") {
				if (!ignored.get(bundle.id)?.has(locale))
					diagnostics.push({
						...base,
						locale,
						checkId: "empty-translation",
						messageId,
						message: `Message ${id} has an empty translation for ${where}.`,
					});
			} else if (issue.type === "missing-variable")
				diagnostics.push({
					...base,
					locale,
					checkId: "missing-variable",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					message: `Message ${id} is missing {${issue.name}} in ${where}.`,
				});
			else if (issue.type === "unknown-variable")
				diagnostics.push({
					...base,
					locale,
					checkId: "unknown-variable",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
					message: `Message ${id} uses {${issue.name}} in ${where}, which ${JSON.stringify(referenceLocale)} doesn't use${issue.suggestion ? `. Did you mean {${issue.suggestion}}?` : "."}`,
				});
			else if (issue.type === "missing-markup")
				diagnostics.push({
					...base,
					locale,
					checkId: "missing-markup",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					message: `Message ${id} is missing the <${issue.name}> markup in ${where}.`,
				});
			else
				diagnostics.push({
					...base,
					locale,
					checkId: "missing-variant",
					messageId,
					matches: issue.matches,
					message: `Message ${id} has no variant for ${issue.matches.map((match) => `${match.key}=${match.type === "literal-match" ? match.value : "*"}`).join(", ")} in ${where}.`,
				});
		}
	}
	return diagnostics;
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
