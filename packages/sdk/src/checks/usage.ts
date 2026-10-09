import type { InlangProject } from "../project/api.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type {
	AnalyzeUsage,
	CheckStatus,
	SourceFile,
	UsageAnalysis,
	UsageIssue,
	UsageReference,
} from "./types.js";

type Usage = {
	used: Set<string>;
	check: CheckStatus;
	references: UsageReference[];
};
type Cached = {
	files: readonly SourceFile[];
	settings: string;
	analyzers: AnalyzeUsage[];
	result: Promise<Usage>;
};
// One snapshot per project, released with the project. Translation edits reuse it.
const cache = new WeakMap<InlangProject, Cached>();

export async function projectUsage(
	project: InlangProject,
	files: readonly SourceFile[] | undefined,
	settings: ProjectSettings,
	fresh = false
): Promise<Usage> {
	const unavailable = (reason: string): Usage => ({
		used: new Set(),
		references: [],
		check: { id: "unused-message", status: "unavailable", reason },
	});
	if (files === undefined)
		return unavailable("Source files were not provided.");
	if (files.length === 0) return unavailable("The source snapshot is empty.");
	const [plugins, errors] = await Promise.all([
		project.plugins.get(),
		project.errors.get(),
	]);
	const analyzers = plugins.flatMap((plugin) =>
		plugin.analyzeUsage ? [plugin.analyzeUsage] : []
	);
	if (!analyzers.length && errors.length)
		return {
			used: new Set(),
			references: [],
			check: {
				id: "unused-message",
				status: "incomplete",
				reason: "Project plugin loading reported errors.",
				issues: [{ reason: "Project plugin loading reported errors." }],
			},
		};
	if (!analyzers.length)
		return unavailable("No installed plugin supports usage analysis.");
	const unsupportedMatchers = plugins.filter(
		(plugin) =>
			!plugin.analyzeUsage &&
			plugin.meta?.["app.inlang.ideExtension"]?.messageReferenceMatchers
	);
	const settingsKey = JSON.stringify(settings);
	const previous = cache.get(project);
	if (
		!fresh &&
		!errors.length &&
		!unsupportedMatchers.length &&
		previous &&
		previous.settings === settingsKey &&
		analyzers.length === previous.analyzers.length &&
		analyzers.every(
			(analyzer, index) => analyzer === previous.analyzers[index]
		) &&
		files.length === previous.files.length &&
		files.every(
			(file, index) =>
				file.path === previous.files[index]!.path &&
				file.content === previous.files[index]!.content
		)
	)
		return previous.result;

	const snapshot = Object.freeze(
		files.map((file) => Object.freeze({ ...file }))
	);
	const analyzerSettings = freezeJson(
		JSON.parse(settingsKey) as ProjectSettings
	);
	let failed = false;
	const result = (async (): Promise<Usage> => {
		const used = new Set<string>();
		const references: UsageReference[] = [];
		const issues: UsageIssue[] = [];
		if (errors.length)
			issues.push({ reason: "Project plugin loading reported errors." });
		for (const plugin of unsupportedMatchers)
			issues.push({
				reason: `Matcher ${plugin.key} does not support usage analysis.`,
			});
		for (const analyze of analyzers) {
			try {
				const analysis = normalizeAnalysis(
					await analyze({
						files: snapshot,
						settings: analyzerSettings,
					})
				);
				for (const id of analysis.usedBundleIds) used.add(id);
				references.push(...(analysis.references ?? []));
				if (analysis.status !== "complete" || analysis.issues?.length) {
					issues.push(
						...(analysis.issues?.length
							? analysis.issues.map(copyIssue)
							: [{ reason: "The analyzer could not resolve all usages." }])
					);
				}
			} catch (error) {
				failed = true;
				issues.push({
					reason: `Usage analysis failed: ${errorMessage(error)}`,
				});
			}
		}
		return {
			used,
			references,
			check: issues.length
				? {
						id: "unused-message",
						status: "incomplete",
						reason:
							"Some usages could not be analyzed. Unused diagnostics and fixes are withheld.",
						issues,
					}
				: { id: "unused-message", status: "complete" },
		};
	})();
	if (!errors.length && !unsupportedMatchers.length)
		cache.set(project, {
			files: snapshot,
			settings: settingsKey,
			analyzers,
			result,
		});
	const resolved = await result;
	if (failed && cache.get(project)?.result === result) cache.delete(project);
	return resolved;
}

/** A public copy of an issue: callers can't alter the cached analysis. */
export function copyIssue(issue: UsageIssue): UsageIssue {
	return {
		reason: issue.reason,
		...(issue.path !== undefined ? { path: issue.path } : {}),
		...(issue.start ? { start: { ...issue.start } } : {}),
		...(issue.end ? { end: { ...issue.end } } : {}),
	};
}

/** Freeze an isolated JSON settings copy so plugins cannot alter another check's input. */
function freezeJson<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeJson(child);
		Object.freeze(value);
	}
	return value;
}

/** Read plugin array entries once, independent of overridden methods or iterators. */
function normalizeAnalysis(value: UsageAnalysis): UsageAnalysis {
	const invalid = () => {
		throw new Error("The analyzer returned an invalid usage result.");
	};
	if (!value || typeof value !== "object") return invalid();
	const status = value.status;
	const rawIds = value.usedBundleIds;
	const rawIssues = value.issues;
	if (
		(status !== "complete" && status !== "incomplete") ||
		!Array.isArray(rawIds) ||
		(rawIssues !== undefined && !Array.isArray(rawIssues))
	)
		return invalid();
	const rawReferences = value.references;
	if (rawReferences !== undefined && !Array.isArray(rawReferences))
		return invalid();
	const position = (point: unknown) => {
		if (!point || typeof point !== "object") return invalid();
		const { line, column } = point as { line: unknown; column: unknown };
		if (!Number.isInteger(line) || !Number.isInteger(column)) return invalid();
		return { line: line as number, column: column as number };
	};
	const references: UsageReference[] = [];
	if (rawReferences)
		for (let i = 0; i < rawReferences.length; i++) {
			const reference = rawReferences[i];
			if (!reference || typeof reference !== "object") return invalid();
			const { bundleId, path } = reference;
			if (typeof bundleId !== "string" || typeof path !== "string")
				return invalid();
			references.push({
				bundleId,
				path,
				start: position(reference.start),
				end: position(reference.end),
			});
		}
	const usedBundleIds: string[] = [];
	for (let i = 0; i < rawIds.length; i++) {
		const id = rawIds[i];
		if (typeof id !== "string") return invalid();
		usedBundleIds.push(id);
	}
	const issues: UsageIssue[] = [];
	if (rawIssues)
		for (let i = 0; i < rawIssues.length; i++) {
			const issue = rawIssues[i];
			if (!issue || typeof issue !== "object") return invalid();
			const reason = issue.reason,
				path = issue.path,
				start = issue.start,
				end = issue.end;
			if (
				typeof reason !== "string" ||
				(path !== undefined && typeof path !== "string")
			)
				return invalid();
			issues.push({
				reason,
				...(path !== undefined ? { path } : {}),
				// `null` like absent: an analyzer without a location for this issue
				...(start != null ? { start: position(start) } : {}),
				...(end != null ? { end: position(end) } : {}),
			});
		}
	return { status, usedBundleIds, issues, references };
}
function errorMessage(error: unknown): string {
	try {
		return error instanceof Error ? error.message : String(error);
	} catch {
		return "Unknown analyzer failure";
	}
}
