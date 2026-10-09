import type { ExportFile, InlangPlugin, Pattern } from "@inlang/sdk";
import type { PluginSettings } from "../settings.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { keepUnchangedJsonEntries } from "@inlang/sdk/json-formatting";
import { getMessagePath } from "./messageId.js";
import { importFiles } from "./importFiles.js";

type JsonPlugin = InlangPlugin<{ [PLUGIN_KEY]: PluginSettings }>;

/**
 * Writes the files and keeps the text of the entries of the previous files
 * (`files`) that didn't change.
 */
export const exportFiles: NonNullable<JsonPlugin["exportFiles"]> = async (
	args
) =>
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
const exportWholeFiles: NonNullable<JsonPlugin["exportFiles"]> = async ({
	bundles,
	messages,
	variants,
	settings,
}) => {
	const files: Record<string, ExportMessage[]> = {};
	const namespaceFiles: Record<string, Record<string, ExportMessage[]>> = {};
	const pathPattern = settings[PLUGIN_KEY]?.pathPattern;
	const namespaces =
		pathPattern !== null && typeof pathPattern === "object"
			? Object.keys(pathPattern)
			: [];
	const defaultNamespace = namespaces[0];

	const bundlesById = new Map(bundles.map((bundle) => [bundle.id, bundle]));
	const variantsByMessageId = new Map<string, typeof variants>();
	for (const variant of variants) {
		const messageVariants = variantsByMessageId.get(variant.messageId) ?? [];
		messageVariants.push(variant);
		variantsByMessageId.set(variant.messageId, messageVariants);
	}

	for (const message of messages) {
		const bundle = bundlesById.get(message.bundleId);
		if (bundle === undefined) {
			continue;
		}

		const messageVariants = variantsByMessageId.get(message.id) ?? [];
		if (
			message.selectors.length > 0 ||
			messageVariants.length > 1 ||
			messageVariants.some((variant) => variant.matches.length > 0)
		) {
			throw new Error(
				"Selectors, matches, and multiple variants are not supported by the JSON plugin."
			);
		}

		const namespace =
			resolveNamespaceFromBundleId(bundle.id, namespaces) ?? defaultNamespace;
		const key = namespace
			? removeNamespaceFromBundleId(bundle.id, namespace)
			: bundle.id;
		const path = getCurrentMessagePath({
			messageId: message.id,
			currentKey: key,
		});

		for (const variant of messageVariants) {
			const exportMessage = {
				key,
				path,
				value: serializePattern(variant.pattern, settings[PLUGIN_KEY]),
			};

			if (namespace === undefined) {
				files[message.locale] ??= [];
				files[message.locale]!.push(exportMessage);
			} else {
				namespaceFiles[namespace] ??= {};
				namespaceFiles[namespace]![message.locale] ??= [];
				namespaceFiles[namespace]![message.locale]!.push(exportMessage);
			}
		}
	}

	const withoutNamespaces: ExportFile[] = Object.entries(files).map(
		([locale, messages]) => ({
			locale,
			content: encodeJson(messages),
			name: `${locale}.json`,
		})
	);
	const withNamespaces: ExportFile[] = Object.entries(namespaceFiles).flatMap(
		([namespace, locales]) =>
			Object.entries(locales).map(([locale, messages]) => ({
				locale,
				content: encodeJson(messages),
				name: `${namespace}-${locale}.json`,
				metadata: { namespace },
			}))
	);

	return [...withoutNamespaces, ...withNamespaces];
};

function serializePattern(
	pattern: Pattern,
	settings: PluginSettings | undefined
): string {
	const variableReferencePattern = settings?.variableReferencePattern ?? [
		"{",
		"}",
	];
	const opening = variableReferencePattern[0] || "{";
	const closing = variableReferencePattern[1] ?? "";
	let result = "";

	for (const part of pattern) {
		switch (part.type) {
			case "text":
				result += part.value;
				break;
			case "expression":
				if (
					part.arg.type !== "variable-reference" ||
					part.annotation !== undefined
				) {
					throw new Error(
						"Only unannotated variable references are supported by the JSON plugin."
					);
				}
				result += `${opening}${part.arg.name}${closing}`;
				break;
			case "markup-start":
			case "markup-end":
			case "markup-standalone":
				throw new Error("Markup is not supported by the JSON plugin.");
		}
	}

	return result;
}

function resolveNamespaceFromBundleId(
	bundleId: string,
	namespaces: string[]
): string | undefined {
	return [...namespaces]
		.sort((left, right) => right.length - left.length)
		.find((namespace) => bundleId.startsWith(`${namespace}:`));
}

function removeNamespaceFromBundleId(
	bundleId: string,
	namespace: string
): string {
	return bundleId.startsWith(`${namespace}:`)
		? bundleId.slice(namespace.length + 1)
		: bundleId;
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
	const flatMessages: Record<string, string> = {};
	const result: Record<string, unknown> = {};

	for (const message of messages) {
		if (message.path === undefined) {
			flatMessages[message.key] = message.value;
			continue;
		}
		assignPath(result, message.path, message.value);
	}

	return { ...flatMessages, ...result };
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
