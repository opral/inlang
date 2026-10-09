/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
	Bundle,
	LiteralMatch,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import type { plugin } from "../plugin.js";
import { unflatten } from "flat";
import { matchSpecificity } from "./matchSpecificity.js";
import { zeroCategorySelectsNonZero } from "./zeroCategory.js";
import type { PluginSettings } from "../settings.js";

export const exportFiles: NonNullable<(typeof plugin)["exportFiles"]> = async ({
	bundles,
	messages,
	variants,
	settings,
}) => {
	const result: Record<string, Record<string, any>> = {};
	const resultNamespaces: Record<
		string,
		Record<string, Record<string, any>>
	> = {};

	for (const message of messages) {
		const serializedMessages = serializeMessage(
			bundles.find((b) => b.id === message.bundleId)!,
			message,
			variants.filter((v) => v.messageId === message.id),
			settings?.["plugin.inlang.i18next"]
		);

		for (const message of serializedMessages) {
			// no namespace
			if (message.key.includes(":") === false) {
				if (result[message.locale] === undefined) {
					result[message.locale] = {};
				}
				result[message.locale]![message.key] = message.value;
			}
			// namespaces
			else {
				const [namespace, key] = message.key.split(":");
				if (resultNamespaces[namespace!] === undefined) {
					resultNamespaces[namespace!] = {};
				}
				if (resultNamespaces[namespace!]?.[message.locale] === undefined) {
					resultNamespaces[namespace!]![message.locale] = {};
				}
				resultNamespaces[namespace!]![message.locale]![key!] = message.value;
			}
		}
	}

	const withoutNamespace = Object.entries(result).map(([locale, messages]) => ({
		locale,
		content: new TextEncoder().encode(
			JSON.stringify(unflatten(messages), undefined, "\t") + "\n"
		),
		name: `${locale}.json`,
	}));
	const withNamespace = Object.entries(resultNamespaces).flatMap(
		([namespace, locales]) =>
			Object.entries(locales).map(([locale, messages]) => ({
				locale,
				content: new TextEncoder().encode(
					JSON.stringify(unflatten(messages), undefined, "\t") + "\n"
				),
				name: `${namespace}-${locale}.json`,
				// mirrors toBeImportedFiles metadata so that the SDK can resolve
				// the namespaced pathPattern when writing the file back to disk
				// https://github.com/opral/inlang/issues/4356
				metadata: {
					namespace,
				},
			}))
	);
	return [...withoutNamespace, ...withNamespace];
};

