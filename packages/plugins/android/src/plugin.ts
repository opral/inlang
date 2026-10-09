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
import { mergeEntries, type Entry, type EntryText } from "./mergeEntries.js";
import { isFalse, scanResources, type ScannedEntry } from "./scanResources.js";

export const PLUGIN_KEY = "plugin.inlang.android";
type Config = { [PLUGIN_KEY]: PluginSettings };
type ImportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["importFiles"]>
>[0];
type ExportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["exportFiles"]>
>[0];
type ExportFile = {
  locale: string;
  name: string;
  content: Uint8Array;
  metadata?: Record<string, unknown>;
};
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
  exportFiles: (args: ExportArgs) => {
    const data = withoutExtraTranslations(args);
    const files = keepUnchangedEntries(exportAndroidFiles(data), data);
    // Hosts that pass the existing files (inlang SDK 4) write each file to
    // `metadata.pathPattern`. Without it, `saveProjectToDirectory` replaces
    // `{locale}` with the locale (`res/valuesde/…`) instead of the Android
    // qualifier (`res/values-de/…`). The path is only given to hosts that
    // pass the files, so that hosts without them (SDK 3), which would
    // overwrite `values/strings.xml` with the full export (without
    // non-translatable strings, `<string-array>`s, comments, …), keep
    // writing where they always did. Apps that write `name` themselves get
    // the right path either way.
    if (!Array.isArray(args.files)) return files;
    return files.map((file) => ({
      ...file,
      metadata: { ...file.metadata, pathPattern: file.name },
    }));
  },
};

/**
 * The data without the messages of other locales than the base locale that
 * have the name of a non-translatable resource of the existing base locale
 * file, unless the file of their locale has them already. Android requires
 * non-translatable resources to exist only in the default `values/` (lint
 * "ExtraTranslation"), so e.g. a German message for `app_name` created in
 * an editor is not written.
 */
function withoutExtraTranslations(args: ExportArgs): ExportArgs {
  const baseLocale = args.settings.baseLocale;
  const base = args.files?.find((file) => file.locale === baseLocale);
  if (base === undefined) return args;
  const names = (content: Uint8Array, translatable?: boolean) => {
    try {
      return new Set(
        scanResources(decode(content))
          .entries.filter(
            (entry) =>
              translatable === undefined || entry.translatable === translatable,
          )
          .map((entry) => `${entry.element}\0${entry.key}`),
      );
    } catch {
      return new Set<string>();
    }
  };
  const nonTranslatable = names(base.content, false);
  if (nonTranslatable.size === 0) return args;
  const existing = new Map<string, Set<string>>();
  const messages = args.messages.filter((message) => {
    if (message.locale === baseLocale) return true;
    const name = `${message.selectors.length === 0 ? "string" : "plurals"}\0${message.bundleId}`;
    if (!nonTranslatable.has(name)) return true;
    if (!existing.has(message.locale)) {
      const file = args.files!.find(
        (candidate) => candidate.locale === message.locale,
      );
      existing.set(
        message.locale,
        file ? names(file.content) : new Set<string>(),
      );
    }
    return existing.get(message.locale)!.has(name);
  });
  return messages.length === args.messages.length
    ? args
    : { ...args, messages };
}

