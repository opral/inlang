import type {
  Bundle,
  InlangPlugin,
  Message,
  MessageImport,
  Pattern,
  Variant,
  VariantImport,
} from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import {
  mergeEntries,
  type Comment,
  type Entry,
  type EntryText,
} from "./mergeEntries.js";

export const PLUGIN_KEY = "plugin.inlang.apple-strings";
type Config = { [PLUGIN_KEY]: PluginSettings };
type ImportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["importFiles"]>
>[0];
type ExportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["exportFiles"]>
>[0];
type ExportFile = { locale: string; name: string; content: Uint8Array };

export const plugin: InlangPlugin<Config> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,
  toBeImportedFiles: ({ settings }) =>
    settings.locales.map((locale) => ({
      locale,
      path: settings[PLUGIN_KEY].pathPattern.replace("{locale}", locale),
    })),
  importFiles: ({ files }: ImportArgs) => importAppleStrings(files),
  exportFiles: (args: ExportArgs) =>
    keepUnchangedEntries(exportAppleStrings(args), args),
};

function importAppleStrings(files: ImportArgs["files"]): {
  bundles: Bundle[];
  messages: MessageImport[];
  variants: VariantImport[];
} {
  const bundles = new Map<string, Bundle>();
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  for (const file of files) {
    for (const { key, value } of parseStringsFile(decode(file.content))) {
      const parsed = parsePattern(value);
      const current = bundles.get(key) ?? { id: key, declarations: [] };
      for (const name of parsed.variables)
        if (
          !current.declarations.some((declaration) => declaration.name === name)
        )
          current.declarations.push({ type: "input-variable", name });
      bundles.set(key, current);
      messages.push({ bundleId: key, locale: file.locale, selectors: [] });
      variants.push({
        messageBundleId: key,
        messageLocale: file.locale,
        matches: [],
        pattern: parsed.pattern,
      });
    }
  }
  return { bundles: [...bundles.values()], messages, variants };
}

/**
 * Keeps the text of the entries of the existing files that didn't change
 * (comments, whitespace, order, escapes, encoding), so that an export only
 * changes the bytes of edited messages.
 *
 * An entry is unchanged if the plugin writes the same line for it as for what
 * the previous entry imports to. Changed entries are replaced, removed
 * entries are removed with the comment directly above them, and new entries
 * are inserted after the entry that precedes them in the full export. The
 * result is only used if it imports to what the full export imports to.
 * Otherwise, and if a previous file can't be read, the full export is used.
 */
function keepUnchangedEntries(
  exported: ExportFile[],
  args: ExportArgs,
): ExportFile[] {
  if (!args.files?.length) return exported;
  return exported.map((file) => {
    const previous = args.files!.find(
      (candidate) => candidate.locale === file.locale,
    );
    if (previous === undefined) return file;
    try {
      const content = keepUnchangedEntriesOfFile({
        previous: previous.content,
        exported: file.content,
        locale: file.locale,
        settings: args.settings,
      });
      return content === undefined ? file : { ...file, content };
    } catch {
      // e.g. the previous file can't be parsed or imported
      return file;
    }
  });
}

function keepUnchangedEntriesOfFile(args: {
  previous: Uint8Array;
  exported: Uint8Array;
  locale: string;
  settings: ExportArgs["settings"];
}): Uint8Array | undefined {
  const { text, encoding } = decodeKeepingEncoding(args.previous);
  const exportedText = decode(args.exported);
  /** The text the plugin writes for what `text` imports to. */
  const canonical = (text: string) => {
    const imported = importAppleStrings([
      { locale: args.locale, content: encode(text) },
    ]);
    const files = exportAppleStrings({
      ...rowsOf(imported),
      settings: args.settings,
    });
    const file = files.find((candidate) => candidate.locale === args.locale);
    return file === undefined ? "" : decode(file.content);
  };
  const scanned = scanStringsFile(text);
  const result = mergeEntries({
    text,
    entries: scanned.entries,
    comments: scanned.comments,
    previous: entryTexts(canonical(text)),
    next: entryTexts(exportedText),
    indentUnit: "",
    fileIndentUnit: "",
    insertIntoEmpty: (lines) => ({
      start: text.length,
      end: text.length,
      text:
        (text === "" || /\n\s*$/.test(text) ? "" : newlineOf(text)) +
        lines.map((line) => line + newlineOf(text)).join(""),
    }),
  });
  if (result === undefined) return undefined;
  // Only use the result if it imports to what the full export imports to.
  if (canonical(result) !== canonical(exportedText)) return undefined;
  return encodeWithEncoding(result, encoding);
}

