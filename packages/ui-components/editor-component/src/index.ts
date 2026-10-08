//main components
export { default as InlangBundle } from "./stories/inlang-bundle.js";
export { default as InlangMessage } from "./stories/message/inlang-message.js";
export { default as InlangVariant } from "./stories/variant/inlang-variant.js";
export { default as InlangPatternEditor } from "./stories/pattern-editor/inlang-pattern-editor.js";

// composable v13 components
export { default as InlangPatternView } from "./stories/pattern-view/inlang-pattern-view.js";
export { default as InlangMessageForms } from "./stories/message-forms/inlang-message-forms.js";
export type {
	SelectVariantEventDetail,
	AddVariantEventDetail,
} from "./stories/message-forms/inlang-message-forms.js";
export { default as InlangMessagePreview } from "./stories/message-preview/inlang-message-preview.js";
export type {
	ValuesChangeEventDetail,
	VariantMatchEventDetail,
} from "./stories/message-preview/inlang-message-preview.js";
export { previewInputs } from "./helper/previewInputs.js";
export type { PreviewInput, PreviewInputKind } from "./helper/previewInputs.js";

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
export { selectorGroups } from "./helper/selectorGroups.js";
export type { SelectorGroup } from "./helper/selectorGroups.js";
export {
	addSelector,
	removeSelector,
	selectableVariables,
} from "./helper/addSelector.js";
export type {
	AddSelectorArgs,
	RemoveSelectorOptions,
	SelectorBundle,
	SelectorKind,
} from "./helper/addSelector.js";
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
export { languageName } from "./helper/languageName.js";
export { default as patternToString } from "./helper/patternToString.js";
export { default as stringToPattern } from "./helper/stringToPattern.js";
export { createChangeEvent } from "./helper/event.js";
