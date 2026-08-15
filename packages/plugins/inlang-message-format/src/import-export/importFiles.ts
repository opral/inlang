import type {
	Attribute,
	Match,
	Option,
	Variant,
	MessageImport,
	VariantImport,
	Bundle,
	Pattern,
	Declaration,
	VariableReference,
	Message,
} from "@inlang/sdk";
import type { plugin } from "../plugin.js";
import { flatten } from "flat";
import type {
	ComplexMessage,
	ComplexMessageObject,
	SimpleMessage,
} from "../fileSchema.js";

export const importFiles: NonNullable<(typeof plugin)["importFiles"]> = async ({
	files,
}) => {
	const bundles: Bundle[] = [];
	const bundlesById = new Map<string, Bundle>();
	const messages: MessageImport[] = [];
	const variants: VariantImport[] = [];

	for (const file of files) {
		const json = JSON.parse(new TextDecoder().decode(file.content));
		const flattened = flatten(json, { safe: true }) as Record<string, string>;

		for (const key in flattened) {
			if (key === "$schema") {
				continue;
			}
			const result = parseBundle(key, file.locale, flattened[key]!);
			messages.push(result.message);
			variants.push(...result.variants);

			const existingBundle = bundlesById.get(result.bundle.id);
			if (existingBundle === undefined) {
				bundles.push(result.bundle);
				bundlesById.set(result.bundle.id, result.bundle);
			} else {
				// merge declarations without duplicates
				existingBundle.declarations = unique([
					...existingBundle.declarations,
					...result.bundle.declarations,
				]);
			}
		}
	}

	return { bundles, messages, variants };
};

function parseBundle(
	key: string,
	locale: string,
	value: SimpleMessage | ComplexMessage
): {
	bundle: Bundle;
	message: MessageImport;
	variants: VariantImport[];
} {
	const parsed = parseVariants(key, locale, value);
	const declarations = unique(parsed.declarations);
	addInputDeclarationsForLocalReferences(declarations);
	const selectors = unique(parsed.selectors);

	const undeclaredSelectors = selectors.filter(
		(selector) =>
			declarations.find((d) => d.name === selector.name) === undefined
	);

	for (const undeclaredSelector of undeclaredSelectors) {
		declarations.push({
			type: "input-variable",
			name: undeclaredSelector.name,
		});
	}

	return {
		bundle: {
			id: key,
			declarations,
		},
		message: {
			bundleId: key,
			selectors,
			locale: locale,
		},
		variants: parsed.variants,
	};
}

/**
 * Local declarations may reference inputs without repeating them as explicit
 * `input` declarations. Keep the SDK bundle declarations complete so
 * consumers can generate the correct message function signature.
 */
function addInputDeclarationsForLocalReferences(
	declarations: Declaration[]
): void {
	const declaredNames = new Set(
		declarations.map((declaration) => declaration.name)
	);

	for (const declaration of declarations) {
		if (declaration.type !== "local-variable") {
			continue;
		}

		const references: string[] = [];
		if (declaration.value.arg.type === "variable-reference") {
			references.push(declaration.value.arg.name);
		}
		for (const option of declaration.value.annotation?.options ?? []) {
			if (option.value.type === "variable-reference") {
				references.push(option.value.name);
			}
		}

		for (const name of references) {
			if (declaredNames.has(name)) {
				continue;
			}
			declarations.push({ type: "input-variable", name });
			declaredNames.add(name);
		}
	}
}

function parseVariants(
	bundleId: string,
	locale: string,
	value: SimpleMessage | ComplexMessage
): {
	variants: VariantImport[];
	declarations: Declaration[];
	selectors: VariableReference[];
} {
	// single variant
	if (typeof value === "string") {
		const parsed = parsePattern(value);
		return {
			variants: [
				{
					messageBundleId: bundleId,
					messageLocale: locale,
					matches: [],
					pattern: parsed.pattern,
				},
			],
			// legacy reasons that input variables are derived from the pattern
			declarations: parsed.declarations,
			selectors: [],
		};
	}
	const complexMessage = value[0]!;
	// multi variant
	const variants: VariantImport[] = [];
	const selectors: VariableReference[] = (
		(complexMessage["selectors"] as string[]) ?? []
	).map((name) => ({
		type: "variable-reference",
		name,
	}));

	const declarations = new Set<Declaration>();

	for (const declaration of complexMessage["declarations"] ??
		([] as string[])) {
		declarations.add(parseDeclaration(declaration));
	}

	const detectedSelectors = new Set<VariableReference>();

	for (const [match, pattern] of Object.entries(complexMessage["match"])) {
		const parsed = parsePattern(pattern);
		const parsedMatches = parseMatches(match);
		for (const declaration of parsed.declarations) {
			let isDuplicate = false;
			for (const existingDeclaration of declarations) {
				if (existingDeclaration.name === declaration.name) {
					isDuplicate = true;
					break;
				}
			}
			if (isDuplicate) {
				break;
			}
			declarations.add(declaration);
		}
		for (const selector of parsedMatches.selectors) {
			detectedSelectors.add(selector);
		}
		variants.push({
			messageBundleId: bundleId,
			messageLocale: locale,
			matches: parsedMatches.matches,
			pattern: parsed.pattern,
		});
	}
	return {
		variants,
		declarations: Array.from(declarations),
		selectors: unique([...selectors, ...Array.from(detectedSelectors)]),
	};
}

