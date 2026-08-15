import { XMLParser, XMLValidator } from "fast-xml-parser";
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

export const PLUGIN_KEY = "plugin.inlang.android";
type Config = { [PLUGIN_KEY]: PluginSettings };
type ImportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["importFiles"]>
>[0];
type ExportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["exportFiles"]>
>[0];
const quantities = new Set(["zero", "one", "two", "few", "many", "other"]);

export const plugin: InlangPlugin<Config> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,
  toBeImportedFiles: ({ settings }) =>
    settings.locales.map((locale) => ({
      locale,
      path: androidPath(
        settings[PLUGIN_KEY].pathPattern,
        locale,
        settings.baseLocale,
      ),
    })),
  importFiles: ({ files }: ImportArgs) => importAndroidFiles(files),
  exportFiles: (args: ExportArgs) => exportAndroidFiles(args),
};

function importAndroidFiles(
  files: ImportArgs["files"],
): ReturnType<NonNullable<InlangPlugin<Config>["importFiles"]>> {
  const bundles = new Map<string, Bundle>();
  const seen = new Set<string>();
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  for (const file of files) {
    const source = decode(file.content);
    const validation = XMLValidator.validate(source);
    if (validation !== true)
      throw new Error(`Invalid Android resources XML: ${validation.err.msg}`);
    const resources = parser.parse(source)?.resources;
    if (!resources || typeof resources !== "object")
      throw new Error("Android resources XML must contain a <resources> root");
    for (const item of array(resources.string)) {
      if (!item || typeof item !== "object" || !("name" in item))
        throw new Error("Every Android <string> must have a name attribute");
      const id = String(item.name);
      assertUnique(seen, file.locale, id);
      const parsed = parseAndroidPattern(textValue(item));
      bundles.set(
        id,
        mergeBundle(bundles.get(id), id, parsed.variables, false),
      );
      messages.push({ bundleId: id, locale: file.locale, selectors: [] });
      variants.push({
        messageBundleId: id,
        messageLocale: file.locale,
        matches: [],
        pattern: parsed.pattern,
      });
    }
    for (const plural of array(resources.plurals)) {
      if (!plural || typeof plural !== "object" || !("name" in plural))
        throw new Error("Every Android <plurals> must have a name attribute");
      const id = String(plural.name);
      assertUnique(seen, file.locale, id);
      const parsedItems = array(plural.item).map((item) => {
        const quantity = String(item.quantity);
        if (!quantities.has(quantity))
          throw new Error(`Unsupported Android plural quantity "${quantity}"`);
        return { quantity, parsed: parseAndroidPattern(textValue(item)) };
      });
      const pluralQuantities = parsedItems.map((item) => item.quantity);
      if (new Set(pluralQuantities).size !== pluralQuantities.length)
        throw new Error(`Android plural "${id}" has duplicate quantities`);
      if (!pluralQuantities.includes("other"))
        throw new Error(`Android plural "${id}" must define quantity "other"`);
      bundles.set(
        id,
        mergeBundle(
          bundles.get(id),
          id,
          ["count", ...parsedItems.flatMap(({ parsed }) => parsed.variables)],
          true,
        ),
      );
      messages.push({
        bundleId: id,
        locale: file.locale,
        selectors: [{ type: "variable-reference", name: "countPlural" }],
      });
      for (const { quantity, parsed } of parsedItems) {
        variants.push({
          messageBundleId: id,
          messageLocale: file.locale,
          matches: [
            quantity === "other"
              ? { type: "catchall-match", key: "countPlural" }
              : { type: "literal-match", key: "countPlural", value: quantity },
          ],
          pattern: parsed.pattern,
        });
      }
    }
  }
  return { bundles: [...bundles.values()], messages, variants };
}

