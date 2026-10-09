import type { FindUsagesArgs, FindUsagesResult } from "./types.js";
import { copyIssue, projectUsage } from "./usage.js";

/**
 * Where messages are used in a source snapshot, from the plugins' `analyzeUsage`
 * (shared with `checkProject`, so the snapshot is analyzed once). References
 * are only as complete as the analysis: check `status` before treating a
 * message without references as unused.
 */
export async function findUsages(
	args: FindUsagesArgs
): Promise<FindUsagesResult> {
	const settings = await args.project.settings.get();
	const usage = await projectUsage(args.project, args.files, settings);
	const wanted = args.bundleIds ? new Set(args.bundleIds) : undefined;
	return {
		status: usage.check.status,
		...(usage.check.reason ? { reason: usage.check.reason } : {}),
		...(usage.check.issues
			? { issues: usage.check.issues.map(copyIssue) }
			: {}),
		references: usage.references
			.filter((reference) => !wanted || wanted.has(reference.bundleId))
			.map((reference) => ({
				...reference,
				start: { ...reference.start },
				end: { ...reference.end },
			})),
	};
}
