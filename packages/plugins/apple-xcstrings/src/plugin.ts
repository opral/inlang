import type {
  Bundle,
  Declaration,
  InlangPlugin,
  Message,
  MessageImport,
  Pattern,
  Variant,
  VariantImport,
} from "@inlang/sdk";
import { PluginSettings } from "./settings.js";

export const PLUGIN_KEY = "plugin.inlang.apple-xcstrings";
type Config = { [PLUGIN_KEY]: PluginSettings };
type ImportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["importFiles"]>
>[0];
type ExportArgs = Parameters<
  NonNullable<InlangPlugin<Config>["exportFiles"]>
>[0];
type StringUnit = { state?: string; value: string };
type VariationUnit = { stringUnit: StringUnit };
type Localization = {
  stringUnit?: StringUnit;
  substitutions?: Record<
    string,
    {
      argNum?: number;
      formatSpecifier: string;
      variations: { plural: Record<string, VariationUnit> };
    }
  >;
  variations?: {
    device?: Record<string, VariationUnit>;
    plural?: Record<string, VariationUnit>;
  };
};
type Catalog = {
  sourceLanguage: string;
  strings: Record<
    string,
    {
      extractionState?: string;
      localizations?: Record<string, Localization>;
    }
  >;
  version: "1.0";
};

const pluralCategories = new Set([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);
const deviceCategories = new Set([
  "appletv",
  "applevision",
  "applewatch",
  "ipad",
  "iphone",
  "ipod",
  "mac",
  "other",
]);

export const plugin: InlangPlugin<Config> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,
  toBeImportedFiles: ({ settings }) => [
    {
      locale: settings.baseLocale,
      path: settings[PLUGIN_KEY].pathPattern,
    },
  ],
  importFiles: ({ files, settings }: ImportArgs) =>
    importCatalogs(files, settings),
  exportFiles: (args: ExportArgs) => exportCatalog(args),
};

function importCatalogs(
  files: ImportArgs["files"],
  settings: ImportArgs["settings"],
) {
  if (files.length !== 1)
    throw new Error(
      `Apple .xcstrings expects exactly one catalog, received ${files.length}`,
    );
  const catalog = parseCatalog(files[0]!.content);
  if (catalog.sourceLanguage !== settings.baseLocale)
    throw new Error(
      `Apple .xcstrings sourceLanguage "${catalog.sourceLanguage}" must match baseLocale "${settings.baseLocale}"`,
    );
  const bundles = new Map<string, Bundle>();
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  for (const [id, entry] of Object.entries(catalog.strings)) {
    if (!entry || typeof entry !== "object")
      throw new Error(`Invalid catalog entry "${id}"`);
    if (!entry.localizations || Object.keys(entry.localizations).length === 0)
      throw new Error(
        `Apple .xcstrings source-only entry "${id}" has no localization value to import`,
      );
    for (const [locale, localization] of Object.entries(
      entry.localizations ?? {},
    )) {
      if (!settings.locales.includes(locale))
        throw new Error(
          `Apple .xcstrings locale "${locale}" in "${id}" is not declared in project settings`,
        );
      const imported = importLocalization(id, localization);
      const existing = bundles.get(id) ?? { id, declarations: [] };
      bundles.set(id, mergeDeclarations(existing, imported.declarations));
      messages.push({ bundleId: id, locale, selectors: imported.selectors });
      for (const variant of imported.variants)
        variants.push({
          messageBundleId: id,
          messageLocale: locale,
          ...variant,
        });
    }
  }
  return { bundles: [...bundles.values()], messages, variants };
}

