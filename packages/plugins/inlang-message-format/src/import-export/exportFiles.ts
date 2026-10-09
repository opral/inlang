import type {
	Bundle,
	Declaration,
	ExportFile,
	Expression,
	Match,
	Message,
	VariableReference,
	Variant,
} from "@inlang/sdk";
import type { plugin } from "../plugin.js";
import type { ComplexMessage, SimpleMessage } from "../fileSchema.js";
import { sortMessageKeys } from "../utils/sortKeys.js";
import { messageKeyPath, nestMessageKeys } from "../utils/messageKeys.js";
import { orderSelectors } from "../utils/orderSelectors.js";
import { orderVariants } from "../utils/orderVariants.js";
import { keepUnchangedJsonEntries } from "@inlang/sdk/json-formatting";
import { importFiles } from "./importFiles.js";

/**
 * Writes the files of all locales. A file that replaces one of `files` keeps
 * the text of every message that didn't change, its key order and its
 * formatting, so that only edited messages change in git.
 */
export const exportFiles: NonNullable<(typeof plugin)["exportFiles"]> = async (
	args
) =>
	keepUnchangedJsonEntries({
		exported: await exportWholeFiles(args),
		files: args.files,
		settings: args.settings,
		importFiles,
		exportFiles: exportWholeFiles,
		splitKey: flatKeyPath(args.messages),
	});

/**
 * Where the export writes the message of a flat key of a previous file, for
 * `keepUnchangedJsonEntries`, e.g. `"nav.home"` -> `["nav", "home"]`, and
 * `"a.b.c"` -> `["a", "b.c"]` if `a.b` is a message too. Keys that are no
 * message are split at every dot, like the default.
 *
 * The nesting depends on the messages of a locale, which `splitKey` doesn't
 * get. A key that the locales nest differently gets the longest path: a
 * locale that writes it flat at the top finds it there without `splitKey`.
 * The SDK also calls `splitKey` with the keys of nested objects, relative to
 * them; such a key is only read as a message key if it is one. If a path
 * doesn't fit a file, that file is written in full (nothing is lost).
 */
function flatKeyPath(
	messages: ReadonlyArray<Pick<Message, "bundleId" | "locale">>
): (key: string) => string[] {
	const idsByLocale = new Map<string, Set<string>>();
	for (const message of messages) {
		let ids = idsByLocale.get(message.locale);
		if (ids === undefined) idsByLocale.set(message.locale, (ids = new Set()));
		ids.add(message.bundleId);
	}
	const paths = new Map<string, string[]>();
	return (key) => {
		let path = paths.get(key);
		if (path === undefined) {
			const locales = [...idsByLocale.values()].filter((ids) => ids.has(key));
			path =
				locales.length === 0
					? key.split(".")
					: locales
							.map((ids) => messageKeyPath(key, (prefix) => ids.has(prefix)))
							.reduce((a, b) => (b.length > a.length ? b : a));
			paths.set(key, path);
		}
		return path;
	};
}

/**
 * Writes the files of all locales from scratch.
 */
export const exportWholeFiles: NonNullable<
	(typeof plugin)["exportFiles"]
