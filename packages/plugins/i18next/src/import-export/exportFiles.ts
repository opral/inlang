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
	const supportedSelectors = new Set([
		"context",
		"count",
		"countPlural",
		"countOrdinal",
	]);
	const unsupportedSelector = message.selectors.find(
		(selector) => !supportedSelectors.has(selector.name)
	);
	if (unsupportedSelector) {
		throw new Error(
			`i18next export cannot represent selector "${unsupportedSelector.name}" in bundle "${bundle.id}"`
		);
	}
	const result = [];

	// emit base keys first and the most specific keys last, mirroring how
	// i18next files are conventionally written
	const sortedVariants = [...variants].sort(
		(a, b) => matchSpecificity(a) - matchSpecificity(b)
	);

	for (const variant of sortedVariants) {
		const pattern = serializePattern(variant.pattern, settings);
		const contextMatch = variant.matches.find(
			(match) => match.type === "literal-match" && match.key === "context"
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
		if (countMatch?.value === "0") {
			// the exact `count = 0` match serializes back to i18next's
			// `_zero` suffix (its Intl category fallback variant derives the
			// same key), see https://github.com/opral/inlang/issues/4357
			key += "_zero";
		} else if (ordinalMatch !== undefined) {
			// ordinal plurals use the reserved `_ordinal_<category>` suffix,
			// see https://github.com/opral/inlang/issues/4358
			key += `_ordinal_${ordinalMatch.value}`;
		} else if (pluralMatch !== undefined) {
			key += `_${pluralMatch.value}`;
		}
		result.push({ key, value: pattern, locale: message.locale });
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