function importAndroidFiles(files: ImportArgs["files"]): {
  bundles: Bundle[];
  messages: MessageImport[];
  variants: VariantImport[];
} {
  const bundles = new Map<string, Bundle>();
  // names are unique per resource type (`<string>`, `<plurals>`)
  const seen = new Set<string>();
  // messages are identified by name, across types
  const imported = new Set<string>();
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    // attributes are `@_name`, child elements `name`
    attributeNamePrefix: "@_",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  for (const file of files) {
    const source = decode(file.content);
    const validation = XMLValidator.validate(source);
    if (validation !== true)
      throw new Error(`Invalid Android resources XML: ${validation.err.msg}`);
    let resources = parser.parse(source)?.resources;
    // `<resources></resources>`, e.g. a locale without translations yet
    if (typeof resources === "string" && resources.trim() === "")
      resources = {};
    if (!resources || typeof resources !== "object")
      throw new Error("Android resources XML must contain a <resources> root");
    for (const item of array(resources.string)) {
      if (!item || typeof item !== "object" || !("@_name" in item))
        throw new Error("Every Android <string> must have a name attribute");
      const id = String(item["@_name"]);
      assertUnique(seen, file.locale, "string", id);
      if (!isTranslatable(item)) continue;
      assertNoProduct(item, id);
      assertOneMessage(imported, file.locale, id);
      // `formatted="false"`: `%` is text, e.g. "Save 50% on %s"
      const parsed = isFalse(item["@_formatted"])
        ? parseUnformatted(textValue(item))
        : parseAndroidPattern(textValue(item));
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
      if (!plural || typeof plural !== "object" || !("@_name" in plural))
        throw new Error("Every Android <plurals> must have a name attribute");
      const id = String(plural["@_name"]);
      assertUnique(seen, file.locale, "plurals", id);
      if (!isTranslatable(plural)) continue;
      assertNoProduct(plural, id);
      assertOneMessage(imported, file.locale, id);
      const parsedItems = array(plural.item).map((item) => {
        const quantity = String(
          item && typeof item === "object" ? item["@_quantity"] : undefined,
        );
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

/**
 * Keeps the text of the entries of the existing files that didn't change
 * (comments, whitespace, order, escapes, the XML declaration, and elements
 * that the plugin doesn't import, e.g. `<string-array>` or a `<string>` with
 * `translatable="false"`), so that an export only changes the bytes of edited
 * messages.
 *
 * A `<string>` or `<plurals>` element is unchanged if the plugin writes the
 * same element for it as for what the previous element imports to. Plurals
 * are compared item by item. Of changed elements and items, only the content
 * is replaced, so that their attributes (e.g. `tools:ignore`) are kept; removed
 * ones are removed with the comment directly above them, and new ones are
 * inserted after the one that precedes them in the full export. The result is
 * only used if it imports to what the full export imports to. Otherwise, and
 * if a previous file can't be read, the full export is used.
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
  // keeps a byte order mark
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    args.previous,
  );
  const exportedText = decode(args.exported);
  /** The text the plugin writes for what `text` imports to. */
  const canonical = (text: string) => {
    const imported = importAndroidFiles([
      { locale: args.locale, content: encode(text) },
    ]);
    const files = exportAndroidFiles({
      ...rowsOf(imported),
      settings: args.settings,
    });
    const file = files.find((candidate) => candidate.locale === args.locale);
    return file === undefined ? "" : decode(file.content);
  };
  const scanned = scanResources(text);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = scanned.indent ?? "  ";
  const next = entryTexts(exportedText);
  const exportedEntries = new Map(
    scanResources(exportedText).entries.map((entry) => [entry.key, entry]),
  );
  /** Names of `<string>`s that the full export writes as only text. */
  const textOnly = new Set(
    rowsOf(
      importAndroidFiles([{ locale: args.locale, content: args.exported }]),
    )
      .variants.filter((variant) =>
        variant.pattern.every((part) => part.type === "text"),
      )
      .map((variant) => variant.messageId.split("\u0000")[0]!),
  );
  /** Start tags of `<string>`s with `formatted` added or removed, by name. */
  const startTags = new Map<string, string>();
  /** The element of the file in the merge, see `ScannedEntry`. */
  const toEntry = (entry: ScannedEntry): Entry | undefined => {
    const exported = exportedEntries.get(entry.key);
    if (!entry.translatable) {
      // Non-translatable elements are not imported and kept like other
      // text. If the new data has a message with the name of one of the
      // same type, the message replaces it, so that the file doesn't define
      // the name twice.
      return exported?.element === entry.element
        ? { key: entry.key, start: entry.start, end: entry.end }
        : undefined;
    }
    // Only the content of an edited `<string>` is written if it reads as
    // the new text in the start tag of the file, i.e. with or without
    // `formatted="false"` as needed. Otherwise the start tag is written
    // too, with only `formatted` added or removed.
    const keepsStartTag =
      entry.element !== "string" ||
      exported === undefined ||
      (entry.unformatted ? textOnly.has(entry.key) : !exported.unformatted);
    let valueRange = entry.valueRange;
    if (!keepsStartTag && valueRange) {
      startTags.set(
        entry.key,
        withFormatted(
          text.slice(entry.start, valueRange.start),
          exported!.unformatted,
        ),
      );
      valueRange = { start: entry.start, end: valueRange.end };
    }
    return {
      key: entry.key,
      start: entry.start,
      end: entry.end,
      ...(valueRange ? { valueRange } : {}),
      ...(entry.children
        ? { children: entry.children.flatMap((child) => toEntry(child) ?? []) }
        : {}),
    };
  };
  const entries = scanned.entries.flatMap((entry) => toEntry(entry) ?? []);
  const result = mergeEntries({
    text,
    entries,
    comments: scanned.comments,
    previous: entryTexts(canonical(text)),
    next: withStartTags(next, scanned.entries, startTags),
    indentUnit: "  ",
    fileIndentUnit: indent === "" ? "  " : indent,
    emptyIndent: indent,
    insertIntoEmpty: (elements) => {
      const at = scanned.closeTagStart;
      if (scanned.emptyRoot)
        // `<resources/>` becomes `<resources>…</resources>`
        return {
          start: at,
          end: at + 2,
          text:
            ">" +
            elements.map((element) => newline + indent + element).join("") +
            newline +
            "</resources>",
        };
      const lineStart = text.lastIndexOf("\n", at - 1) + 1;
      // before the line of `</resources>`, or before the tag
      return /^[ \t]*$/.test(text.slice(lineStart, at))
        ? {
            start: lineStart,
            end: lineStart,
            text: elements
              .map((element) => indent + element + newline)
              .join(""),
          }
        : {
            start: at,
            end: at,
            text:
              elements.map((element) => newline + indent + element).join("") +
              newline,
          };
    },
  });
  if (result === undefined) return undefined;
  // Only use the result if it imports to what the full export imports to.
  if (
    !sameEntries(
      entryTexts(canonical(result)),
      entryTexts(canonical(exportedText)),
    )
  )
    return undefined;
  return encode(result);
}

/**
 * The elements of a file the plugin writes, by name, with lines after the
 * first relative to the indentation of the element.
 */
function entryTexts(text: string): Map<string, EntryText> {
  const result = new Map<string, EntryText>();
  // no file: no elements
  if (text === "") return result;
  for (const entry of scanResources(text).entries) {
    const lineStart = text.lastIndexOf("\n", entry.start - 1) + 1;
    const base = text.slice(lineStart, entry.start);
    const element = text
      .slice(entry.start, entry.end)
      .split("\n")
      .map((line, index) =>
        index > 0 && line.startsWith(base) ? line.slice(base.length) : line,
      )
      .join("\n");
    result.set(entry.key, {
      text: element,
      ...valueText(text, entry),
      ...(entry.children
        ? {
            shell: /^<[^>]*>/.exec(element)![0],
            children: new Map(
              entry.children.map((child) => [
                child.key,
                {
                  text: text.slice(child.start, child.end),
                  ...valueText(text, child),
                },
              ]),
            ),
          }
        : {}),
    });
  }
  return result;
}

/**
 * `next` with the text that replaces the `valueRange` of the elements of
 * the file (see `ScannedEntry`): of a self-closing element, the `/>` is
 * replaced with `>value</string>`, and of an element in `startTags`, the
 * start tag is replaced too.
 */
function withStartTags(
  next: Map<string, EntryText>,
  entries: ScannedEntry[],
  startTags: Map<string, string>,
): Map<string, EntryText> {
  const adapt = (
    entry: ScannedEntry,
    text: EntryText | undefined,
    startTag?: string,
  ): EntryText | undefined => {
    if (text === undefined) return undefined;
    if (
      (entry.selfClosing || startTag !== undefined) &&
      text.valueText !== undefined
    )
      return {
        ...text,
        valueText:
          (startTag ?? "") +
          (entry.selfClosing
            ? `>${text.valueText}</${entry.element}>`
            : text.valueText),
      };
    if (!entry.children?.some((child) => child.selfClosing)) return text;
    const children = new Map(text.children);
    for (const child of entry.children) {
      const adapted = adapt(child, children.get(child.key));
      if (adapted !== undefined) children.set(child.key, adapted);
    }
    return { ...text, children };
  };
  const result = new Map(next);
  for (const entry of entries) {
    const adapted = adapt(
      entry,
      result.get(entry.key),
      startTags.get(entry.key),
    );
    if (adapted !== undefined) result.set(entry.key, adapted);
  }
  return result;
}

/**
 * A start tag (without `>` or `/>` if self-closing) with `formatted="false"`
 * after the name if `unformatted`, else without a `formatted` attribute.
 */
function withFormatted(startTag: string, unformatted: boolean) {
  const without = startTag.replace(
    /\s+formatted\s*=\s*(?:"[^"]*"|'[^']*')/,
    "",
  );
  return unformatted
    ? without.replace(
        /\sname\s*=\s*(?:"[^"]*"|'[^']*')/,
        (name) => `${name} formatted="false"`,
      )
    : without;
}

/** The content of an element the plugin writes, see `Entry.valueRange`. */
function valueText(text: string, entry: Entry) {
  return entry.valueRange
    ? { valueText: text.slice(entry.valueRange.start, entry.valueRange.end) }
    : {};
}

/**
 * Whether two files the plugin writes have the same elements, regardless of
 * the order of elements and plural items.
 */
function sameEntries(
  a: Map<string, EntryText>,
  b: Map<string, EntryText>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, entry] of a) {
    const other = b.get(key);
    if (other === undefined) return false;
    if (entry.children === undefined || other.children === undefined) {
      if (entry.text !== other.text) return false;
      continue;
    }
    if (
      entry.shell !== other.shell ||
      entry.children.size !== other.children.size ||
      [...entry.children].some(
        ([quantity, item]) => other.children!.get(quantity)?.text !== item.text,
      )
    )
      return false;
  }
  return true;
}

/** Bundles, messages and variants with ids from the result of an import. */
function rowsOf(imported: ReturnType<typeof importAndroidFiles>) {
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

function exportAndroidFiles({
  bundles,
  messages,
  variants,
  settings,
}: Omit<ExportArgs, "files">) {
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
      const pattern = messageVariants[0]!.pattern;
      lines.push(
        `  <string name="${escapeXmlAttribute(bundle.id)}"${needsUnformatted(pattern) ? ' formatted="false"' : ""}>${serializePattern(pattern, bundle)}</string>`,
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

/** The pattern of a `formatted="false"` string: only text. */
function parseUnformatted(value: string) {
  return {
    pattern: [
      { type: "text", value: unescapeAndroid(unquoteAndroid(value)) },
    ] as Pattern,
    variables: [] as string[],
  };
}

/**
 * Whether the text of a pattern without expressions must be written with
 * `formatted="false"`, because it reads as printf, e.g. "Save 50% on %s".
 */
function needsUnformatted(pattern: Pattern) {
  if (pattern.some((part) => part.type !== "text")) return false;
  const text = pattern
    .map((part) => (part as { value: string }).value)
    .join("");
  try {
    const parsed = parseAndroidPattern(`"${escapeAndroid(text, false)}"`);
    return !(
      parsed.pattern.length === 1 &&
      parsed.pattern[0]!.type === "text" &&
      parsed.pattern[0]!.value === text
    );
  } catch {
    return true;
  }
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
/**
 * The text of a `<string>` or `<item>`. Attributes (`@_…`) other than
 * `name`, `quantity` and `product` don't change the text and are accepted,
 * e.g. `formatted="false"` or `tools:ignore="MissingTranslation"`. They are
 * kept on export if the element is in the existing file.
 */
function textValue(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value ?? "");
  const nested = Object.keys(value).filter(
    (key) => key !== "#text" && !key.startsWith("@_"),
  );
  if (nested.length)
    throw new Error(
      `Android inline XML markup is not supported (${nested.join(", ")})`,
    );
  return "#text" in value ? String((value as any)["#text"]) : "";
}
/**
 * Whether a `<string>` or `<plurals>` is translatable.
 *
 * Non-translatable resources (`translatable="false"`, e.g. the app name,
 * URLs or keys) are not imported: Android requires them to exist only in
 * the default `values/` (lint "ExtraTranslation"), so they must never be
 * written to the file of another locale. On export with the existing files,
 * they are kept byte for byte like the other elements that the plugin
 * doesn't import (`<string-array>`, `<color>`, …).
 */
function isTranslatable(element: Record<string, unknown>) {
  return !isFalse(element["@_translatable"]);
}
function assertNoProduct(element: Record<string, unknown>, id: string) {
  // several elements with one name, one per product, can't be represented
  if ("@_product" in element)
    throw new Error(
      `Android product-specific resources are not supported ("${id}" has product="${element["@_product"]}")`,
    );
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

function assertUnique(
  seen: Set<string>,
  locale: string,
  type: string,
  id: string,
) {
  const key = `${locale}\0${type}\0${id}`;
  if (seen.has(key))
    throw new Error(
      `Duplicate Android resource <${type} name="${id}"> for locale "${locale}"`,
    );
  seen.add(key);
}

/**
 * A translatable `<string>` and `<plurals>` may share a name in Android,
 * but would be the same message in inlang.
 */
function assertOneMessage(imported: Set<string>, locale: string, id: string) {
  const key = `${locale}\0${id}`;
  if (imported.has(key))
    throw new Error(
      `Android <string> and <plurals> "${id}" can't both be translated for locale "${locale}": inlang identifies messages by name. Rename one or mark it translatable="false".`,
    );
  imported.add(key);
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