function importLocalization(id: string, localization: Localization) {
  assertObject(localization, `localization for "${id}"`);
  const hasPlain = localization.stringUnit !== undefined;
  const substitutions = localization.substitutions ?? {};
  const hasPlural = Object.keys(substitutions).length > 0;
  const hasDevice = localization.variations?.device !== undefined;
  const hasDirectPlural = localization.variations?.plural !== undefined;
  if (
    [hasPlain && !hasPlural, hasPlural, hasDevice, hasDirectPlural].filter(
      Boolean,
    ).length !== 1
  )
    throw new Error(
      `Apple .xcstrings entry "${id}" must contain exactly one supported localization shape`,
    );
  if (hasDevice) {
    const units = localization.variations!.device!;
    assertVariationUnits(units, id, "device", deviceCategories);
    const parsed = Object.entries(units).map(([key, unit]) => ({
      key,
      parsed: parsePattern(unit.stringUnit.value),
    }));
    return {
      declarations: [
        { type: "input-variable", name: "device" } as Declaration,
        ...inputDeclarations(
          parsed.flatMap(({ parsed }) => parsed.variables),
          ["device"],
        ),
      ],
      selectors: [{ type: "variable-reference" as const, name: "device" }],
      variants: parsed.map(({ key, parsed }) => ({
        matches: [match("device", key)],
        pattern: parsed.pattern,
      })),
    };
  }
  if (hasDirectPlural) {
    const units = localization.variations!.plural!;
    assertVariationUnits(units, id, "plural", pluralCategories);
    const sourcePattern = parsePattern(id);
    const parsed = Object.entries(units).map(([key, unit]) => ({
      key,
      parsed: parsePattern(unit.stringUnit.value),
    }));
    const format = inferDirectPluralFormat(id, sourcePattern.pattern, parsed);
    const inputName = `arg${format.position}`;
    const selector = "countPlural";
    return {
      declarations: [
        { type: "input-variable", name: inputName } as Declaration,
        pluralDeclaration(selector, inputName, {
          appleFormatSpecifier: format.specifier,
          appleArgNum: String(format.position),
          applePluralStyle: "direct",
        }),
        ...inputDeclarations(
          parsed.flatMap(({ parsed }) => parsed.variables),
          [inputName, selector],
        ),
      ],
      selectors: [{ type: "variable-reference" as const, name: selector }],
      variants: parsed.map(({ key, parsed }) => ({
        matches: [match(selector, key)],
        pattern: parsed.pattern,
      })),
    };
  }
  if (hasPlural) {
    if (Object.keys(substitutions).length !== 1)
      throw new Error(
        `Apple .xcstrings entry "${id}" has multiple substitutions, which are not representable by one Inlang selector`,
      );
    const [name, substitution] = Object.entries(substitutions)[0]!;
    if (!substitution?.variations?.plural)
      throw new Error(
        `Apple .xcstrings substitution "${name}" in "${id}" must contain plural variations`,
      );
    assertPrintfSpecifier(substitution.formatSpecifier, id);
    assertVariationUnits(
      substitution.variations.plural,
      id,
      "plural",
      pluralCategories,
    );
    const argNum = substitution.argNum ?? 1;
    if (!Number.isSafeInteger(argNum) || argNum < 1)
      throw new Error(
        `Invalid Apple .xcstrings argNum in substitution "${name}" of "${id}"`,
      );
    const inputName = `arg${argNum}`;
    const template = requiredStringUnit(localization.stringUnit, id).value;
    const token = `%#@${name}@`;
    if (template.split(token).length !== 2)
      throw new Error(
        `Apple .xcstrings substitution template in "${id}" must contain exactly one ${token}`,
      );
    const [prefix, suffix] = template.split(token);
    if (
      hasImplicitPrintfExpression(prefix!) ||
      hasImplicitPrintfExpression(suffix!)
    )
      throw new Error(
        `Apple .xcstrings substitution template in "${id}" cannot mix implicit printf arguments with positional argNum`,
      );
    const parsedPrefix = parsePattern(prefix!);
    const parsedSuffix = parsePattern(
      suffix!,
      Math.max(argNum + 1, parsedPrefix.nextImplicit),
    );
    const parsed = Object.entries(substitution.variations.plural).map(
      ([key, unit]) => ({
        key,
        parsed: parsePattern(unit.stringUnit.value, argNum),
      }),
    );
    return {
      declarations: [
        { type: "input-variable", name: inputName } as Declaration,
        pluralDeclaration(name, inputName, {
          appleFormatSpecifier: substitution.formatSpecifier,
          appleArgNum: String(argNum),
          applePluralStyle: "substitution",
        }),
        ...inputDeclarations(
          [
            ...parsedPrefix.variables,
            ...parsed.flatMap(({ parsed }) => parsed.variables),
            ...parsedSuffix.variables,
          ],
          [inputName, name],
        ),
      ],
      selectors: [{ type: "variable-reference" as const, name }],
      variants: parsed.map(({ key, parsed }) => ({
        matches: [match(name, key)],
        pattern: [
          ...parsedPrefix.pattern,
          ...parsed.pattern,
          ...parsedSuffix.pattern,
        ],
      })),
    };
  }
  const parsed = parsePattern(
    requiredStringUnit(localization.stringUnit, id).value,
  );
  return {
    declarations: inputDeclarations(parsed.variables),
    selectors: [],
    variants: [{ matches: [], pattern: parsed.pattern }],
  };
}