function exportAndroidFiles({
  bundles,
  messages,
  variants,
  settings,
}: ExportArgs) {
  const files = new Map<string, string[]>();
  for (const message of messages) {
    const bundle = requiredBundle(bundles, message);
    assertAndroidResourceName(bundle.id);
    const messageVariants = variants.filter(
      (variant) => variant.messageId === message.id,
    );
    const lines = files.get(message.locale) ?? [];
    if (message.selectors.length === 0) {
      if (
        messageVariants.length !== 1 ||
        messageVariants[0]!.matches.length !== 0
      )
        throw new Error(
          `Android string "${bundle.id}" must have exactly one unconditional variant`,
        );
      lines.push(
        `  <string name="${escapeXmlAttribute(bundle.id)}">${serializePattern(messageVariants[0]!.pattern, bundle)}</string>`,
      );
    } else {
      const selector = message.selectors[0];
      const plural =
        selector && message.selectors.length === 1
          ? pluralDeclaration(bundle, selector.name)
          : undefined;
      if (!selector || !plural)
        throw new Error(
          `Android plurals require one selector backed by a cardinal plural declaration (bundle "${bundle.id}")`,
        );
      const items = messageVariants.map((variant) => {
        const match = variant.matches[0];
        if (
          variant.matches.length !== 1 ||
          !match ||
          match.key !== selector.name ||
          (match.type !== "catchall-match" &&
            (match.type !== "literal-match" ||
              match.value === "other" ||
              !quantities.has(match.value)))
        )
          throw new Error(
            `Android plural "${bundle.id}" has an unsupported match`,
          );
        const quantity =
          match.type === "catchall-match" ? "other" : match.value;
        return `    <item quantity="${quantity}">${serializePattern(variant.pattern, bundle)}</item>`;
      });
      const exportedQuantities = items.map(
        (item) => item.match(/quantity="([^"]+)"/)?.[1],
      );
      if (
        new Set(exportedQuantities).size !== exportedQuantities.length ||
        exportedQuantities.filter((quantity) => quantity === "other").length !==
          1
      )
        throw new Error(
          `Android plural "${bundle.id}" must export unique quantities and exactly one other`,
        );
      lines.push(
        `  <plurals name="${escapeXmlAttribute(bundle.id)}">\n${items.join("\n")}\n  </plurals>`,
      );
    }
    files.set(message.locale, lines);
  }
  return [...files].map(([locale, lines]) => ({
    locale,
    name: settings[PLUGIN_KEY]?.pathPattern
      ? androidPath(
          settings[PLUGIN_KEY].pathPattern,
          locale,
          settings.baseLocale,
        )
      : `res/values${androidLocaleSuffix(locale, settings.baseLocale)}/strings.xml`,
    content: encode(
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.sort().join("\n")}\n</resources>\n`,
    ),
  }));
}

function mergeBundle(
  current: Bundle | undefined,
  id: string,
  variables: string[],
  plural: boolean,
): Bundle {
  const declarations: Bundle["declarations"] = current
    ? [...current.declarations]
    : [];
  for (const name of [...new Set(variables)])
    if (!declarations.some((declaration) => declaration.name === name))
      declarations.push({ type: "input-variable", name });
  if (
    plural &&
    !declarations.some((declaration) => declaration.name === "countPlural")
  )
    declarations.push({
      type: "local-variable",
      name: "countPlural",
      value: {
        type: "expression",
        arg: { type: "variable-reference", name: "count" },
        annotation: { type: "function-reference", name: "plural", options: [] },
      },
    });
  return { id, declarations };
}

function parseAndroidPattern(value: string) {
  const pattern: Pattern = [];
  const variables: string[] = [];
  const source = unquoteAndroid(value);
  const regex = /^%(?:(\d+)\$([-+# 0,(]*\d*(?:\.\d+)?[sdf])|([sdf]))/;
  if (!hasPrintfExpression(source, regex)) {
    if (/%\d+\$/.test(source))
      throw new Error(`Unsupported Android positional format in "${source}"`);
    return {
      pattern: [{ type: "text", value: unescapeAndroid(source) }] as Pattern,
      variables,
    };
  }
  let cursor = 0;
  let implicit = 0;
  let text = "";
  while (cursor < source.length) {
    if (source.startsWith("%%", cursor)) {
      text += "%";
      cursor += 2;
      continue;
    }
    const match = source.slice(cursor).match(regex);
    if (!match) {
      if (source[cursor] === "%")
        throw new Error(
          `Unsupported Android format specifier near "${source.slice(cursor, cursor + 12)}"`,
        );
      text += source[cursor++];
      continue;
    }
    if (text) {
      pattern.push({ type: "text", value: unescapeAndroid(text) });
      text = "";
    }
    const position = match[1] ? Number(match[1]) : ++implicit;
    const specifier = match[2] ?? match[3]!;
    const conversion = specifier.at(-1)!;
    const name =
      conversion === "d" && position === 1 ? "count" : `arg${position}`;
    variables.push(name);
    pattern.push({
      type: "expression",
      arg: { type: "variable-reference", name },
      annotation: {
        type: "function-reference",
        name: "android-printf",
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
  if (text) pattern.push({ type: "text", value: unescapeAndroid(text) });
  if (pattern.length === 0) pattern.push({ type: "text", value: "" });
  return { pattern, variables };
}

function serializePattern(pattern: Pattern, bundle: Bundle) {
  const inputs = bundle.declarations.filter(
    (declaration) => declaration.type === "input-variable",
  );
  const formatted = pattern.some((part) => part.type === "expression");
  const content = pattern
    .map((part) => {
      if (part.type === "text")
        return escapeXmlText(escapeAndroid(part.value, formatted));
      if (part.type !== "expression" || part.arg.type !== "variable-reference")
        throw new Error(
          `Android export only supports plain variable expressions (bundle "${bundle.id}")`,
        );
      const variableName = part.arg.name;
      const position =
        inputs.findIndex((declaration) => declaration.name === variableName) +
        1;
      if (position === 0)
        throw new Error(
          `Variable "${variableName}" is not declared in "${bundle.id}"`,
        );
      const format = printfFormat(part.annotation, position, variableName);
      return `%${format.position}$${format.specifier}`;
    })
    .join("");
  return `"${content}"`;
}

function printfFormat(
  annotation: Extract<Pattern[number], { type: "expression" }>["annotation"],
  fallbackPosition: number,
  variableName: string,
) {
  if (!annotation)
    return {
      position: fallbackPosition,
      specifier: variableName === "count" ? "d" : "s",
    };
  if (
    annotation.type !== "function-reference" ||
    annotation.name !== "android-printf"
  )
    throw new Error(
      `Android export does not support the ${annotation.type} annotation`,
    );
  const option = (name: string) =>
    annotation.options.find((candidate) => candidate.name === name)?.value;
  const specifier = option("specifier");
  const position = option("position");
  if (
    specifier?.type !== "literal" ||
    !/^[-+# 0,(]*\d*(?:\.\d+)?[sdf]$/.test(specifier.value) ||
    position?.type !== "literal" ||
    !/^\d+$/.test(position.value)
  )
    throw new Error("Invalid Android printf annotation");
  return { specifier: specifier.value, position: Number(position.value) };
}

function requiredBundle(bundles: Bundle[], message: Message) {
  const bundle = bundles.find((candidate) => candidate.id === message.bundleId);
  if (!bundle) throw new Error(`Missing bundle "${message.bundleId}"`);
  return bundle;
}
function pluralDeclaration(bundle: Bundle, selector: string) {
  return bundle.declarations.find(
    (declaration) =>
      declaration.type === "local-variable" &&
      declaration.name === selector &&
      declaration.value.annotation?.type === "function-reference" &&
      declaration.value.annotation.name === "plural" &&
      !declaration.value.annotation.options.some(
        (option) =>
          option.name === "type" &&
          option.value.type === "literal" &&
          option.value.value === "ordinal",
      ),
  );
}
function array<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function textValue(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value ?? "");
  const nested = Object.keys(value).filter(
    (key) => key !== "#text" && key !== "name" && key !== "quantity",
  );
  if (nested.length)
    throw new Error(
      `Android inline XML markup is not supported (${nested.join(", ")})`,
    );
  return "#text" in value ? String((value as any)["#text"]) : "";
}
function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeXmlAttribute(value: string) {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
function unescapeAndroid(value: string) {
  return value.replace(
    /\\([\\"'ntr@?])/g,
    (_, escaped: string) =>
      ({
        "\\": "\\",
        '"': '"',
        "'": "'",
        n: "\n",
        t: "\t",
        r: "\r",
        "@": "@",
        "?": "?",
      })[escaped]!,
  );
}
function unquoteAndroid(value: string) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}
function escapeAndroid(value: string, formatted: boolean) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return formatted ? escaped.replace(/%/g, "%%") : escaped;
}
function encode(value: string) {
  return new TextEncoder().encode(value);
}
function decode(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function androidLocaleSuffix(locale: string, baseLocale: string) {
  if (locale === baseLocale) return "";
  const [language, ...parts] = locale.split("-");
  if (!language) throw new Error(`Invalid locale "${locale}"`);
  if (parts.length === 0) return `-${language}`;
  return `-b+${[language, ...parts].join("+")}`;
}

function androidPath(pattern: string, locale: string, baseLocale: string) {
  return pattern.replace("{locale}", androidLocaleSuffix(locale, baseLocale));
}

function assertUnique(seen: Set<string>, locale: string, id: string) {
  const key = `${locale}\0${id}`;
  if (seen.has(key))
    throw new Error(
      `Duplicate Android resource "${id}" for locale "${locale}"`,
    );
  seen.add(key);
}

function assertAndroidResourceName(id: string) {
  if (!/^[\p{L}_][\p{L}\p{N}._-]*$/u.test(id))
    throw new Error(
      `Android cannot preserve resource key "${id}"; AAPT names may contain letters, numbers, dot, underscore, and hyphen`,
    );
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
