import type {
  Bundle,
  InlangPlugin,
  MessageImport,
  Variant,
  VariantImport,
} from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import { parseMessage } from "./parse.js";
import { serializeMessage } from "./serialize.js";
import { keepUnchangedJsonEntries } from "@inlang/sdk/json-formatting";

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
    keepUnchangedJsonEntries({
      exported: exportWholeFiles(args),
      files: args.files,
      settings: args.settings,
      importFiles,
      exportFiles: exportWholeFiles,
      // with several path patterns, a locale has several files
      isSameFile: (exported, existing) => exported.name === existing.path,
    }),
};

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
