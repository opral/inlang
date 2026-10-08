//main components
export { default as InlangBundle } from "./stories/inlang-bundle.js";
export { default as InlangMessage } from "./stories/message/inlang-message.js";
export { default as InlangVariant } from "./stories/variant/inlang-variant.js";
export { default as InlangPatternEditor } from "./stories/pattern-editor/inlang-pattern-editor.js";

//modals & actions
export { default as InlangBundleAction } from "./stories/actions/bundle-action/inlang-bundle-action.js";
export { default as InlangAddSelector } from "./stories/actions/add-selector/inlang-add-selector.js";

// types
export type { ChangeEventDetail } from "./helper/event.js";

// helpers
export { selectorMatches } from "./helper/selectorMatches.js";
export type {
	MatchSuggestion,
	SelectorMatches,
} from "./helper/selectorMatches.js";
export { pluralExamples } from "./helper/pluralExamples.js";
export { requiredForms, selectorKeys } from "./helper/requiredForms.js";
export { selectVariant } from "./helper/selectVariant.js";
export type { SelectVariantArgs } from "./helper/selectVariant.js";
export {
	formatPattern,
	formatPatternToString,
	formatMessage,
} from "./helper/formatPattern.js";
export type {
	FormattedPart,
	FormatPatternArgs,
	FormatMessageArgs,
} from "./helper/formatPattern.js";
export {
	messageIssues,
	variableNames,
	markupNames,
} from "./helper/messageIssues.js";
export type {
	MessageIssue,
	MessageWithVariants,
} from "./helper/messageIssues.js";
export type { Match } from "./helper/declarations.js";
export { default as patternToString } from "./helper/patternToString.js";
export { default as stringToPattern } from "./helper/stringToPattern.js";
export { createChangeEvent } from "./helper/event.js";
