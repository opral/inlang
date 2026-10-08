// export const mockMessageLintReports: LintReport[] = [
// 	createMockMessageLintReport({
// 		ruleId: "messageBundleLintRule.inlang.missingReference",
// 		messageBundleId: "mock_bundle_human_id",
// 		message_id: "mock_message_id_en",
// 		body: "The bundle `mock_bundle_human_id` is missing the reference message for the locale `en`",
// 	}),
// 	createMockMessageLintReport({
// 		ruleId: "messageBundleLintRule.inlang.missingReference",
// 		messageBundleId: "mock_bundle_human_id",
// 		message_id: "mock_message_id_en",
// 		body: "The bundle `mock_bundle_human_id` is missing the reference message for the locale `en`",
// 		level: "warning",
// 	}),
// ]

// export const mockVariantLintReports: LintReport[] = [
// 	createMockVariantLintReport({
// 		ruleId: "messageBundleLintRule.inlang.missingMessage",
// 		messageBundleId: "mock_bundle_human_id",
// 		message_id: "mock_message_id_de",
// 		variantId: "mock_variant_id_de_one",
// 		body: "Variant test for `de` to check if can be rendered correctly",
// 	}),
// ]

export const mockMessageLintReports = [
  {
    ruleId: "message.inlang.missingMessage",
    type: "message",
    typeId: "mock_message_id_de",
    body: "The bundle `mock_bundle_human_id` is missing the reference message for the locale `en`",
    level: "error",
  },
];

export const mockVariantLintReports = [
  {
    ruleId: "variant.inlang.uppercaseVariant",
    type: "variant",
    typeId: "mock_variant_id_de_one",
    body: "There is a variant that contains the term opral, which is not written in uppercase",
    level: "error",
  },
];

export const mockBundleLintReports = [
  {
    ruleId: "bundle.inlang.aliasIncorrect",
    type: "bundle",
    typeId: "mock_bundle_human_id",
    body: "The alias is incorrect",
    level: "error",
  },
];

export const mockInstalledLintRules = [
  {
    id: "message.inlang.missingMessage",
    displayName: "Missing Message",
    description: "Reports when a message is missing in a message bundle",
    module:
      "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    level: "error",
  },
  {
    id: "variant.inlang.uppercaseVariant",
    displayName: "Uppercase Variant",
    description: "Reports when opral is not written in uppercase",
    module:
      "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    level: "error",
  },
  {
    id: "bundle.inlang.aliasIncorrect",
    displayName: "Alias Incorrect",
    description: "Reports when the alias is incorrect",
    module:
      "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    level: "error",
  },
];
