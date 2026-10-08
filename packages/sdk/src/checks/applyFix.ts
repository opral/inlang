import { sql } from "kysely";
import { withLanguageTagToLocaleMigration } from "../migrations/v2/withLanguageTagToLocaleMigration.js";
import type { ApplyFixArgs, ApplyFixResult } from "./types.js";
import { bundleRevisions, chunks } from "./checkProject.js";
import { projectUsage } from "./usage.js";

/** Revalidate and apply an explicitly selected fix to the local project. */
export async function applyFix(args: ApplyFixArgs): Promise<ApplyFixResult> {
	const skip = (reason: string): ApplyFixResult => ({
		status: "skipped",
		reason,
	});
	const fix = args.diagnostic.fixes.find((fix) => fix.id === args.fixId);
	if (
		!fix ||
		args.fixId !== "delete-unused-message" ||
		args.diagnostic.checkId !== "unused-message"
	)
		return skip("This diagnostic does not offer the selected fix.");
	// Always rerun the plugin here: a fix must not rely on a cached finding.
	const settings = await args.project.settings.get();
	const usage = await projectUsage(args.project, args.files, settings, true);
	if (usage.check.status !== "complete")
		return skip(usage.check.reason ?? "Usage analysis is incomplete.");
	const id = args.diagnostic.bundleId;
	if (usage.used.has(id)) return skip("The message is now used.");
	return args.project.db
		.transaction()
		.execute(async (tx): Promise<ApplyFixResult> => {
			const currentSettings = await sql<{
				content: Uint8Array;
			}>`SELECT content FROM lix_file WHERE path = ${"/settings.json"}`.execute(
				tx
			);
			const content = currentSettings.rows[0]?.content;
			if (
				!content ||
				JSON.stringify(
					withLanguageTagToLocaleMigration(
						JSON.parse(new TextDecoder().decode(content))
					)
				) !== JSON.stringify(settings)
			)
				return skip(
					"Project settings changed during analysis. Run checks again."
				);
			const revisions = await bundleRevisions(tx, [id]);
			if (revisions.get(id) !== fix.expectedRevision)
				return skip(
					"The message changed or no longer exists. Run checks again."
				);
			const messages = await tx
				.selectFrom("inlang_message")
				.select("id")
				.where("bundle_id", "=", id)
				.execute();
			for (const ids of chunks(
				messages.map((row) => row.id),
				500
			)) {
				await tx
					.deleteFrom("inlang_variant")
					.where("message_id", "in", ids)
					.execute();
			}
			await tx
				.deleteFrom("inlang_message")
				.where("bundle_id", "=", id)
				.execute();
			await tx.deleteFrom("inlang_bundle").where("id", "=", id).execute();
			return { status: "applied", affectedBundleIds: [id] };
		});
}
