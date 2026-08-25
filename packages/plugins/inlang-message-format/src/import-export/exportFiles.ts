import type {
	Bundle,
	Declaration,
	ExportFile,
	Match,
	Message,
	VariableReference,
	Variant,
} from "@inlang/sdk";
import type { plugin } from "../plugin.js";
import type {
	ComplexMessage,
	FileSchema,
	SimpleMessage,
} from "../fileSchema.js";
import { unflatten } from "flat";
import { sortMessageKeys } from "../utils/sortKeys.js";

export const exportFiles: NonNullable<(typeof plugin)["exportFiles"]> = async ({
	bundles,
	messages,
	variants,
	settings,
}) => {
	const files: Record<string, FileSchema> = {};

	for (const message of messages) {
		const bundle = bundles.find((b) => b.id === message.bundleId);
		const variantsOfMessage = [
			...variants
				.reduce((r, v) => {
					if (v.messageId === message.id) r.set(JSON.stringify(v.matches), v);
					return r;
				}, new Map<string, (typeof variants)[number]>())
				.values(),
		];
		files[message.locale] = {
			...files[message.locale],
			...serializeMessage(bundle!, message, variantsOfMessage),
		};
	}

	const result: ExportFile[] = [];

	for (const locale in files) {
		const sortDirection =
			settings?.["plugin.inlang.messageFormat"]?.sort ?? undefined;
		const unflattened = unflatten(files[locale]) as Record<string, unknown>;
		const sortedMessages: Record<string, unknown> = sortDirection
			? sortMessageKeys(unflattened, sortDirection)
			: unflattened;
		result.push({
			locale,
			// beautify the json
			content: new TextEncoder().encode(
				JSON.stringify(
					{
						// increase DX by providing auto complete in IDEs
						$schema: "https://inlang.com/schema/inlang-message-format",
						...sortedMessages,
					},
					undefined,
					"\t"
				)
			),
			name: locale + ".json",
		});
	}

	return result;
};

function serializeMessage(
	bundle: Bundle,
	message: Message,
	variants: Variant[]
): Record<string, SimpleMessage | ComplexMessage> {
	const key = message.bundleId;
	const value = serializeVariants(bundle, message, variants);
	return { [key]: value };
}

function serializeVariants(
	bundle: Bundle,
	message: Message,
	variants: Variant[]
): SimpleMessage | ComplexMessage {
	// single variant
	if (variants.length === 1) {
		if (
			message.selectors.length === 0 &&
			bundle.declarations.some((d) => d.type !== "input-variable") === false
		) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return serializePattern(variants[0]!.pattern);
		}
	}

	const entries = [];
	for (const variant of variants) {
		const matches = [...variant.matches];
		if (matches.length === 0) {
			for (const part of variant.pattern) {
				if (
					part.type === "expression" &&
					part.arg.type === "variable-reference"
				) {
					matches.push({ key: part.arg.name, type: "catchall-match" });
				}
			}
		}

		const pattern = serializePattern(variant.pattern);
		const match = serializeMatcher(matches);
		entries.push([match, pattern]);
	}

	return [
		{
			// naively adding all declarations, even if unused in the variants
			// can be optimized later.
			declarations: [
				...bundle.declarations
					.filter((declaration) => declaration.type === "input-variable")
					.map(serializeDeclaration)
					.sort(),
				...bundle.declarations
					.filter((declaration) => declaration.type === "local-variable")
					.map(serializeDeclaration),
			],
			selectors: message.selectors.map((s) => s.name).sort(),
			match: Object.fromEntries(entries),
		},
	];
}

function serializePattern(pattern: Variant["pattern"]): string {
	let result = "";

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += escapePatternText(part.value);
				break;
			case "expression":
				if (part.arg.type === "variable-reference") {
					result += `{${part.arg.name}}`;
					break;
				}
				throw new Error("Unsupported expression type");
			case "markup-start":
				result += serializeMarkup(
					"#",
					part.name,
					part.options,
					part.attributes,
					false
				);
				break;
			case "markup-end":
				result += serializeMarkup(
					"/",
					part.name,
					part.options,
					part.attributes,
					false
				);
				break;
			case "markup-standalone":
				result += serializeMarkup(
					"#",
					part.name,
					part.options,
					part.attributes,
					true
				);
				break;
			default:
				throw new Error("Unsupported pattern element type");
		}
	}
	return result;
}

function escapePatternText(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
}

function serializeMarkup(
	prefix: "#" | "/",
	name: string,
	options:
		| Array<{
				name: string;
				value:
					| { type: "literal"; value: string }
					| { type: "variable-reference"; name: string };
		  }>
		| undefined,
	attributes:
		| Array<{
				name: string;
				value: { type: "literal"; value: string } | true;
		  }>
		| undefined,
	standalone: boolean
): string {
	const serializedOptions = (options ?? []).map((option) => {
		if (option.value.type === "variable-reference") {
			return `${option.name}=$${option.value.name}`;
		}
		return `${option.name}=|${escapeMarkupLiteral(option.value.value)}|`;
	});

	const serializedAttributes = (attributes ?? []).map((attribute) => {
		if (attribute.value === true) {
			return `@${attribute.name}`;
		}
		return `@${attribute.name}=|${escapeMarkupLiteral(attribute.value.value)}|`;
	});

	const metadata = [...serializedOptions, ...serializedAttributes].join(" ");
	if (metadata.length === 0) {
		return standalone ? `{${prefix}${name}/}` : `{${prefix}${name}}`;
	}
	if (standalone) {
		return `{${prefix}${name} ${metadata}/}`;
	}
	return `{${prefix}${name} ${metadata}}`;
}

function escapeMarkupLiteral(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\|/g, "\\|")
		.replace(/}/g, "\\}");
}

// input: { platform: "android", userGender: "male" }
// output: `platform=android,userGender=male`
function serializeMatcher(matches: Match[]): string {
	const parts = [...matches]
		.sort((a, b) => a.key.localeCompare(b.key))
		.map((match) =>
			match.type === "literal-match"
				? `${match.key}=${match.value}`
				: `${match.key}=*`
		);

	return parts.join(", ");
}

function serializeDeclaration(declaration: Declaration): string {
	if (declaration.type === "input-variable") {
		return `input ${declaration.name}`;
	} else if (declaration.type === "local-variable") {
		let result = "";
		if (declaration.value.arg.type === "variable-reference") {
			result = `local ${declaration.name} = ${declaration.value.arg.name}`;
		} else if (declaration.value.arg.type === "literal") {
			result = `local ${declaration.name} = "${declaration.value.arg.value}"`;
		}
		if (declaration.value.annotation) {
			result += `: ${declaration.value.annotation.name}`;
		}
		if (declaration.value.annotation?.options) {
			for (const option of declaration.value?.annotation?.options ?? []) {
				if (option.value.type === "literal") {
					result += ` ${option.name}=${option.value.value}`;
					continue;
				}
				if (option.value.type === "variable-reference") {
					result += ` ${option.name}=$${option.value.name}`;
					continue;
				}
				throw new Error("Unsupported option type");
			}
		}
		return result;
	}
	throw new Error("Unsupported declaration type");
}