function exportCatalog({ bundles, messages, variants, settings }: ExportArgs) {
  assertUniqueIds(bundles, "bundle");
  assertUniqueIds(messages, "message");
  const messageIds = new Set(messages.map((message) => message.id));
  const bundleIds = new Set(bundles.map((bundle) => bundle.id));
  for (const message of messages)
    if (!bundleIds.has(message.bundleId))
      throw new Error(
        `Apple .xcstrings message "${message.id}" references missing bundle "${message.bundleId}"`,
      );
  for (const variant of variants)
    if (!messageIds.has(variant.messageId))
      throw new Error(
        `Apple .xcstrings variant "${variant.id}" references missing message "${variant.messageId}"`,
      );
  const stringEntries: Array<[string, Catalog["strings"][string]]> = [];
  for (const bundle of bundles) {
    const bundleMessages = messages.filter(
      (message) => message.bundleId === bundle.id,
    );
    if (bundleMessages.length === 0) continue;
    const localizations: Record<string, Localization> = {};
    for (const message of bundleMessages) {
      if (localizations[message.locale])
        throw new Error(
          `Duplicate Apple .xcstrings locale "${message.locale}" in "${bundle.id}"`,
        );
      localizations[message.locale] = exportLocalization(
        bundle,
        message,
        variants,
      );
    }
    stringEntries.push([
      bundle.id,
      { extractionState: "manual", localizations },
    ]);
  }
  const catalog: Catalog = {
    sourceLanguage: settings.baseLocale,
    strings: Object.fromEntries(
      stringEntries.sort(([a], [b]) => a.localeCompare(b)),
    ),
    version: "1.0",
  };
  return [
    {
      locale: settings.baseLocale,
      name: settings[PLUGIN_KEY]?.pathPattern ?? "Localizable.xcstrings",
      content: new TextEncoder().encode(
        `${JSON.stringify(catalog, null, 2)}\n`,
      ),
    },
  ];
}

function exportLocalization(
  bundle: Bundle,
  message: Message,
  variants: Variant[],
): Localization {
  const messageVariants = variants.filter(
    (variant) => variant.messageId === message.id,
  );
  if (message.selectors.length === 0) {
    if (
      messageVariants.length !== 1 ||
      messageVariants[0]!.matches.length !== 0
    )
      throw new Error(
        `Apple .xcstrings requires one unconditional variant in "${bundle.id}"`,
      );
    return {
      stringUnit: translated(
        serializePattern(messageVariants[0]!.pattern, bundle),
      ),
    };
  }
  if (message.selectors.length !== 1)
    throw new Error(
      `Apple .xcstrings currently supports one selector per message (bundle "${bundle.id}")`,
    );
  const selector = message.selectors[0]!.name;
  const plural = pluralInput(bundle, selector);
  const units = variationUnits(bundle, messageVariants, selector);
  if (plural) {
    for (const key of Object.keys(units))
      if (!pluralCategories.has(key))
        throw new Error(
          `Unsupported Apple plural category "${key}" in "${bundle.id}"`,
        );
    const pluralDeclaration = bundle.declarations.find(
      (declaration) => declaration.name === selector,
    );
    const annotation =
      pluralDeclaration?.type === "local-variable"
        ? pluralDeclaration.value.annotation
        : undefined;
    const storedSpecifier = literalOption(annotation, "appleFormatSpecifier");
    const storedArgNum = literalOption(annotation, "appleArgNum");
    const pluralStyle = literalOption(annotation, "applePluralStyle");
    const argNum = storedArgNum
      ? Number(storedArgNum)
      : inputPosition(bundle, plural);
    const formatSpecifier = storedSpecifier ?? "lld";
    if (!Number.isSafeInteger(argNum) || argNum < 1)
      throw new Error(
        `Invalid Apple plural argument position in "${bundle.id}"`,
      );
    assertPrintfSpecifier(formatSpecifier, bundle.id);
    if (pluralStyle === "direct") {
      return { variations: { plural: units } };
    }
    return {
      stringUnit: translated(`%#@${selector}@`),
      substitutions: {
        [selector]: {
          argNum,
          formatSpecifier,
          variations: { plural: units },
        },
      },
    };
  }
  if (selector === "device") return { variations: { device: units } };
  throw new Error(
    `Apple .xcstrings cannot represent selector "${selector}" in "${bundle.id}"`,
  );
}

