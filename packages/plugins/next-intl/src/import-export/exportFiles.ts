import type { InlangPlugin } from "@inlang/sdk";
import type { PluginSettings } from "../settings.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { keepUnchangedJsonEntries } from "@inlang/sdk/json-formatting";
import { getMessagePath } from "./messageId.js";
import { importFiles } from "./importFiles.js";

type Pattern = Array<
	| { type: "text"; value: string }
	| {
			type: "expression";
			arg:
				| { type: "variable-reference"; name: string }
				| { type: "literal"; value: string };
			annotation?: unknown;
	  }
	| { type: "markup-start"; name: string }
	| { type: "markup-end"; name: string }
	| { type: "markup-standalone"; name: string }
>;
type Bundle = { id: string };
type Message = { id: string; bundleId: string; locale: string };
type Variant = { messageId: string; pattern: Pattern };

type ExportFiles = NonNullable<
	InlangPlugin<{ [PLUGIN_KEY]: PluginSettings }>["exportFiles"]
>;

/**
 * Writes the files and keeps the text of the entries of the previous files
 * (`files`) that didn't change.
 */
export const exportFiles: ExportFiles = async (args) =>
	keepUnchangedJsonEntries({
		exported: await exportWholeFiles(args),
		files: args.files,
		settings: args.settings,
		importFiles,
		exportFiles: exportWholeFiles,
	});

/**
 * Writes whole files, without the previous files.
 */
const exportWholeFiles: ExportFiles = async ({
	bundles,
	messages,
	variants,
	settings,
}): Promise<
	Array<{
		locale: string;
		content: Uint8Array;
		name: string;
		metadata?: Record<string, any>;
	}>
> => {
	const result: Record<string, Array<ExportMessage>> = {};
	const resultNamespaces: Record<
		string,
		Record<string, Array<ExportMessage>>
	> = {};
	const pluginSettings = settings?.[PLUGIN_KEY];
	const namespaces =
		pluginSettings && typeof pluginSettings.pathPattern === "object"
			? Object.keys(pluginSettings.pathPattern)
			: [];

	const bundlesById = new Map(
		(bundles as Bundle[]).map((bundle) => [bundle.id, bundle])
	);
	const variantsByMessageId = new Map<string, Variant[]>();
	for (const variant of variants as Variant[]) {
		const variantsOfMessage = variantsByMessageId.get(variant.messageId) ?? [];
		variantsOfMessage.push(variant);
		variantsByMessageId.set(variant.messageId, variantsOfMessage);
	}

	for (const message of messages as Message[]) {
		const bundle = bundlesById.get(message.bundleId);
		if (bundle === undefined) {
			continue;
		}

		const variantsOfMessage = variantsByMessageId.get(message.id) ?? [];

		for (const variant of variantsOfMessage) {
			const value = serializePattern(variant.pattern, pluginSettings);
			const namespace = resolveNamespaceFromBundleId(bundle.id, namespaces);

			if (namespace === undefined) {
				result[message.locale] ??= [];
				result[message.locale]!.push({
					key: bundle.id,
					path: getCurrentMessagePath({
						messageId: message.id,
						currentKey: bundle.id,
					}),
					value,
				});
			} else {
				const key = removeNamespaceFromBundleId(bundle.id, namespace);
				resultNamespaces[namespace] ??= {};
				resultNamespaces[namespace]![message.locale] ??= [];
				resultNamespaces[namespace]![message.locale]!.push({
					key,
					path: getCurrentMessagePath({
						messageId: message.id,
						currentKey: key,
					}),
					value,
				});
			}
		}
	}

	const withoutNamespace = Object.entries(result).map(([locale, messages]) => ({
		locale,
		content: encodeJson(messages),
		name: `${locale}.json`,
	}));
	const withNamespace = Object.entries(resultNamespaces).flatMap(
		([namespace, locales]) =>
			Object.entries(locales).map(([locale, messages]) => ({
				locale,
				content: encodeJson(messages),
				name: `${namespace}-${locale}.json`,
				metadata: {
					namespace,
				},
			}))
	);

	return [
		...withSourceLanguageFilePathMetadata({
			files: withoutNamespace,
			settings,
		}),
		...withNamespace,
	];
};

function serializePattern(pattern: Pattern, settings?: PluginSettings): string {
	let result = "";
	const variableReferencePattern = settings?.variableReferencePattern ?? [
		"{",
		"}",
	];

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += part.value;
				break;
			case "expression":
				if (part.arg.type !== "variable-reference") {
					throw new Error("Only variable references are supported.");
				}
				if (part.annotation !== undefined) {
					throw new Error("Annotated expressions are not supported.");
				}
				result += `${variableReferencePattern[0]}${part.arg.name}${
					variableReferencePattern[1] ?? ""
				}`;
				break;
			case "markup-start":
			case "markup-end":
			case "markup-standalone":
				throw new Error("Markup is not supported by the next-intl plugin.");
		}
	}

	return result;
}

function resolveNamespaceFromBundleId(
	bundleId: string,
	namespaces: string[]
): string | undefined {
	return [...namespaces]
		.sort((a, b) => b.length - a.length)
		.find((namespace) => bundleId.startsWith(`${namespace}.`));
}

function removeNamespaceFromBundleId(
	bundleId: string,
	namespace: string
): string {
	return bundleId.replace(`${namespace}.`, "");
}

type ExportMessage = {
	key: string;
	path?: string[];
	value: string;
};

function encodeJson(messages: ExportMessage[]): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify(toJson(messages), undefined, "\t") + "\n"
	);
}

function toJson(messages: ExportMessage[]): Record<string, unknown> {
	const messagesWithoutPath: Record<string, string> = {};
	const result: Record<string, unknown> = {};

	for (const message of messages) {
		if (message.path === undefined) {
			messagesWithoutPath[message.key] = message.value;
			continue;
		}
		assignPath(result, message.path, message.value);
	}

	return {
		...messagesWithoutPath,
		...result,
	};
}

function assignPath(
	target: Record<string, unknown>,
	path: string[],
	value: string
) {
	let cursor = target;

	for (const [index, segment] of path.entries()) {
		if (index === path.length - 1) {
			cursor[segment] = value;
			return;
		}

		cursor[segment] ??= {};
		cursor = cursor[segment] as Record<string, unknown>;
	}
}

function getCurrentMessagePath(args: {
	messageId: string;
	currentKey: string;
}): string[] | undefined {
	const path = getMessagePath(args.messageId);
	return path?.join(".") === args.currentKey ? path : undefined;
}

function withSourceLanguageFilePathMetadata(args: {
	files: Array<{
		locale: string;
		content: Uint8Array;
		name: string;
		metadata?: Record<string, any>;
	}>;
	settings: Parameters<
		NonNullable<InlangPlugin<{ [PLUGIN_KEY]: PluginSettings }>["exportFiles"]>
	>[0]["settings"];
}) {
	const pluginSettings = args.settings?.[PLUGIN_KEY];
	const sourceLocale =
		args.settings?.baseLocale ?? args.settings?.sourceLanguageTag;

	if (
		pluginSettings === undefined ||
		typeof pluginSettings.pathPattern !== "string" ||
		typeof pluginSettings.sourceLanguageFilePath !== "string" ||
		typeof sourceLocale !== "string"
	) {
		return args.files;
	}

	return args.files.map((file) => ({
		...file,
		metadata:
			file.locale === sourceLocale
				? {
						...file.metadata,
						pathPattern: pluginSettings.sourceLanguageFilePath,
					}
				: file.metadata,
	}));
}
