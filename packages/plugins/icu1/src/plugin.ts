import type {
  Bundle,
  ExportFile,
  InlangPlugin,
  Message,
  MessageImport,
  Variant,
  VariantImport,
} from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import { parseMessage } from "./parse.js";
import { serializeMessage } from "./serialize.js";
import {
  keepUnchangedJsonEntries,
  stringifyJsonKeepingEntries,
} from "@inlang/sdk/json-formatting";

export const PLUGIN_KEY = "plugin.inlang.icu-messageformat-1";

type PluginConfig = {
  [PLUGIN_KEY]: PluginSettings;
};

type ToBeImportedArgs = Parameters<
  NonNullable<InlangPlugin<PluginConfig>["toBeImportedFiles"]>
>[0];
type ImportFilesArgs = Parameters<
  NonNullable<InlangPlugin<PluginConfig>["importFiles"]>
>[0];
type ExportFilesArgs = Parameters<
  NonNullable<InlangPlugin<PluginConfig>["exportFiles"]>
>[0];

export const plugin: InlangPlugin<PluginConfig> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,

  toBeImportedFiles: async ({ settings }: ToBeImportedArgs) => {
    const pathPatterns = settings[PLUGIN_KEY]?.pathPattern
      ? Array.isArray(settings[PLUGIN_KEY].pathPattern)
        ? settings[PLUGIN_KEY].pathPattern
        : [settings[PLUGIN_KEY].pathPattern]
      : [];

    const files = [] as { path: string; locale: string }[];
    for (const pathPattern of pathPatterns) {
      for (const locale of settings.locales) {
        files.push({
          locale,
          path: pathPattern.replace(/{locale}/, locale),
        });
      }
    }

    return files;
  },

  importFiles: ({ files }: ImportFilesArgs) => importFiles({ files }),

  exportFiles: async (args: ExportFilesArgs) =>
    withoutMessagesOfOtherFiles({
      files: await keepUnchangedJsonEntries({
        exported: exportWholeFiles(args),
        files: args.files,
        settings: args.settings,
        importFiles,
        exportFiles: exportWholeFiles,
        // with several path patterns, a locale has several files
        isSameFile: (exported, existing) => exported.name === existing.path,
      }),
      existing: args.files ?? [],
      settings: args.settings,
    }),
};

type ExistingFile = NonNullable<ExportFilesArgs["files"]>[number];

/**
 * With several path patterns, the whole-file export writes every message to
 * every file of a locale, and the import merges the files. Keeping the
 * unchanged entries of the existing files keeps the messages of each file,
 * but an edited message is "new" in the files that didn't have it (they don't
 * know the edit). This removes, from each kept file, the messages that the
 * file didn't have and that another file of the locale had and still has
 * with the same text, so that only the file of the message changes.
 *
 * A message that no file of the locale had, i.e. a new message, stays in
 * every file, like the whole-file export (and the README) writes it: which
 * of the files a new message belongs to is unknown.
 *
 * The result is only used if the files are read as before.
 */
