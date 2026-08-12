import type { BundleNested, Match } from "../../database/schema.js";
import type { Pattern } from "../pattern.js";
import type {
	ExpressionV1,
	MessageV1,
	PatternV1,
	VariantV1,
} from "./schemaV1.js";

/**
 * Converts a BundleNested into a legacy format.
 *
 * @throws If the message cannot be represented in the v1 format
 */
export function toMessageV1(bundle: BundleNested): MessageV1 {
	const variants: VariantV1[] = [];
	const selectorNames =
		bundle.messages[0]?.selectors.map((selector) => selector.name) ?? [];

	for (const message of bundle.messages) {
		if (
			message.selectors.length !== selectorNames.length ||
			message.selectors.some(
				(selector, index) => selector.name !== selectorNames[index]
			)
		) {
			throw new Error(
				"MessageV1 conversion requires identical selectors in every locale"
			);
		}

		// collect all variants
		for (const variant of message.variants) {
			variants.push({
				languageTag: message.locale,
				match: toV1Match(variant.matches, selectorNames),
				pattern: toV1Pattern(variant.pattern),
			});
		}
	}

	const selectors: ExpressionV1[] = selectorNames.map((name) => ({
		type: "VariableReference",
		name,
	}));

	return {
		id: bundle.id,
		alias: {},
		variants,
		selectors,
	};
}

function toV1Match(matches: Match[], selectorNames: string[]): string[] {
	const matchesByKey = new Map<string, Match>();
	for (const match of matches) {
		if (matchesByKey.has(match.key)) {
			throw new Error(
				`MessageV1 conversion found duplicate match "${match.key}"`
			);
		}
		matchesByKey.set(match.key, match);
	}
	if (
		matchesByKey.size !== selectorNames.length ||
		selectorNames.some((name) => !matchesByKey.has(name))
	) {
		throw new Error(
			"MessageV1 conversion requires one match for every selector"
		);
	}
	return selectorNames.map((selectorName) => {
		const match = matchesByKey.get(selectorName)!;
		return match.type === "catchall-match" ? "*" : match.value;
	});
}

/**
 * @throws If the pattern cannot be represented in the v1 format
 */
function toV1Pattern(pattern: Pattern): PatternV1 {
	return pattern.map((element) => {
		switch (element.type) {
			case "text": {
				return {
					type: "Text",
					value: element.value,
				};
			}

			case "expression": {
				if (element.arg.type === "variable-reference") {
					return {
						type: "VariableReference",
						name: element.arg.name,
					};
				}
				throw new Error(`Unsupported expression argument type`);
			}

			case "markup-start":
			case "markup-end":
			case "markup-standalone": {
				throw new Error(
					"Markup placeholders are not supported in MessageV1 conversion"
				);
			}

			default: {
				throw new Error(`Unsupported pattern element type`);
			}
		}
	});
}
