export { checkProject } from "./checkProject.js";
export { applyFix } from "./applyFix.js";
export { findUsages } from "./findUsages.js";
export {
	checkBundle,
	type CheckBundleArgs,
	type CheckableBundle,
} from "./checkBundle.js";
export {
	checkTranslation,
	variableNames,
	markupNames,
	isEmptyPattern,
	closestName,
	type TranslationIssue,
} from "./translations.js";
export {
	selectorGroups,
	requiredVariants,
	missingVariants,
	variantCovers,
	pluralRules,
	pluralCategories,
	isSingleNumberCategory,
	isPluralSelector,
	isNumericKey,
	matchValue,
	resolveAnnotation,
	resolveInputVariable,
	type SelectorGroup,
	type SelectorOptions,
	type PluralRules,
} from "./selectors.js";
export type {
	SourceFile,
	UsageAnalysis,
	UsageReference,
	AnalyzeUsage,
	FindUsagesArgs,
	FindUsagesResult,
	CheckId,
	CheckStatus,
	CheckFix,
	CheckDiagnostic,
	CheckResult,
	CheckProjectArgs,
	ApplyFixArgs,
	ApplyFixResult,
} from "./types.js";