/** The lines of a file the plugin writes, by key. */
function entryTexts(text: string): Map<string, EntryText> {
  return new Map(
    scanStringsFile(text).entries.map((entry) => [
      entry.key,
      {
        text: text.slice(entry.start, entry.end),
        valueText:
          entry.valueRange &&
          text.slice(entry.valueRange.start, entry.valueRange.end),
      },
    ]),
  );
}

function newlineOf(text: string) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Bundles, messages and variants with ids from the result of an import. */
function rowsOf(imported: ReturnType<typeof importAppleStrings>) {
  const messages: Message[] = imported.messages.map((message) => ({
    id: `${message.bundleId}\u0000${message.locale}`,
    bundleId: message.bundleId,
    locale: message.locale,
    selectors: message.selectors ?? [],
  }));
  const variants: Variant[] = imported.variants.map((variant, index) => ({
    id: String(index),
    messageId: `${variant.messageBundleId}\u0000${variant.messageLocale}`,
    matches: variant.matches ?? [],
    pattern: variant.pattern ?? [],
  }));
  return { bundles: imported.bundles, messages, variants };
}

function exportAppleStrings({
  bundles,
  messages,
  variants,
  settings,
}: Omit<ExportArgs, "files">) {
  const files = new Map<string, string[]>();
  for (const message of messages) {
    const bundle = requiredBundle(bundles, message);
    if (message.selectors.length !== 0)
      throw new Error(
        `Apple .strings cannot represent selectors or plurals (bundle "${bundle.id}")`,
      );
    const messageVariants = variants.filter(
      (variant) => variant.messageId === message.id,
    );
    if (
      messageVariants.length !== 1 ||
      messageVariants[0]!.matches.length !== 0
    )
      throw new Error(
        `Apple .strings requires one unconditional variant (bundle "${bundle.id}")`,
      );
    const lines = files.get(message.locale) ?? [];
    lines.push(
      `"${escapeString(bundle.id)}" = "${serializePattern(messageVariants[0]!.pattern, bundle)}";`,
    );
    files.set(message.locale, lines);
  }
  return [...files].map(([locale, lines]) => ({
    locale,
    name:
      settings[PLUGIN_KEY]?.pathPattern.replace("{locale}", locale) ??
      `${locale}.lproj/Localizable.strings`,
    content: encode(`${lines.sort().join("\n")}\n`),
  }));
}

function parseStringsFile(source: string) {
  return scanStringsFile(source).entries;
}

/**
 * Parses a .strings file into its entries and comments, with their positions.
 */