function parsePattern(value: string): {
	declarations: Declaration[];
	pattern: Pattern;
} {
	const pattern: Variant["pattern"] = [];
	const declarations: Declaration[] = [];
	let buffer = "";

	// Collects literal text (including escaped braces/backslashes) until we hit
	// an expression boundary or the end.
	const flushBuffer = () => {
		if (buffer.length > 0) {
			pattern.push({ type: "text", value: buffer });
			buffer = "";
		}
	};

	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === "\\") {
			const next = value[index + 1];
			if (next === "{" || next === "}" || next === "\\") {
				buffer += next;
				index += 1;
				continue;
			}
			buffer += char;
			continue;
		}

		if (char === "{") {
			const closingIndex = findPlaceholderClosingIndex(value, index);

			if (closingIndex === -1) {
				buffer += char;
				continue;
			}
			const placeholder = value.slice(index + 1, closingIndex);

			const markupNode = parseMarkupPlaceholder(placeholder);
			flushBuffer();

			if (markupNode) {
				for (const option of markupNode.options ?? []) {
					if (option.value.type === "variable-reference") {
						declarations.push({
							type: "input-variable",
							name: option.value.name,
						});
					}
				}
				pattern.push(markupNode);
				index = closingIndex;
				continue;
			}

			// this is a heuristic. there is no guarentee that the variable might not be
			// a local variable. only use the returned declarations in a single variant
			// context
			declarations.push({
				type: "input-variable",
				name: placeholder,
			});
			pattern.push({
				type: "expression",
				arg: { type: "variable-reference", name: placeholder },
			});
			index = closingIndex;
			continue;
		}

		buffer += char;
	}

	flushBuffer();

	return {
		declarations,
		pattern,
	};
}

function findPlaceholderClosingIndex(value: string, openingIndex: number): number {
	let inQuotedLiteral = false;

	for (let cursor = openingIndex + 1; cursor < value.length; cursor += 1) {
		const current = value[cursor]!;

		if (inQuotedLiteral && current === "\\") {
			cursor += 1;
			continue;
		}

		if (current === "|") {
			inQuotedLiteral = !inQuotedLiteral;
			continue;
		}

		if (current === "}" && inQuotedLiteral === false) {
			return cursor;
		}
	}

	return -1;
}

function parseMarkupPlaceholder(placeholder: string):
	| {
			type: "markup-start" | "markup-end" | "markup-standalone";
			name: string;
			options?: Option[];
			attributes?: Attribute[];
	  }
	| undefined {
	if (placeholder.startsWith("#")) {
		const parsed = parseMarkupBody(placeholder.slice(1), true);
		if (!parsed) {
			throw new Error(`Invalid markup placeholder: {${placeholder}}`);
		}
		const { name, options, attributes, standalone } = parsed;
		return {
			type: standalone ? "markup-standalone" : "markup-start",
			name,
			...(options.length > 0 ? { options } : {}),
			...(attributes.length > 0 ? { attributes } : {}),
		};
	}

	if (placeholder.startsWith("/")) {
		const parsed = parseMarkupBody(placeholder.slice(1), false);
		if (!parsed) {
			throw new Error(`Invalid markup placeholder: {${placeholder}}`);
		}
		const { name, options, attributes } = parsed;
		return {
			type: "markup-end",
			name,
			...(options.length > 0 ? { options } : {}),
			...(attributes.length > 0 ? { attributes } : {}),
		};
	}

	return undefined;
}

function parseMarkupBody(
	body: string,
	allowStandalone: boolean
):
	| {
			name: string;
			options: Option[];
			attributes: Attribute[];
			standalone: boolean;
	  }
	| undefined {
	let index = 0;
	const options: Option[] = [];
	const attributes: Attribute[] = [];
	let standalone = false;

	index = skipWhitespace(body, index);
	const nameToken = readNameToken(body, index);
	if (!nameToken) return undefined;
	const name = nameToken.value;
	index = nameToken.nextIndex;

	while (index < body.length) {
		index = skipWhitespace(body, index);
		if (index >= body.length) break;

		if (allowStandalone && body[index] === "/") {
			const trailing = body.slice(index + 1).trim();
			if (trailing.length > 0) return undefined;
			standalone = true;
			index = body.length;
			break;
		}

		if (body[index] === "@") {
			index += 1;
			const attributeName = readIdentifier(body, index);
			if (!attributeName) return undefined;
			index = attributeName.nextIndex;
			index = skipWhitespace(body, index);

			if (body[index] === "=") {
				index += 1;
				index = skipWhitespace(body, index);
				const attributeValue = parseMarkupValue(body, index);
				if (!attributeValue) return undefined;
				if (attributeValue.value.type === "variable-reference") {
					// Attributes only support literal values.
					return undefined;
				}
				attributes.push({
					name: attributeName.value,
					value: attributeValue.value,
				});
				index = attributeValue.nextIndex;
			} else {
				attributes.push({ name: attributeName.value, value: true });
			}
			continue;
		}

		const optionName = readIdentifier(body, index);
		if (!optionName) return undefined;
		index = optionName.nextIndex;
		index = skipWhitespace(body, index);
		if (body[index] !== "=") return undefined;
		index += 1;
		index = skipWhitespace(body, index);

		const optionValue = parseMarkupValue(body, index);
		if (!optionValue) return undefined;
		options.push({
			name: optionName.value,
			value: optionValue.value,
		});
		index = optionValue.nextIndex;
	}

	return { name, options, attributes, standalone };
}

