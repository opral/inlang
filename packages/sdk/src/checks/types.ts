import type { InlangProject } from "../project/api.js";
import type { ProjectSettings } from "../json-schema/settings.js";

/** A complete caller-selected application source snapshot, not a change set. */
export type SourceFile = { path: string; content: string };

/** Plugins must report uncertainty rather than silently omit possible usages. */
export type UsageAnalysis = {
	usedBundleIds: readonly string[];
	status: "complete" | "incomplete";
	issues?: readonly { path?: string; reason: string }[];
};
export type AnalyzeUsage = (args: {
	files: readonly SourceFile[];
	settings: ProjectSettings;
}) => UsageAnalysis | Promise<UsageAnalysis>;

export type CheckId = "missing-translation" | "unused-message";
export type CheckStatus = {
	id: CheckId;
	status: "complete" | "incomplete" | "unavailable";
	reason?: string;
	issues?: readonly { path?: string; reason: string }[];
};

/** Serializable action metadata. Implementations remain owned by the SDK. */
export type CheckFix = {
	id: "delete-unused-message";
	title: string;
	/** Opaque target revision; retain unchanged when applying a fix. */
	expectedRevision: string;
};
export type CheckDiagnostic = {
	checkId: CheckId;
	bundleId: string;
	locale?: string;
	severity: "warning";
	message: string;
	fixes: CheckFix[];
};
export type CheckResult = {
	diagnostics: CheckDiagnostic[];
	checks: CheckStatus[];
};
export type CheckProjectArgs = {
	project: InlangProject;
	files?: readonly SourceFile[];
	/** Optional scope for refreshing edited bundles. Files still form a full snapshot. */
	bundleIds?: readonly string[];
	/** Intentional fallback can exempt individual bundle/locale combinations. */
	ignoreMissingTranslations?: readonly { bundleId: string; locale: string }[];
};
export type ApplyFixArgs = {
	project: InlangProject;
	files?: readonly SourceFile[];
	diagnostic: CheckDiagnostic;
	fixId: CheckFix["id"];
};
export type ApplyFixResult =
	| { status: "applied"; affectedBundleIds: string[] }
	| { status: "skipped"; reason: string };