function scanStringsFile(source: string) {
  const entries: Array<Entry & { value: string }> = [];
  const comments: Comment[] = [];
  let cursor = 0;
  const whitespaceAndComments = () => {
    while (cursor < source.length) {
      if (/\s/.test(source[cursor]!)) {
        cursor++;
      } else if (source.startsWith("//", cursor)) {
        const start = cursor;
        cursor = source.indexOf("\n", cursor + 2);
        if (cursor === -1) cursor = source.length;
        // without a carriage return of the line break
        comments.push({
          start,
          end: source[cursor - 1] === "\r" ? cursor - 1 : cursor,
        });
      } else if (source.startsWith("/*", cursor)) {
        const end = source.indexOf("*/", cursor + 2);
        if (end === -1) throw new Error("Unterminated Apple .strings comment");
        comments.push({ start: cursor, end: end + 2 });
        cursor = end + 2;
      } else break;
    }
  };
  const quoted = () => {
    if (source[cursor] !== '"')
      throw new Error(
        `Expected quoted Apple .strings value at offset ${cursor}`,
      );
    cursor++;
    let result = "";
    while (cursor < source.length) {
      const char = source[cursor++]!;
      if (char === '"') return result;
      if (char !== "\\") {
        result += char;
        continue;
      }
      if (cursor === source.length)
        throw new Error("Unterminated Apple .strings escape");
      result += `\\${source[cursor++]}`;
    }
    throw new Error("Unterminated quoted Apple .strings value");
  };
  whitespaceAndComments();
  while (cursor < source.length) {
    const start = cursor;
    const key = unescapeString(quoted());
    whitespaceAndComments();
    if (source[cursor] === ";") {
      cursor++;
      if (entries.some((entry) => entry.key === key))
        throw new Error(`Duplicate Apple .strings key "${key}"`);
      entries.push({ key, value: key, start, end: cursor });
      whitespaceAndComments();
      continue;
    }
    if (source[cursor++] !== "=") throw new Error(`Expected = after "${key}"`);
    whitespaceAndComments();
    const valueStart = cursor;
    const value = unescapeString(quoted());
    const valueRange = { start: valueStart, end: cursor };
    whitespaceAndComments();
    if (source[cursor++] !== ";") throw new Error(`Expected ; after "${key}"`);
    if (entries.some((entry) => entry.key === key))
      throw new Error(`Duplicate Apple .strings key "${key}"`);
    entries.push({ key, value, start, end: cursor, valueRange });
    whitespaceAndComments();
  }
  return { entries, comments };
}

