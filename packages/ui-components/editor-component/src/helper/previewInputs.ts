import type { Declaration, MessageRow, Pattern, VariantRow } from "@inlang/sdk";
import {
	literalKeys,
	resolveAnnotation,
	resolveInputName,
} from "./declarations.js";

export type PreviewInputKind =
	| "number"
	| "date"
	| "datetime"
	| "select"
	| "text";
export type PreviewInput = {
	name: string;
	kind: PreviewInputKind;
	/** Options for `select` inputs: literal keys used by the variants plus "other". */
	options?: string[];
};

type MessageLike = Pick<MessageRow, "selectors">;

const NUMBER_FUNCTIONS = ["plural", "number", "integer", "percent", "currency"];
const DATE_FUNCTIONS = ["datetime", "date", "time"];

/**
 * Derives one input per input variable of the bundle: a number input when the
 * variable feeds a plural/number function, a date input for datetime, a select
 * for (non-plural) selectors with the keys used by the variants plus "other",
 * and a text input otherwise.
 */
export function previewInputs(
	declarations: readonly Declaration[],
	messages: Array<{ message: MessageLike; variants: readonly VariantRow[] }>
): PreviewInput[] {
	const inputs = declarations.filter((d) => d.type === "input-variable");
	const patterns: Pattern[] = messages.flatMap(({ variants }) =>
		variants.map((variant) => variant.pattern)
	);
	return inputs.map(({ name }) => {
		const functions = new Set<string>();
		const own = resolveAnnotation(name, declarations);
		if (own) functions.add(own.name);
		for (const declaration of declarations) {
			if (declaration.type !== "local-variable") continue;
			if (resolveInputName(declaration.name, declarations) !== name) continue;
			const annotation = resolveAnnotation(declaration.name, declarations);
			if (annotation) functions.add(annotation.name);
		}
		for (const pattern of patterns) {
			for (const part of pattern) {
				if (
					part.type === "expression" &&
					part.annotation &&
					part.arg.type === "variable-reference" &&
					resolveInputName(part.arg.name, declarations) === name
				) {
					functions.add(part.annotation.name);
				}
			}
		}
		const isDate = DATE_FUNCTIONS.some((f) => functions.has(f));
		if (isDate) {
			const withTime = declarations.some(
				(d) =>
					d.type === "local-variable" &&
					resolveInputName(d.name, declarations) === name &&
					resolveAnnotation(d.name, declarations)?.options?.some(
						(o) => o.name === "timeStyle" || o.name === "hour"
					)
			);
			return {
				name,
				kind: withTime || functions.has("time") ? "datetime" : "date",
			};
		}
		if (NUMBER_FUNCTIONS.some((f) => functions.has(f)))
			return { name, kind: "number" };
		const selectorKeys: string[] = [];
		let isSelector = false;
		for (const { message, variants } of messages) {
			for (const selector of message.selectors ?? []) {
				if (resolveInputName(selector.name, declarations) !== name) continue;
				isSelector = true;
				for (const key of literalKeys(selector.name, variants)) {
					if (!selectorKeys.includes(key)) selectorKeys.push(key);
				}
			}
		}
		if (isSelector) {
			return {
				name,
				kind: "select",
				options: [...selectorKeys.filter((k) => k !== "other"), "other"],
			};
		}
		return { name, kind: "text" };
	});
}
