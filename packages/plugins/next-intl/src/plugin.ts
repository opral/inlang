/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { InlangPlugin } from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import { replaceAll } from "./utilities.js";
import { ideExtensionConfig } from "./ideExtension/config.js";
import { flatten, unflatten } from "flat";
import { detectJsonFormatting } from "@inlang/sdk/json-formatting";
import { importFiles } from "./import-export/importFiles.js";
import { exportFiles } from "./import-export/exportFiles.js";
import { toBeImportedFiles } from "./import-export/toBeImportedFiles.js";
import { PLUGIN_KEY } from "./pluginKey.js";
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";
import { analyzeUsage } from "./usage/analyzeUsage.js";

// global variable to store the formatting of the file
let serializeWithFormatting: ReturnType<typeof detectJsonFormatting>;
let hasNestedKeys = false;

const id = PLUGIN_KEY;

type LanguageTag = string;
type LegacyPattern = Array<
	{ type: "Text"; value: string } | { type: "VariableReference"; name: string }
>;
type Variant = {
	languageTag: LanguageTag;
	match: string[];
	pattern: LegacyPattern;
};
type Message = {
	id: string;
	alias: Record<string, string>;
	selectors: Array<{ type: "VariableReference"; name: string }>;
	variants: Variant[];
};
type NodeishFilesystemSubset = {
	readFile:
		| ((path: string) => Promise<ArrayBuffer>)
		| ((path: string, options?: { encoding: "utf-8" }) => Promise<string>);
	readdir: (path: string) => Promise<string[]>;
	writeFile: (path: string, data: ArrayBuffer | string) => Promise<void>;
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
};
type LegacyProjectSettings = {
	sourceLanguageTag: LanguageTag;
	languageTags: LanguageTag[];
	modules?: string[];
};
type NextIntlPlugin = Omit<
	InlangPlugin<{ [id]: PluginSettings }>,
	"loadMessages" | "saveMessages" | "addCustomApi"
> & {
	id: string;
	displayName: string;
	description: string;
	loadMessages: (args: {
		settings: LegacyProjectSettings & { [id]: PluginSettings };
		nodeishFs: NodeishFilesystemSubset;
	}) => Promise<Message[]>;
	saveMessages: (args: {
		messages: Message[];
		settings: LegacyProjectSettings & { [id]: PluginSettings };
		nodeishFs: NodeishFilesystemSubset;
	}) => Promise<void>;
	addCustomApi: (args: {
		settings: { [id]: PluginSettings };
	}) => Record<string, unknown>;
};

export const plugin: NextIntlPlugin = {
	id,
	key: id,
	displayName: "Next-intl",
	description:
		"A plugin for the Next.js internationalization library next-intl",
	settingsSchema: PluginSettings,
	importFiles,
	exportFiles,
	toBeImportedFiles,
	analyzeUsage,

	loadMessages: async ({ settings, nodeishFs }) => {
		settings["plugin.inlang.nextIntl"].variableReferencePattern = settings[
			"plugin.inlang.nextIntl"
		].variableReferencePattern || ["{", "}"];
		return loadMessages({
			settings,
			pluginSettings: settings["plugin.inlang.nextIntl"],
			nodeishFs,
		});
	},
	saveMessages: async ({ messages, settings, nodeishFs }) => {
		settings["plugin.inlang.nextIntl"].variableReferencePattern = settings[
			"plugin.inlang.nextIntl"
		].variableReferencePattern || ["{", "}"];
		return saveMessages({
			pluginSettings: settings["plugin.inlang.nextIntl"],
			nodeishFs,
			messages,
		});
	},
	addCustomApi: ({ settings }) =>
		ideExtensionConfig(settings["plugin.inlang.nextIntl"]),
};

/**
 * Load messages
 *
 * @example const messages = await loadMessages({ fs, settings, languageTags })
 */