> = async ({ bundles, messages, variants, settings }) => {
	// the messages of each locale by key, in the order of `messages`
	const files: Record<string, Map<string, SimpleMessage | ComplexMessage>> = {};

	// one variant per matches, the last one wins
	const variantsByMatches = new Map<string, Map<string, Variant>>();
	for (const message of messages) {
		variantsByMatches.set(message.id, new Map());
	}
	for (const variant of variants) {
		variantsByMatches
			.get(variant.messageId)
			?.set(JSON.stringify(variant.matches), variant);
	}
	const variantsByMessage = new Map<string, Variant[]>();
	for (const [messageId, byMatches] of variantsByMatches) {
		variantsByMessage.set(messageId, [...byMatches.values()]);
	}
	// the first bundle of an id, like a search
	const bundlesById = new Map<string, Bundle>();
	for (const bundle of bundles) {
		if (!bundlesById.has(bundle.id)) bundlesById.set(bundle.id, bundle);
	}

	// Bundles with a message that is written in the complex form. That message
	// carries the bundle's declarations, so the other messages of the bundle
	// can be plain strings without losing them.
	const bundlesWithComplexMessage = new Set<string>();
	for (const message of messages) {
		if (!isPlainMessage(message, variantsByMessage.get(message.id)!)) {
			bundlesWithComplexMessage.add(message.bundleId);
		}
	}

	for (const message of messages) {
		const bundle = bundlesById.get(message.bundleId);
		(files[message.locale] ??= new Map()).set(
			message.bundleId,
			serializeVariants(
				bundle!,
				message,
				variantsByMessage.get(message.id)!,
				bundlesWithComplexMessage.has(message.bundleId)
			)
		);
	}

	const result: ExportFile[] = [];

	for (const locale in files) {
		const sortDirection =
			settings?.["plugin.inlang.messageFormat"]?.sort ?? undefined;
		const nested = nestMessageKeys(files[locale]!);
		const sortedMessages: Record<string, unknown> = sortDirection
			? sortMessageKeys(nested, sortDirection)
			: nested;
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

/**
 * A message without selectors and with one variant that matches nothing is a
 * plain string in the file, e.g. `"hello": "Hello {name}"`.
 */
function isPlainMessage(message: Message, variants: Variant[]): boolean {
	return (
		message.selectors.length === 0 &&
		variants.length === 1 &&
		variants[0]!.matches.length === 0
	);
}

function serializeVariants(
	bundle: Bundle,
	message: Message,
	variants: Variant[],
	bundleHasComplexMessage: boolean
): SimpleMessage | ComplexMessage {
	// A plain string is written as it was imported, also if another locale of
	// the bundle has a plural or select: the declarations are in that locale's
	// file. Only if no locale of the bundle is written in the complex form, a
	// bundle with local declarations is written in the complex form, which is
	// the only form that keeps them.
	if (
		isPlainMessage(message, variants) &&
		(bundleHasComplexMessage ||
			bundle.declarations.some((d) => d.type !== "input-variable") === false)
	) {
		return serializePattern(variants[0]!.pattern);
	}

	// alphabetical, as every earlier version wrote them, so that files
	// don't change when the plugin is upgraded. Only an exact number
	// (ICU `=0`) moves directly before its plural, where it has to be
	// to win over a plural category that also selects the number.
	const selectors = orderSelectors(
		message.selectors.map((s) => s.name).sort(),
		bundle.declarations
	);

	const entries = [];
	for (const variant of orderVariants(
		variants,
		selectors,
		bundle.declarations,
		message.locale
	)) {
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
			selectors,
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
					result += serializeExpression(part.arg.name, part.annotation);
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

/**
 * `{name}`, or `{name: function option=value}` like a local declaration, e.g.
 * `{count: icu:pound offset=1}`.
 */
function serializeExpression(
	name: string,
	annotation: Expression["annotation"]
): string {
	if (annotation === undefined) return `{${name}}`;
	if (
		/^[^\s:|{}]+$/.test(name) === false ||
		/^[^\s=|{}]+$/.test(annotation.name) === false ||
		annotation.options.some(
			(option) => /^[^\s=|{}$]+$/.test(option.name) === false
		)
	) {
		throw new Error(
			`Cannot serialize the function "${annotation.name}" on "${name}": names in an annotated placeholder can't contain whitespace or any of ":=|{}$".`
		);
	}
	const options = annotation.options.map((option) =>
		option.value.type === "variable-reference"
			? ` ${option.name}=$${option.value.name}`
			: ` ${option.name}=${serializeOptionLiteral(option.value.value)}`
	);
	return `{${name}: ${annotation.name}${options.join("")}}`;
}

/**
 * A literal option value is written as is if it is unambiguous, and quoted
 * as `|value|` otherwise.
 */
function serializeOptionLiteral(value: string): string {
	if (/^[^\s|\\{}$][^\s|\\{}]*$/.test(value)) return value;
	return `|${escapeMarkupLiteral(value)}|`;
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
			result = `local ${declaration.name} = "${declaration.value.arg.value.replace(/[\\"]/g, "\\$&")}"`;
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
