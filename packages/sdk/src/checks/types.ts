import type { InlangProject } from "../project/api.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { Match } from "../database/schema.js";

/** A complete caller-selected application source snapshot, not a change set. */
export type SourceFile = { path: string; content: string };

/** Where a message is used: 1-based lines, 0-based columns, end exclusive. */
export type UsageReference = {
	bundleId: string;
	path: string;
	start: { line: number; column: number };
	end: { line: number; column: number };
};

/** Plugins must report uncertainty rather than silently omit possible usages. */
export type UsageAnalysis = {
	usedBundleIds: readonly string[];
	status: "complete" | "incomplete";
	issues?: readonly { path?: string; reason: string }[];
	/** Optional source locations of the usages, e.g. for "find references" and code previews. */
	references?: readonly UsageReference[];
};
export type AnalyzeUsage = (args: {
	files: readonly SourceFile[];
	settings: ProjectSettings;
}) => UsageAnalysis | Promise<UsageAnalysis>;

export type CheckId =
	| "missing-translation"
	| "empty-translation"
	| "empty-variant"
	| "missing-variable"
	| "unknown-variable"
	| "missing-markup"
	| "missing-variant"
	| "missing-selector"
	| "unused-message";
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
type DiagnosticBase = {
	bundleId: string;
	locale?: string;
	severity: "warning";
	message: string;
	fixes: CheckFix[];
};
/**
 * Translation diagnostics compare a locale's message with the reference
 * locale's message. Variant-level ones name the variant so editors can show
 * the problem next to the right form.
 */
export type CheckDiagnostic = DiagnosticBase &
	(
		| { checkId: "missing-translation" | "unused-message" }
		| { checkId: "empty-translation"; messageId: string }
		| {
				checkId: "empty-variant";
				messageId: string;
				variantId: string;
				/** The match combination of the empty variant. */
				matches: Match[];
		  }
		| {
				checkId: "missing-variable" | "missing-markup";
				messageId: string;
				variantId: string;
				/** The variable or markup tag the reference uses. */
				name: string;
		  }
		| {
				checkId: "unknown-variable";
				messageId: string;
				variantId: string;
				name: string;
				/** The reference variable the name most likely meant. */
				suggestion?: string;
		  }
		| {
				checkId: "missing-selector";
				messageId: string;
				/** The input the reference chooses by ("gender", "count"). */
				name: string;
				/** The reference's selector on it ("gender", "countPlural", "countPluralExact"). */
				selector: string;
				/** Its select values or exact numbers (ICU `=0`) the translation can't express; empty for a plural. */
				values: string[];
		  }
		| {
				checkId: "missing-variant";
				messageId: string;
				/** The match combination no variant covers. */
				matches: Match[];
		  }
	);
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
	/** Locale translations are compared with. Defaults to `settings.baseLocale`. */
	referenceLocale?: string;
	/** Checks to run. Defaults to all. Only the translation checks read patterns. */
	checks?: readonly CheckId[];
};
export type FindUsagesArgs = {
	project: InlangProject;
	/** A full source snapshot, as for `checkProject`. */
	files: readonly SourceFile[];
	/** Only return references to these bundles. */
	bundleIds?: readonly string[];
};
export type FindUsagesResult = {
	status: CheckStatus["status"];
	reason?: string;
	issues?: readonly { path?: string; reason: string }[];
	references: UsageReference[];
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