async function loadMessages(args: {
	nodeishFs: NodeishFilesystemSubset;
	pluginSettings: PluginSettings;
	settings: LegacyProjectSettings;
}): Promise<Message[]> {
	const messages: Message[] = [];
	const pathPattern = assertLegacyStringPathPattern(
		args.pluginSettings.pathPattern
	);
	for (const languageTag of resolveOrderOfLanguageTags(
		args.settings.languageTags,
		args.settings.sourceLanguageTag
	)) {
		const messagesFromFile = await getFileToParse(
			pathPattern,
			languageTag,
			args.settings.sourceLanguageTag,
			args.nodeishFs,
			typeof args.pluginSettings.sourceLanguageFilePath === "string" &&
				languageTag === args.settings.sourceLanguageTag
				? args.pluginSettings.sourceLanguageFilePath
				: undefined
		);
		for (const [key, value] of Object.entries(messagesFromFile)) {
			if (Object.keys(value).length !== 0) {
				addVariantToMessages(
					messages,
					replaceAll(key, "u002E", "."),
					languageTag,
					value,
					args.pluginSettings
				);
			}
		}
	}
	return messages;
}

/**
 * Get file to parse
 *
 * To get files and throw if files are not there. Also handles the flattening for nested files
 *
 * @example const storedMessages = await getFileToParse(path, isNested, languageTag, fs)
 */
async function getFileToParse(
	path: string,
	languageTag: string,
	sourceLanguageTag: string,
	nodeishFs: NodeishFilesystemSubset,
	pathWithLanguage?: string
): Promise<Record<string, string>> {
	if (typeof pathWithLanguage === "undefined") {
		pathWithLanguage = replaceLocale(path, languageTag);
	}
	// get file, make sure that is not braking when the namespace doesn't exist in every languageTag dir
	try {
		const file = (await nodeishFs.readFile(pathWithLanguage, {
			encoding: "utf-8",
		})) as string;
		//analyse format of file
		if (sourceLanguageTag === languageTag) {
			serializeWithFormatting = detectJsonFormatting(file);
		}

		const json = JSON.parse(file);

		if (Object.values(json).some((value) => typeof value === "object")) {
			hasNestedKeys = true;
		}

		const flattenedMessages = hasNestedKeys
			? flatten(json, {
					transformKey: function (key) {
						//replace dots in keys with unicode
						return replaceAll(key, ".", "u002E");
					},
				})
			: json;
		return flattenedMessages;
	} catch (e) {
		// if the namespace doesn't exist for this dir -> continue
		if ((e as any).code === "FileNotFound" || (e as any).code === "ENOENT") {
			// file does not exist yet
			return {};
		}
		throw e;
	}
}

/**
 * Resolve order of languageTags, move sourceLanguage to the first spot
 */
const resolveOrderOfLanguageTags = (
	languageTags: Readonly<LanguageTag[]>,
	sourceLanguageTag: LanguageTag
): LanguageTag[] => {
	const filteredTags = languageTags.filter((t) => t !== sourceLanguageTag); // Remove sourceLanguageTag
	filteredTags.unshift(sourceLanguageTag); // Add sourceLanguageTag to the beginning of the filtered array
	return filteredTags;
};

/**
 * Add new item (message, variant) to the ast
 *
 * @example addVariantToMessages(messages, key, languageTag, value)
 */
const addVariantToMessages = (
	messages: Message[],
	key: string,
	languageTag: LanguageTag,
	value: string,
	settings: PluginSettings
) => {
	const messageIndex = messages.findIndex((m) => m.id === key);
	if (messageIndex !== -1) {
		const variant: Variant = {
			languageTag,
			match: [],
			pattern: parsePattern(value, settings.variableReferencePattern!),
		};

		//push new variant
		messages[messageIndex]?.variants.push(variant);
	} else {
		// message does not exist
		const message: Message = {
			id: key,
			alias: {},
			selectors: [],
			variants: [],
		};
		message.variants = [
			{
				languageTag,
				match: [],
				pattern: parsePattern(value, settings.variableReferencePattern!),
			},
		];
		messages.push(message);
	}
};

/**
 * Parses a pattern.
 *
 * @example parsePattern("Hello {{name}}!", ["{{", "}}"])
 */
function parsePattern(
	text: string,
	variableReferencePattern: string[]
): Variant["pattern"] {
	// dependent on the variableReferencePattern, different regex
	// expressions are used for matching

	const expression = variableReferencePattern[1]
		? new RegExp(
				`(\\${variableReferencePattern[0]}[^\\${variableReferencePattern[1]}]+\\${variableReferencePattern[1]})`,
				"g"
			)
		: new RegExp(`(${variableReferencePattern}\\w+)`, "g");

	const pattern: Variant["pattern"] = text
		.split(expression)
		.filter((element) => element !== "")
		.map((element) => {
			if (expression.test(element) && variableReferencePattern[0]) {
				return {
					type: "VariableReference",
					name: variableReferencePattern[1]
						? element.slice(
								variableReferencePattern[0].length,
								// negative index, removing the trailing pattern
								-variableReferencePattern[1].length
							)
						: element.slice(variableReferencePattern[0].length),
				};
			} else {
				return {
					type: "Text",
					value: element,
				};
			}
		});
	return pattern;
}