function variationUnits(bundle: Bundle, variants: Variant[], selector: string) {
  const units: Record<string, VariationUnit> = {};
  let catchalls = 0;
  for (const variant of variants) {
    if (variant.matches.length !== 1 || variant.matches[0]!.key !== selector)
      throw new Error(`Invalid Apple .xcstrings matches in "${bundle.id}"`);
    const matchValue =
      variant.matches[0]!.type === "catchall-match"
        ? "other"
        : variant.matches[0]!.value;
    if (variant.matches[0]!.type === "catchall-match") catchalls++;
    if (units[matchValue])
      throw new Error(
        `Duplicate Apple variation "${matchValue}" in "${bundle.id}"`,
      );
    units[matchValue] = {
      stringUnit: translated(
        serializePattern(variant.pattern, bundle, {
          variableName: pluralInput(bundle, selector),
          specifier: pluralSpecifier(bundle, selector),
        }),
      ),
    };
  }
  if (catchalls !== 1 || !units.other)
    throw new Error(
      `Apple variations in "${bundle.id}" require exactly one catchall/other variant`,
    );
  return units;
}

function wrapPattern(
  prefix: string,
  pattern: Pattern,
  suffix: string,
): Pattern {
  return [
    ...(prefix ? [{ type: "text" as const, value: prefix }] : []),
    ...pattern,
    ...(suffix ? [{ type: "text" as const, value: suffix }] : []),
  ];
}

function inferDirectPluralFormat(
  id: string,
  sourcePattern: Pattern,
  variants: Array<{ parsed: { pattern: Pattern } }>,
) {
  const sourceExpressions = sourcePattern.filter(
    (part) => part.type === "expression",
  );
  const candidates = sourceExpressions.length
    ? sourceExpressions
    : variants.flatMap(({ parsed }) =>
        parsed.pattern.filter((part) => part.type === "expression"),
      );
  if (!candidates.length)
    throw new Error(
      `Direct Apple plural "${id}" must contain a numeric printf argument in its key or variants`,
    );
  const formats = candidates.map((expression) => {
    if (expression.arg.type !== "variable-reference")
      throw new Error(`Invalid direct Apple plural argument in "${id}"`);
    return printfFormat(
      expression.annotation,
      argumentPosition(expression.arg.name),
    );
  });
  const numericFormats = formats.filter((format) =>
    /(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaA]$/.test(format.specifier),
  );
  const first = numericFormats[0]!;
  if (
    !first ||
    numericFormats.some(
      (format) =>
        format.position !== first.position ||
        format.specifier !== first.specifier,
    )
  )
    throw new Error(
      `Direct Apple plural "${id}" must use one consistent numeric argument`,
    );
  return first;
}

