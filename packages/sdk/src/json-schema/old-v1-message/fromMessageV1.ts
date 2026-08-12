import type {
	BundleNested,
	MessageNested,
	Variant,
} from "../../database/schema.js";
import type { Pattern, VariableReference } from "../pattern.js";
import type { MessageV1, PatternV1 } from "./schemaV1.js";

/**
 * Converts a MessageV1 into a BundleNested
 *
 * @throws If the message cannot be represented in the v1 format
 */
export function fromMessageV1(messageV1: MessageV1): BundleNested {
	const bundleId = messageV1.id;

	const languages = [
		...new Set(messageV1.variants.map((variant) => variant.languageTag)),
	];

	const selectorNames = messageV1.selectors.map((selector) => selector.name);
	const variableNames = new Set(selectorNames);
	const selectors: VariableReference[] = selectorNames.map((name) => ({
		type: "variable-reference",
		name,
	}));

	const messages: MessageNested[] = languages.map((language): MessageNested => {
		const messageId = bundleId + "_" + language;
		//All variants that will be part of this message
		const v1Variants = messageV1.variants.filter(
			(variant) => variant.languageTag === language
		);

		const variants: Variant[] = [];
		let variantIndex = 1;
		for (const v1Variant of v1Variants) {
			if (v1Variant.match.length !== selectorNames.length) {
				throw new Error(
					`Legacy variant for locale "${language}" has ${v1Variant.match.length} matches for ${selectorNames.length} selectors`
				);
			}
			for (const element of v1Variant.pattern) {
				if (element.type === "VariableReference") {
					variableNames.add(element.name);
				}
			}

			variants.push({
				matches: v1Variant.match.map((value, index) =>
					value === "*"
						? { type: "catchall-match", key: selectorNames[index]! }
						: {
								type: "literal-match",
								key: selectorNames[index]!,
								value,
							}
				),
				pattern: fromPatternV1(v1Variant.pattern),
				id: messageId + "_" + variantIndex,
				messageId: messageId,
			});
			variantIndex += 1;
		}

		return {
			id: messageId,
			bundleId: bundleId,
			locale: language,
			selectors: [...selectors],
			variants,
		};
	});

	return {
		id: bundleId,
		declarations: [...variableNames].map((name) => ({
			type: "input-variable",
			name,
		})),
		messages,
	};
}
function fromPatternV1(pattern: PatternV1): Pattern {
	return pattern.map((element) => {
		switch (element.type) {
			case "Text": {
				return {
					type: "text",
					value: element.value,
				};
			}
			case "VariableReference":
				return {
					type: "expression",
					arg: {
						type: "variable-reference",
						name: element.name,
					},
				};
		}
	});
}