async function withoutMessagesOfOtherFiles(args: {
  files: ExportFile[];
  existing: readonly ExistingFile[];
  settings: ExportFilesArgs["settings"];
}): Promise<ExportFile[]> {
  const pathPattern = args.settings[PLUGIN_KEY]?.pathPattern;
  if (!Array.isArray(pathPattern) || pathPattern.length < 2) {
    return args.files;
  }
  const decode = (content: Uint8Array) =>
    new TextDecoder("utf-8", { ignoreBOM: true }).decode(content);
  const parseObject = (content: Uint8Array) => {
    try {
      const json = JSON.parse(decode(content).replace(/^\uFEFF/, ""));
      return typeof json === "object" && json !== null && !Array.isArray(json)
        ? (json as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  };
  /** the keys of the existing files, by path */
  const previousKeys = new Map<string, Set<string>>();
  for (const file of args.existing) {
    const json = parseObject(file.content);
    if (json !== undefined)
      previousKeys.set(file.path, new Set(Object.keys(json)));
  }
  const outputs = args.files.map((file) => ({
    file,
    json: parseObject(file.content),
  }));

  let changed = false;
  const result = outputs.map(({ file, json }) => {
    const before = previousKeys.get(file.name);
    // only files that keep the text of the existing file
    if (file.verbatim !== true || before === undefined || json === undefined) {
      return file;
    }
    const others = outputs.filter(
      (other) =>
        other.file !== file &&
        other.file.locale === file.locale &&
        other.json !== undefined &&
        previousKeys.has(other.file.name),
    );
    const remove = new Set(
      Object.keys(json).filter(
        (key) =>
          before.has(key) === false &&
          others.some(
            (other) =>
              previousKeys.get(other.file.name)!.has(key) &&
              Object.prototype.hasOwnProperty.call(other.json, key) &&
              other.json![key] === json[key],
          ),
      ),
    );
    if (remove.size === 0) return file;
    const text = stringifyJsonKeepingEntries({
      previous: decode(file.content),
      // the removed keys are messages, not keys that the plugin doesn't import
      previousCanonical: json,
      next: Object.fromEntries(
        Object.entries(json).filter(([key]) => remove.has(key) === false),
      ),
      splitKey: (key) => [key],
    });
    if (text === undefined) return file;
    changed = true;
    return { ...file, content: new TextEncoder().encode(text) };
  });
  if (changed === false) return args.files;

  // The files must be read as before: the removed messages are in another
  // file with the same text. Existing files without an exported file stay on
  // disk and are read too.
  const read = (files: ExportFile[]) => {
    const untouched = args.existing.filter(
      (existing) => files.some((file) => file.name === existing.path) === false,
    );
    const imported = importFiles({
      files: [
        ...files.map(({ locale, content }) => ({ locale, content })),
        ...untouched.map(({ locale, content }) => ({ locale, content })),
      ],
    });
    return exportWholeFiles({
      ...rowsOf(imported),
      settings: args.settings,
    })
      .map((file) => {
        const json = JSON.parse(decode(file.content)) as Record<
          string,
          unknown
        >;
        // the order of the keys depends on the order of the files
        return [
          file.name,
          Object.entries(json).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ];
      })
      .sort(([a], [b]) => (a! < b! ? -1 : 1));
  };
  try {
    return JSON.stringify(read(result)) === JSON.stringify(read(args.files))
      ? result
      : args.files;
  } catch {
    return args.files;
  }
}

/** Rows with ids for the result of `importFiles`, last one wins. */
function rowsOf(imported: ReturnType<typeof importFiles>) {
  const messages = new Map<string, Message>();
  for (const message of imported.messages) {
    const id = JSON.stringify([message.bundleId, message.locale]);
    messages.set(id, {
      id,
      bundleId: message.bundleId,
      locale: message.locale,
      selectors: message.selectors ?? [],
    });
  }
  const variants = new Map<string, Variant>();
  for (const variant of imported.variants) {
    const messageId = JSON.stringify([
      variant.messageBundleId,
      variant.messageLocale,
    ]);
    const id = JSON.stringify([messageId, variant.matches ?? []]);
    variants.set(id, {
      id,
      messageId,
      matches: variant.matches ?? [],
      pattern: variant.pattern ?? [],
    });
  }
  return {
    bundles: imported.bundles,
    messages: [...messages.values()],
    variants: [...variants.values()],
  };
}

function importFiles({ files }: Pick<ImportFilesArgs, "files">) {
  const bundles = new Map<string, Bundle>();
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  const decoder = new TextDecoder("utf-8");

  for (const file of files) {
    const json = JSON.parse(decoder.decode(file.content));
    for (const [key, value] of Object.entries(json)) {
      if (key === "$schema") continue;
      if (typeof value !== "string") continue;

      const parsed = parseMessage({
        messageSource: value,
        bundleId: key,
        locale: file.locale,
      });

      const bundle = bundles.get(key) ?? { id: key, declarations: [] };
      bundle.declarations = uniqueDeclarations([
        ...bundle.declarations,
        ...parsed.declarations,
      ]);
      bundles.set(key, bundle);

      messages.push({
        bundleId: key,
        locale: file.locale,
        selectors: parsed.selectors,
      });
      variants.push(...parsed.variants);
    }
  }

  return { bundles: [...bundles.values()], messages, variants };
}

/**
 * Writes whole files, without the previous files.
 */
function exportWholeFiles({
  bundles,
  messages,
  variants,
  settings,
}: Omit<ExportFilesArgs, "files">) {
  const encoder = new TextEncoder();
  const result: Record<string, Record<string, string>> = {};

  const bundlesById = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  const variantsByMessageId = new Map<string, Variant[]>();
  for (const variant of variants) {
    const messageVariants = variantsByMessageId.get(variant.messageId) ?? [];
    messageVariants.push(variant);
    variantsByMessageId.set(variant.messageId, messageVariants);
  }

  for (const message of messages) {
    const bundle = bundlesById.get(message.bundleId);
    if (!bundle) continue;
    const serialized = serializeMessage({
      bundle,
      message,
      variants: variantsByMessageId.get(message.id) ?? [],
    });

    result[message.locale] ??= {};
    result[message.locale]![message.bundleId] = serialized;
  }

  const pathPattern = settings[PLUGIN_KEY]?.pathPattern;
  const formattedPathPatterns = Array.isArray(pathPattern)
    ? pathPattern
    : [pathPattern ?? "{locale}.json"];

  return Object.entries(result).flatMap(([locale, messagesByKey]) =>
    formattedPathPatterns.map((pattern) => ({
      locale,
      name: pattern.replace(/{locale}/, locale),
      content: encoder.encode(JSON.stringify(messagesByKey, undefined, "\t")),
      // each file to its own path if there are several path patterns
      ...(Array.isArray(pathPattern)
        ? { metadata: { pathPattern: pattern } }
        : {}),
    })),
  );
}

function uniqueDeclarations(
  declarations: Bundle["declarations"],
): Bundle["declarations"] {
  const seen = new Map<string, Bundle["declarations"][number]>();
  for (const declaration of declarations) {
    const key = JSON.stringify(declaration);
    if (!seen.has(key)) {
      seen.set(key, declaration);
    }
  }
  return [...seen.values()];
}