function parseCatalog(content: Uint8Array): Catalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(content));
  } catch (error) {
    throw new Error(
      `Invalid Apple .xcstrings JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertObject(parsed, "Apple .xcstrings catalog");
  if (parsed.version !== "1.0" || typeof parsed.sourceLanguage !== "string")
    throw new Error(
      "Apple .xcstrings requires version 1.0 and a sourceLanguage",
    );
  assertObject(parsed.strings, "Apple .xcstrings strings");
  return parsed as Catalog;
}

function parsePattern(value: string, implicitStart = 1) {
  const pattern: Pattern = [];
  const variables: string[] = [];
  const regex =
    /^%(?:(\d+)\$([-+# 0,(]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@])|((?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@]))/;
  if (!hasPrintfExpression(value, regex))
    return {
      pattern: [{ type: "text", value }] as Pattern,
      variables,
      nextImplicit: implicitStart,
    };
  let cursor = 0;
  let implicit = implicitStart - 1;
  let sawImplicit = false;
  let sawExplicit = false;
  const specifiersByPosition = new Map<number, string>();
  let text = "";
  while (cursor < value.length) {
    if (value.startsWith("%%", cursor)) {
      text += "%";
      cursor += 2;
      continue;
    }
    const found = value.slice(cursor).match(regex);
    if (!found) {
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
    if (found[1]) sawExplicit = true;
    else sawImplicit = true;
    if (sawExplicit && sawImplicit)
      throw new Error(
        `Apple format strings cannot mix positional and implicit specifiers in "${value}"`,
      );
    const position = found[1] ? Number(found[1]) : ++implicit;
    const specifier = found[2] ?? found[3]!;
    const previousSpecifier = specifiersByPosition.get(position);
    if (previousSpecifier && previousSpecifier !== specifier)
      throw new Error(
        `Apple argument ${position} uses incompatible specifiers "${previousSpecifier}" and "${specifier}"`,
      );
    specifiersByPosition.set(position, specifier);
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
    cursor += found[0].length;
  }
  if (text) pattern.push({ type: "text", value: text });
  return { pattern, variables, nextImplicit: implicit + 1 };
}

function serializePattern(
  pattern: Pattern,
  bundle: Bundle,
  numericDefault?: {
    variableName: string | undefined;
    specifier: string | undefined;
  },
) {
  const formatted = pattern.some((part) => part.type === "expression");
  return pattern
    .map((part) => {
      if (part.type === "text")
        return formatted ? part.value.replace(/%/g, "%%") : part.value;
      if (part.type !== "expression" || part.arg.type !== "variable-reference")
        throw new Error(
          `Apple .xcstrings only supports plain variable expressions (bundle "${bundle.id}")`,
        );
      const fallback = inputPosition(bundle, part.arg.name);
      const format =
        !part.annotation &&
        numericDefault?.variableName === part.arg.name &&
        numericDefault.specifier
          ? { position: fallback, specifier: numericDefault.specifier }
          : printfFormat(part.annotation, fallback);
      return `%${format.position}$${format.specifier}`;
    })
    .join("");
}

function printfFormat(
  annotation: Extract<Pattern[number], { type: "expression" }>["annotation"],
  fallback: number,
) {
  if (!annotation) return { position: fallback, specifier: "@" };
  if (
    annotation.type !== "function-reference" ||
    annotation.name !== "apple-printf"
  )
    throw new Error(
      `Apple .xcstrings does not support the ${annotation.type} annotation`,
    );
  const option = (name: string) =>
    annotation.options.find((candidate) => candidate.name === name)?.value;
  const specifier = option("specifier");
  const position = option("position");
  if (
    specifier?.type !== "literal" ||
    position?.type !== "literal" ||
    !/^\d+$/.test(position.value)
  )
    throw new Error("Invalid Apple printf annotation");
  assertPrintfSpecifier(specifier.value, "pattern");
  return { specifier: specifier.value, position: Number(position.value) };
}

function literalOption(
  annotation: Extract<Pattern[number], { type: "expression" }>["annotation"],
  name: string,
) {
  if (annotation?.type !== "function-reference") return undefined;
  const value = annotation.options.find(
    (option) => option.name === name,
  )?.value;
  return value?.type === "literal" ? value.value : undefined;
}

function assertUniqueIds(rows: Array<{ id: string }>, kind: string) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id))
      throw new Error(`Duplicate Apple .xcstrings ${kind} id "${row.id}"`);
    seen.add(row.id);
  }
}

function pluralInput(bundle: Bundle, selector: string) {
  const declaration = bundle.declarations.find(
    (candidate) => candidate.name === selector,
  );
  if (
    declaration?.type !== "local-variable" ||
    declaration.value.annotation?.type !== "function-reference" ||
    declaration.value.annotation.name !== "plural" ||
    declaration.value.arg.type !== "variable-reference"
  )
    return undefined;
  for (const option of declaration.value.annotation.options) {
    if (!option.name.startsWith("apple"))
      throw new Error(
        `Apple .xcstrings does not support plural option "${option.name}" in "${bundle.id}"`,
      );
  }
  return declaration.value.arg.name;
}

function pluralSpecifier(bundle: Bundle, selector: string) {
  const declaration = bundle.declarations.find(
    (candidate) => candidate.name === selector,
  );
  if (declaration?.type !== "local-variable") return undefined;
  return (
    literalOption(declaration.value.annotation, "appleFormatSpecifier") ?? "lld"
  );
}

function pluralDeclaration(
  name: string,
  inputName: string,
  options: Record<string, string>,
) {
  return {
    type: "local-variable",
    name,
    value: {
      type: "expression",
      arg: { type: "variable-reference", name: inputName },
      annotation: {
        type: "function-reference",
        name: "plural",
        options: Object.entries(options).map(([optionName, value]) => ({
          name: optionName,
          value: { type: "literal", value },
        })),
      },
    },
  } as Declaration;
}

function inputPosition(bundle: Bundle, name: string) {
  const inputs = bundle.declarations.filter(
    (declaration) => declaration.type === "input-variable",
  );
  if (!inputs.some((declaration) => declaration.name === name))
    throw new Error(`Variable "${name}" is not declared in "${bundle.id}"`);
  const namedMatch = /^arg([1-9]\d*)$/.exec(name);
  if (namedMatch) {
    const namedPosition = Number(namedMatch[1]);
    if (Number.isSafeInteger(namedPosition)) return namedPosition;
  }
  const position =
    inputs.findIndex((declaration) => declaration.name === name) + 1;
  if (position === 0)
    throw new Error(`Variable "${name}" is not declared in "${bundle.id}"`);
  return position;
}

function mergeDeclarations(bundle: Bundle, declarations: Declaration[]) {
  const byName = new Map(
    bundle.declarations.map((declaration) => [declaration.name, declaration]),
  );
  for (const declaration of declarations) {
    const current = byName.get(declaration.name);
    if (current && JSON.stringify(current) !== JSON.stringify(declaration))
      throw new Error(
        `Inconsistent declaration "${declaration.name}" across Apple catalog locales in "${bundle.id}"`,
      );
    byName.set(declaration.name, declaration);
  }
  return { ...bundle, declarations: [...byName.values()] };
}

function inputDeclarations(names: string[], excluded: string[] = []) {
  return [...new Set(names)]
    .filter((name) => !excluded.includes(name))
    .sort(
      (a, b) => argumentPosition(a) - argumentPosition(b) || a.localeCompare(b),
    )
    .map((name) => ({ type: "input-variable", name }) as Declaration);
}
function argumentPosition(name: string) {
  const match = /^arg(\d+)$/.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
function translated(value: string): StringUnit {
  return { state: "translated", value };
}
function match(key: string, value: string) {
  return value === "other"
    ? { type: "catchall-match" as const, key }
    : { type: "literal-match" as const, key, value };
}
function requiredStringUnit(unit: StringUnit | undefined, id: string) {
  if (!unit || typeof unit.value !== "string")
    throw new Error(`Missing stringUnit value in "${id}"`);
  return unit;
}
function assertVariationUnits(
  units: Record<string, VariationUnit>,
  id: string,
  kind: string,
  allowed: Set<string> | undefined,
) {
  assertObject(units, `${kind} variations in "${id}"`);
  if (Object.keys(units).length === 0 || !units.other)
    throw new Error(`Apple ${kind} variations in "${id}" require "other"`);
  for (const [key, unit] of Object.entries(units)) {
    if (allowed && !allowed.has(key))
      throw new Error(`Unsupported Apple ${kind} value "${key}" in "${id}"`);
    requiredStringUnit(unit?.stringUnit, id);
  }
}
function assertPrintfSpecifier(value: string, id: string) {
  if (
    !/^[-+# 0,(]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@]$/.test(
      value,
    )
  )
    throw new Error(`Invalid Apple printf specifier "${value}" in "${id}"`);
}
function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
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

function hasImplicitPrintfExpression(source: string) {
  const implicit =
    /^%(?!\d+\$)(?:[-+# 0,(]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?[diuoxXfFeEgGaAcCsSp@])/;
  for (let cursor = 0; cursor < source.length; cursor++) {
    if (source.startsWith("%%", cursor)) {
      cursor++;
      continue;
    }
    if (source[cursor] === "%" && implicit.test(source.slice(cursor)))
      return true;
  }
  return false;
}
