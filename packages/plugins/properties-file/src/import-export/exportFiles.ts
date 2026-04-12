import type {
	Bundle,
	ExportFile,
	Message,
	Variant,
} from "@inlang/sdk";
import { type plugin, PLUGIN_KEY } from "../plugin.js";

export const exportFiles: NonNullable<(typeof plugin)["exportFiles"]> = async ({
	bundles,
	messages,
	variants,
	settings,
}) => {
	const files: Record<
		string,
		Array<{ key: string; value: string }>
	> = {};

	for (const message of messages) {
		const bundle = bundles.find((b) => b.id === message.bundleId);
		if (!bundle) {
			continue;
		}

		const variantsOfMessage = variants.filter(
			(v) => v.messageId === message.id
		);

		if (variantsOfMessage.length === 0) {
			continue;
		}

		// Properties files do not support plural selectors or multi-variant messages.
		// Throw an explicit error rather than silently dropping variants.
		if (variantsOfMessage.length > 1) {
			throw new Error(
				`Message "${bundle.id}" (locale "${message.locale}") has ${variantsOfMessage.length} variants. ` +
					`The .properties file format does not support multiple variants (plural/select). ` +
					`Consider using a format that supports selectors, or simplify the message to a single variant.`
			);
		}

		const variant = variantsOfMessage[0]!;

		const serialized = serializePattern(variant.pattern);

		if (!files[message.locale]) {
			files[message.locale] = [];
		}
		files[message.locale]!.push({
			key: bundle.id,
			value: serialized,
		});
	}

	const sortDirection = settings?.[PLUGIN_KEY]?.sort ?? undefined;

	const result: ExportFile[] = [];

	for (const locale in files) {
		let entries = files[locale]!;

		if (sortDirection === "asc") {
			entries = entries.sort((a, b) => a.key.localeCompare(b.key));
		} else if (sortDirection === "desc") {
			entries = entries.sort((a, b) => b.key.localeCompare(a.key));
		}

		const lines: string[] = [];
		for (const entry of entries) {
			lines.push(`${entry.key} = ${entry.value}`);
		}

		const content = lines.join("\n") + "\n";

		result.push({
			locale,
			content: new TextEncoder().encode(content),
			name: locale + ".properties",
		});
	}

	return result;
};

/**
 * Escape a text value for safe inclusion in a .properties file.
 *
 * The .properties format treats backslashes, newlines, carriage returns,
 * and tabs as control characters. These must be escaped to preserve the
 * original value through a roundtrip.
 */
function escapePropertyValue(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

function serializePattern(pattern: Variant["pattern"]): string {
	let result = "";

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += escapePropertyValue(part.value);
				break;
			case "expression":
				if (part.arg.type === "variable-reference") {
					result += `{${part.arg.name}}`;
					break;
				}
				throw new Error("Unsupported expression type");
			default:
				throw new Error("Unsupported pattern element type");
		}
	}
	return result;
}
