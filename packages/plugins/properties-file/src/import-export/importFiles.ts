import type {
	Bundle,
	Declaration,
	MessageImport,
	Pattern,
	VariantImport,
} from "@inlang/sdk";
import { type plugin } from "../plugin.js";
import { getProperties } from "properties-file";

export const importFiles: NonNullable<(typeof plugin)["importFiles"]> = async ({
	files,
}) => {
	const bundles: Bundle[] = [];
	const messages: MessageImport[] = [];
	const variants: VariantImport[] = [];

	for (const file of files) {
		const content = new TextDecoder().decode(file.content);
		const properties = getProperties(content);

		for (const key in properties) {
			const value = properties[key]!;

			const result = parseBundle(key, file.locale, value);
			messages.push(result.message);
			variants.push(...result.variants);

			const existingBundle = bundles.find((b) => b.id === result.bundle.id);
			if (existingBundle === undefined) {
				bundles.push(result.bundle);
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
	value: string
): {
	bundle: Bundle;
	message: MessageImport;
	variants: VariantImport[];
} {
	const parsed = parsePattern(value);
	const declarations = unique(parsed.declarations);

	return {
		bundle: {
			id: key,
			declarations,
		},
		message: {
			bundleId: key,
			selectors: [],
			locale: locale,
		},
		variants: [
			{
				messageBundleId: key,
				messageLocale: locale,
				matches: [],
				pattern: parsed.pattern,
			},
		],
	};
}

function parsePattern(value: string): {
	declarations: Declaration[];
	pattern: Pattern;
} {
	const pattern: Pattern = [];
	const declarations: Declaration[] = [];
	let buffer = "";

	const flushBuffer = () => {
		if (buffer.length > 0) {
			pattern.push({ type: "text", value: buffer });
			buffer = "";
		}
	};

	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];

		if (char === "{") {
			const closingIndex = value.indexOf("}", index);

			if (closingIndex === -1) {
				buffer += char;
				continue;
			}

			const placeholder = value.slice(index + 1, closingIndex);

			// Only treat as a variable if the placeholder is a valid identifier
			if (
				placeholder.length > 0 &&
				/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(placeholder)
			) {
				flushBuffer();

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

			// Not a valid variable reference, treat as literal text
			buffer += char;
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

const unique = (arr: Array<any>) =>
	[...new Set(arr.map((item) => JSON.stringify(item)))].map((item) =>
		JSON.parse(item)
	);
