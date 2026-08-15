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

export const PLUGIN_KEY = "plugin.inlang.apple-strings";
type Config = { [PLUGIN_KEY]: PluginSettings };
type ImportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["importFiles"]>
>[0];
type ExportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["exportFiles"]>
>[0];

export const plugin: InlangPlugin<Config> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,
  toBeImportedFiles: ({ settings }) =>
    settings.locales.map((locale) => ({
      locale,
      path: settings[PLUGIN_KEY].pathPattern.replace("{locale}", locale),
    })),
  importFiles: ({ files }: ImportArgs) => importAppleStrings(files),
  exportFiles: (args: ExportArgs) => exportAppleStrings(args),
};

function importAppleStrings(
  files: ImportArgs["files"],
): ReturnType<NonNullable<InlangPlugin<Config>["importFiles"]>> {
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

function exportAppleStrings({
  bundles,
  messages,
  variants,
  settings,
}: ExportArgs) {
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
  const entries: Array<{ key: string; value: string }> = [];
  let cursor = 0;
  const whitespaceAndComments = () => {
    while (cursor < source.length) {
      if (/\s/.test(source[cursor]!)) {
        cursor++;
      } else if (source.startsWith("//", cursor)) {
        cursor = source.indexOf("\n", cursor + 2);
        if (cursor === -1) cursor = source.length;
      } else if (source.startsWith("/*", cursor)) {
        const end = source.indexOf("*/", cursor + 2);
        if (end === -1) throw new Error("Unterminated Apple .strings comment");
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
    const key = unescapeString(quoted());
    whitespaceAndComments();
    if (source[cursor] === ";") {
      cursor++;
      if (entries.some((entry) => entry.key === key))
        throw new Error(`Duplicate Apple .strings key "${key}"`);
      entries.push({ key, value: key });
      whitespaceAndComments();
      continue;
    }
    if (source[cursor++] !== "=") throw new Error(`Expected = after "${key}"`);
    whitespaceAndComments();
    const value = unescapeString(quoted());
    whitespaceAndComments();
    if (source[cursor++] !== ";") throw new Error(`Expected ; after "${key}"`);
    if (entries.some((entry) => entry.key === key))
      throw new Error(`Duplicate Apple .strings key "${key}"`);
    entries.push({ key, value });
    whitespaceAndComments();
  }
  return entries;
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