function serializeMessage(
	bundle: Bundle,
	message: Message,
	variants: Variant[],
	settings?: PluginSettings
): Array<{ key: string; value: string; locale: string }> {
	// An exact number of `count` (ICU `{count, plural, =0 {…}}`) is either
	// selected on the input itself (`count`, how `_zero` is imported) or on an
	// un-annotated local alias of it (`.local countPluralExact = {$count}`, how
	// `@inlang/plugin-icu1` imports `=0` and editors add exact numbers).
	const exactSelectors = message.selectors
		.map((selector) => selector.name)
		.filter((name) => isExactCountSelector(name, bundle));
	if (exactSelectors.length > 1) {
		throw new Error(
			`i18next export cannot represent the exact-number selectors ${exactSelectors.map((name) => `"${name}"`).join(", ")} of bundle "${bundle.id}": i18next has one exact form, "_zero"`
		);
	}
	const supportedSelectors = new Set([
		"context",
		"pluralType",
		"count",
		"countPlural",
		"countOrdinal",
		...exactSelectors,
	]);
	const unsupportedSelector = message.selectors.find(
		(selector) => !supportedSelectors.has(selector.name)
	);
	if (unsupportedSelector) {
		throw new Error(
			`i18next export cannot represent selector "${unsupportedSelector.name}" in bundle "${bundle.id}"`
		);
	}
	const hasCardinalPlural = message.selectors.some(
		(selector) => selector.name === "countPlural"
	);
	const hasOrdinalPlural = message.selectors.some(
		(selector) => selector.name === "countOrdinal"
	);
	const result = [];
	// keys written by an exact `count = 0` form and by a `zero` category form
	const exactZeroKeys = new Set<string>();
	const zeroCategoryKeys = new Set<string>();

	// emit base keys first and the most specific keys last, mirroring how
	// i18next files are conventionally written
	const sortedVariants = variants
		.map((variant) => ({
			...variant,
			matches: variant.matches.map((match) =>
				exactSelectors.includes(match.key) ? { ...match, key: "count" } : match
			),
		}))
		.sort((a, b) => matchSpecificity(a) - matchSpecificity(b));

	for (const variant of sortedVariants) {
		const pattern = serializePattern(variant.pattern, settings);
		const contextMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "context"
		) as LiteralMatch | undefined;
		const pluralTypeMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "pluralType"
		) as LiteralMatch | undefined;
		const countMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "count"
		) as LiteralMatch | undefined;
		const ordinalMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "countOrdinal"
		) as LiteralMatch | undefined;
		const pluralMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "countPlural"
		) as LiteralMatch | undefined;

		// i18next derives keys as `key[_context][_pluralSuffix]`.
		// variants without a literal match — catchall matches or no match at
		// all, i.e. the base key fallback that importFiles creates for
		// context/plural sibling keys — add no suffix.
		// https://www.i18next.com/translation-function/context#combining-with-plurals
		let key = bundle.id;
		if (contextMatch !== undefined) {
			key += `_${contextMatch.value}`;
		}
		if (countMatch !== undefined) {
			// i18next has exactly one exact-number form: `_zero`, looked up
			// when `count === 0` in every language (before the plural
			// category), but only for cardinal plurals.
			// https://www.i18next.com/translation-function/plurals
			if (Number(countMatch.value) !== 0 || countMatch.value.trim() === "") {
				throw new Error(
					`i18next export cannot represent the exact number =${countMatch.value} of bundle "${bundle.id}" (${message.locale}): i18next only has an exact form for 0 ("_zero"). Use a plural category or remove the form.`
				);
			}
			if (
				pluralTypeMatch?.value === "ordinal" ||
				(hasOrdinalPlural && !hasCardinalPlural)
			) {
				throw new Error(
					`i18next export cannot represent the exact number =0 of the ordinal plural of bundle "${bundle.id}" (${message.locale}): i18next only looks up "_zero" for cardinal plurals.`
				);
			}
			// the exact `count = 0` match serializes back to i18next's
			// `_zero` suffix (its Intl category fallback variant derives the
			// same key), see https://github.com/opral/inlang/issues/4357
			key += "_zero";
			exactZeroKeys.add(key);
		} else if (ordinalMatch !== undefined) {
			// ordinal plurals use the reserved `_ordinal_<category>` suffix,
			// see https://github.com/opral/inlang/issues/4358
			key += `_ordinal_${ordinalMatch.value}`;
		} else if (pluralMatch !== undefined) {
			key +=
				pluralTypeMatch?.value === "ordinal"
					? `_ordinal_${pluralMatch.value}`
					: `_${pluralMatch.value}`;
		}
		if (
			pluralMatch?.value === "zero" &&
			pluralTypeMatch?.value !== "ordinal" &&
			key.endsWith("_zero")
		) {
			zeroCategoryKeys.add(key);
		}
		// two forms can map to one key: in Latvian `_zero` is both the exact
		// `count = 0` form and the plural category "zero" (10, 11–19, …).
		// i18next has one text for both, so refuse to drop either silently.
		const existing = result.find((entry) => entry.key === key);
		if (existing !== undefined) {
			if (existing.value !== pattern) {
				throw new Error(
					`i18next export cannot represent two different texts for "${key}" of bundle "${bundle.id}" (${message.locale}): ${
						key.endsWith("_zero")
							? `i18next uses "_zero" both for count 0 and for the plural category "zero". Give the exact 0 form and the "zero" form the same text.`
							: "both forms map to the same i18next key."
					}`
				);
			}
			continue;
		}
		result.push({ key, value: pattern, locale: message.locale });
	}

	// Where the `zero` category selects more than 0 (Latvian: 10, 11–19, 20,
	// …), i18next uses `_zero` for all of those counts. An exact 0 alone would
	// make them show the text for 0, so it needs a `zero` form with the same
	// text (a differing text is rejected above).
	if (zeroCategorySelectsNonZero(message.locale)) {
		for (const key of exactZeroKeys) {
			if (!zeroCategoryKeys.has(key)) {
				throw new Error(
					`i18next export cannot represent the exact number =0 of bundle "${bundle.id}" (${message.locale}) as "${key}": in ${message.locale}, i18next also uses "_zero" for every count of the plural category "zero" (e.g. 10, 11–19, 20). Add a "zero" form with the same text or remove the exact 0 form.`
				);
			}
		}
	}

	return result;
}

function serializePattern(pattern: Pattern, settings?: PluginSettings): string {
	let result = "";

	const variableRefPattern = settings?.variableReferencePattern ?? ["{{", "}}"];
	const usesAngleBracketVariablePattern =
		variableRefPattern[0] === "<" && variableRefPattern[1] === ">";

	if (
		usesAngleBracketVariablePattern &&
		pattern.some(
			(part) =>
				part.type === "markup-start" ||
				part.type === "markup-end" ||
				part.type === "markup-standalone"
		)
	) {
		throw new Error(
			"Cannot serialize markup when variableReferencePattern is '<' and '>' because both syntaxes would conflict."
		);
	}

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += part.value;
				break;
			case "expression":
				if (part.arg.type !== "variable-reference") {
					throw new Error("Only variable references are supported.");
				}
				if (part.annotation === undefined) {
					result += `${variableRefPattern[0]}${part.arg.name}${variableRefPattern[1]}`;
				} else if (part.annotation.options.length === 0) {
					result += `${variableRefPattern[0]}${part.arg.name}, ${part.annotation.name}${variableRefPattern[1]}`;
				} else {
					throw new Error("Not implemented");
				}
				break;
			case "markup-start":
				result += `<${part.name}>`;
				break;
			case "markup-end":
				result += `</${part.name}>`;
				break;
			case "markup-standalone":
				result += `<${part.name}/>`;
				break;
		}
	}

	return result;
}

/**
 * True for a selector that matches exact values of the `count` input: the
 * input itself, or an un-annotated local alias of it such as
 * `.local countPluralExact = {$count}`.
 */
function isExactCountSelector(name: string, bundle: Bundle): boolean {
	if (name === "count") return true;
	const declaration = bundle.declarations.find(
		(declaration) => declaration.name === name
	);
	return (
		declaration?.type === "local-variable" &&
		declaration.value.annotation === undefined &&
		declaration.value.arg.type === "variable-reference" &&
		declaration.value.arg.name === "count"
	);
}