function skipWhitespace(value: string, index: number): number {
	while (index < value.length && /\s/.test(value[index]!)) {
		index += 1;
	}
	return index;
}

function readNameToken(
	value: string,
	index: number
): { value: string; nextIndex: number } | undefined {
	return readIdentifier(value, index);
}

function readIdentifier(
	value: string,
	index: number
): { value: string; nextIndex: number } | undefined {
	let cursor = index;
	while (
		cursor < value.length &&
		/\s/.test(value[cursor]!) === false &&
		value[cursor] !== "=" &&
		value[cursor] !== "/" &&
		value[cursor] !== "@"
	) {
		cursor += 1;
	}
	const parsed = value.slice(index, cursor);
	if (parsed.length === 0) return undefined;
	return { value: parsed, nextIndex: cursor };
}

function parseMarkupValue(
	value: string,
	index: number
): { value: Option["value"]; nextIndex: number } | undefined {
	if (index >= value.length) return undefined;

	if (value[index] === "|") {
		let cursor = index + 1;
		let literal = "";
		while (cursor < value.length) {
				const char = value[cursor]!;
				if (char === "\\") {
					const next = value[cursor + 1];
					if (next === "|" || next === "\\" || next === "}") {
						literal += next;
						cursor += 2;
						continue;
					}
				literal += char;
				cursor += 1;
				continue;
			}
			if (char === "|") {
				return {
					value: { type: "literal", value: literal },
					nextIndex: cursor + 1,
				};
			}
			literal += char;
			cursor += 1;
		}
		return undefined;
	}

	if (value[index] === "$") {
		const variable = readIdentifier(value, index + 1);
		if (!variable) return undefined;
		return {
			value: { type: "variable-reference", name: variable.value },
			nextIndex: variable.nextIndex,
		};
	}

	const literal = readIdentifier(value, index);
	if (!literal) return undefined;
	return {
		value: { type: "literal", value: literal.value },
		nextIndex: literal.nextIndex,
	};
}

// input: `platform=android,userGender=male`
// output: { platform: "android", userGender: "male" }
function parseMatches(value: string): {
	matches: Match[];
	selectors: Message["selectors"];
} {
	const stripped = value.replace(" ", "");

	const matches: Match[] = [];
	const selectors: Message["selectors"] = [];

	const parts = stripped.split(",");
	for (const part of parts) {
		const [key, value] = part.split("=");
		if (!key || !value) {
			continue;
		}
		if (value === "*") {
			matches.push({
				type: "catchall-match",
				key: key,
			});
		} else {
			matches.push({
				type: "literal-match",
				key,
				value,
			});
		}
		selectors.push({
			type: "variable-reference",
			name: key,
		});
	}
	return { matches, selectors };
}

const unique = (arr: Array<any>) =>
	[...new Set(arr.map((item) => JSON.stringify(item)))].map((item) =>
		JSON.parse(item)
	);

function parseDeclaration(value: string): Declaration {
	if (value.startsWith("input")) {
		return {
			type: "input-variable",
			name: value.slice(6).trim(),
		};
	}
	// local countPlural = count : plural
	else if (value.startsWith("local")) {
		const match = value.match(/local (\w+) = (\w+): (\w+)(.*)/);
		const [, name, ref, fn, optionsString] = match!;
		const options: {
			name: string;
			value:
				| { type: "literal"; value: string }
				| { type: "variable-reference"; name: string };
		}[] = [];

		for (const optionMatch of (optionsString ?? "").matchAll(
			/(\w+)\s*=\s*([^\s]+)/g
		)) {
			const optionName = optionMatch[1];
			const optionValue = optionMatch[2];

			if (!optionName || !optionValue) {
				continue;
			}

			options.push({
				name: optionName,
				value:
					optionValue.startsWith("$") && optionValue.length > 1
						? {
								type: "variable-reference",
								name: optionValue.slice(1),
							}
						: {
								type: "literal",
								value: optionValue,
							},
			});
		}

		return {
			type: "local-variable",
			name: name!.trim(),
			value: {
				type: "expression",
				arg: {
					type: "variable-reference",
					name: ref!.trim(),
				},
				annotation: fn
					? {
							type: "function-reference",
							name: fn.trim(),
							options: options ?? [],
						}
					: undefined,
			},
		};
	}
	throw new Error("Unsupported declaration type");
}