function parsePattern(value: string) {
  const pattern: Pattern = [];
  const variables: string[] = [];
  const regex =
    /^%(?:(\d+)\$([-+# 0,(]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@])|((?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@]))/;
  if (!hasPrintfExpression(value, regex)) {
    if (/%\d+\$/.test(value))
      throw new Error(`Unsupported Apple positional format in "${value}"`);
    return { pattern: [{ type: "text", value }] as Pattern, variables };
  }
  let cursor = 0;
  let implicit = 0;
  let text = "";
  while (cursor < value.length) {
    if (value.startsWith("%%", cursor)) {
      text += "%";
      cursor += 2;
      continue;
    }
    const match = value.slice(cursor).match(regex);
    if (!match) {
      if (value[cursor] === "%")
        throw new Error(
          `Unsupported Apple format specifier near "${value.slice(cursor, cursor + 12)}"`,
        );
      text += value[cursor++];
      continue;
    }
    if (text) {
      pattern.push({ type: "text", value: text });
      text = "";
    }
    const position = match[1] ? Number(match[1]) : ++implicit;
    const specifier = match[2] ?? match[3]!;
    const name = `arg${position}`;
    variables.push(name);
    pattern.push({
      type: "expression",
      arg: { type: "variable-reference", name },
      annotation: {
        type: "function-reference",
        name: "apple-printf",
        options: [
          { name: "specifier", value: { type: "literal", value: specifier } },
          {
            name: "position",
            value: { type: "literal", value: String(position) },
          },
        ],
      },
    });
    cursor += match[0].length;
  }
  if (text) pattern.push({ type: "text", value: text });
  if (pattern.length === 0) pattern.push({ type: "text", value: "" });
  return { pattern, variables };
}

function serializePattern(pattern: Pattern, bundle: Bundle) {
  const inputs = bundle.declarations.filter(
    (declaration) => declaration.type === "input-variable",
  );
  const formatted = pattern.some((part) => part.type === "expression");
  return pattern
    .map((part) => {
      if (part.type === "text") {
        const escaped = escapeString(part.value);
        return formatted ? escaped.replace(/%/g, "%%") : escaped;
      }
      if (part.type !== "expression" || part.arg.type !== "variable-reference")
        throw new Error(
          `Apple .strings only supports plain variable expressions (bundle "${bundle.id}")`,
        );
      const variableName = part.arg.name;
      const position =
        inputs.findIndex((declaration) => declaration.name === variableName) +
        1;
      if (position === 0)
        throw new Error(
          `Variable "${variableName}" is not declared in "${bundle.id}"`,
        );
      const format = applePrintfFormat(part.annotation, position);
      return `%${format.position}$${format.specifier}`;
    })
    .join("");
}

function applePrintfFormat(
  annotation: Extract<Pattern[number], { type: "expression" }>["annotation"],
  fallbackPosition: number,
) {
  if (!annotation) return { position: fallbackPosition, specifier: "@" };
  if (
    annotation.type !== "function-reference" ||
    annotation.name !== "apple-printf"
  )
    throw new Error(
      `Apple .strings export does not support the ${annotation.type} annotation`,
    );
  const option = (name: string) =>
    annotation.options.find((candidate) => candidate.name === name)?.value;
  const specifier = option("specifier");
  const position = option("position");
  if (
    specifier?.type !== "literal" ||
    !/^[-+# 0,(]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@]$/.test(
      specifier.value,
    ) ||
    position?.type !== "literal" ||
    !/^\d+$/.test(position.value)
  )
    throw new Error("Invalid Apple printf annotation");
  return { specifier: specifier.value, position: Number(position.value) };
}

function requiredBundle(bundles: Bundle[], message: Message) {
  const bundle = bundles.find((candidate) => candidate.id === message.bundleId);
  if (!bundle) throw new Error(`Missing bundle "${message.bundleId}"`);
  return bundle;
}
function escapeString(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
function unescapeString(value: string) {
  const unknownEscape = value.match(/\\(?![\\"nrtuU]|$)/);
  if (unknownEscape)
    throw new Error(`Unsupported Apple .strings escape "${unknownEscape[0]}"`);
  return value
    .replace(/\\U([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(
      /\\([\\"nrt])/g,
      (_, char: string) =>
        ({ "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t" })[char]!,
    );
}
function encode(value: string) {
  return new TextEncoder().encode(value);
}

type Encoding = "utf-8" | "utf-16le" | "utf-16be";

/**
 * Decodes a file like `decode` and returns its encoding. A UTF-8 byte order
 * mark is kept in the text.
 */
function decodeKeepingEncoding(value: Uint8Array): {
  text: string;
  encoding: Encoding;
} {
  if (value[0] === 0xff && value[1] === 0xfe)
    return { text: decode(value), encoding: "utf-16le" };
  if (value[0] === 0xfe && value[1] === 0xff)
    return { text: decode(value), encoding: "utf-16be" };
  return {
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(value),
    encoding: "utf-8",
  };
}

function encodeWithEncoding(text: string, encoding: Encoding): Uint8Array {
  if (encoding === "utf-8") return encode(text);
  // with a byte order mark, as read by `decode`
  const bytes = new Uint8Array(2 + text.length * 2);
  const littleEndian = encoding === "utf-16le";
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = littleEndian ? code & 0xff : code >> 8;
    bytes[3 + index * 2] = littleEndian ? code >> 8 : code & 0xff;
  }
  return bytes;
}
function decode(value: Uint8Array) {
  if (value[0] === 0xff && value[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(value.subarray(2));
  if (value[0] === 0xfe && value[1] === 0xff) {
    const littleEndian = new Uint8Array(value.length - 2);
    for (let index = 2; index + 1 < value.length; index += 2) {
      littleEndian[index - 2] = value[index + 1]!;
      littleEndian[index - 1] = value[index]!;
    }
    return new TextDecoder("utf-16le").decode(littleEndian);
  }
  return new TextDecoder().decode(value);
}

function hasPrintfExpression(source: string, regex: RegExp) {
  for (let cursor = 0; cursor < source.length; cursor++) {
    if (source.startsWith("%%", cursor)) {
      cursor++;
      continue;
    }
    if (source[cursor] === "%" && regex.test(source.slice(cursor))) return true;
  }
  return false;
}
