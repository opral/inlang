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

		// Properties files only support single variants (no selectors)
		const variant = variantsOfMessage[0];
		if (!variant) {
			continue;
		}

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

function serializePattern(pattern: Variant["pattern"]): string {
	let result = "";

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += part.value;
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