/**
 * Save messages
 *
 * @example await saveMessages({ fs, settings, messages })
 */
async function saveMessages(args: {
	nodeishFs: NodeishFilesystemSubset;
	pluginSettings: PluginSettings;
	messages: Message[];
}) {
	const pathPattern = assertLegacyStringPathPattern(
		args.pluginSettings.pathPattern
	);
	const storage:
		| Record<LanguageTag, Record<Message["id"], Variant["pattern"]>>
		| undefined = {};
	for (const message of args.messages) {
		for (const variant of message.variants) {
			storage[variant.languageTag] ??= {};
			storage[variant.languageTag]![message.id] = variant.pattern;
		}
	}
	for (const [languageTag, value] of Object.entries(storage)) {
		const pathWithLanguage =
			typeof args.pluginSettings.sourceLanguageFilePath === "string" &&
			languageTag === Object.keys(storage)[0] // sourceLanguage is always the first languageTag
				? args.pluginSettings.sourceLanguageFilePath
				: replaceLocale(pathPattern, languageTag);
		try {
			await args.nodeishFs.readdir(
				pathWithLanguage.split("/").slice(0, -1).join("/")
			);
		} catch {
			await args.nodeishFs.mkdir(
				pathWithLanguage.split("/").slice(0, -1).join("/"),
				{
					recursive: true,
				}
			);
		}
		await args.nodeishFs.writeFile(
			pathWithLanguage,
			serializeFile(value, args.pluginSettings.variableReferencePattern)
		);
	}
}

function assertLegacyStringPathPattern(
	pathPattern: PluginSettings["pathPattern"]
): string {
	if (typeof pathPattern !== "string") {
		throw new Error(
			"Namespace pathPattern objects require the new import/export API."
		);
	}
	return pathPattern;
}

function replaceLocale(pathPattern: string, locale: string): string {
	return pathPattern.replace(
		/{(languageTag|locale|language)}/g,
		(_, placeholder) =>
			placeholder === "language" ? getPrimaryLanguageSubtag(locale) : locale
	);
}

/**
 * Serializes file
 *
 * For all messages that belong in one file.
 *
 * @example const serializedFile = serializeFile(messages, space, endsWithNewLine, nested, variableReferencePattern)
 */
function serializeFile(
	messages: Record<Message["id"], Variant["pattern"]>,
	variableReferencePattern: PluginSettings["variableReferencePattern"]
): string {
	let result: Record<string, string> = {};
	for (const [messageId, pattern] of Object.entries(messages)) {
		//check if there are two dots after each other -> that would brake unflatten -> replace with unicode
		let id = replaceAll(messageId, "..", "u002E.");
		//check if the last char is a dot -> that would brake unflatten -> replace with unicode
		if (id.slice(-1) === ".") {
			id = id.replace(/.$/, "u002E");
		}
		result[id] = serializePattern(pattern, variableReferencePattern!);
	}
	// for nested structures -> unflatten the keys
	if (hasNestedKeys) {
		result = unflatten(result, {
			//prevent numbers from creating arrays automatically
			object: true,
		});
	}
	return replaceAll(serializeWithFormatting(result), "u002E", ".");
}

/**
 * Serializes a pattern.
 *
 * @example const serializedPattern = serializePattern(pattern, variableReferencePattern)
 */
function serializePattern(
	pattern: Variant["pattern"],
	variableReferencePattern: string[]
) {
	const result: string[] = [];
	for (const element of pattern) {
		switch (element.type) {
			case "Text":
				result.push(element.value);
				break;
			case "VariableReference":
				result.push(
					variableReferencePattern[1]
						? `${variableReferencePattern[0]}${element.name}${variableReferencePattern[1]}`
						: `${variableReferencePattern[0]}${element.name}`
				);
				break;
			default:
				throw new Error(
					`Unknown message pattern element of type: ${(element as any)?.type}`
				);
		}
	}
	return result.join("");
}
