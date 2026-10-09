import type {
  Bundle,
  Declaration,
  Expression,
  FunctionReference,
  Message,
  Pattern,
  Variant,
  VariableReference,
} from "@inlang/sdk";

const POUND_FUNCTION = "icu:pound";

/**
 * The plural or selectordinal that encloses a pattern, which `#` refers to.
 * A select passes the enclosing plural through to its cases.
 */
type PluralContext = {
  arg: string;
  offset: number;
};

export function serializeMessage(args: {
  bundle: Bundle;
  message: Message;
  variants: Variant[];
}): string {
  const { bundle, message, variants } = args;
  if (message.selectors.length === 0) {
    if (variants.length === 0) return "";
    return serializePattern(variants[0]!.pattern, { plural: undefined });
  }

  return serializeVariants(
    variants,
    message.selectors,
    bundle.declarations,
    undefined,
  );
}

function serializeVariants(
  variants: Variant[],
  selectors: VariableReference[],
  declarations: Declaration[],
  plural: PluralContext | undefined,
): string {
  if (variants.length === 0) return "";
  if (selectors.length === 0) {
    return serializePattern(variants[0]!.pattern, { plural });
  }

  const nextSelectorIndex = selectors.findIndex((candidate) =>
    variants.some((variant) =>
      variant.matches.some((match) => match.key === candidate.name),
    ),
  );
  if (nextSelectorIndex === -1) {
    return serializePattern(variants[0]!.pattern, { plural });
  }

  const selector = selectors[nextSelectorIndex]!;
  const pairedPluralSelector = selectors[nextSelectorIndex + 1];
  const pluralSelectorPair = pairedPluralSelector
    ? resolvePluralSelectorPair(selector, pairedPluralSelector, declarations)
    : undefined;
  if (pluralSelectorPair) {
    return serializePluralSelectorPair(
      variants,
      selectors.slice(nextSelectorIndex + 2),
      declarations,
      plural,
      pluralSelectorPair,
    );
  }

  const restSelectors = selectors.slice(nextSelectorIndex + 1);
  const selectorConfig = resolveSelectorConfig(selector, declarations);
  const isPluralContext = selectorConfig.type !== "select";

  const patterns = variants.map((variant) => variant.pattern);
  const minPatternLength = Math.min(
    ...patterns.map((pattern) => pattern.length),
  );

  const rawPrefix = commonPrefix(
    variants.map((variant) => variant.pattern),
    isPluralContext,
  );
  const prefixLength =
    rawPrefix.length >= minPatternLength ? 0 : rawPrefix.length;
  const patternsWithoutPrefix = patterns.map((pattern) =>
    pattern.slice(prefixLength),
  );
  const rawSuffix = commonSuffix(patternsWithoutPrefix, isPluralContext);
  const suffixLength =
    rawSuffix.length >= minPatternLength - prefixLength ? 0 : rawSuffix.length;
  const prefix = prefixLength === 0 ? [] : rawPrefix;
  const suffix = suffixLength === 0 ? [] : rawSuffix;
  const strippedVariants = variants.map((variant) => ({
    ...variant,
    pattern: stripPattern(variant.pattern, prefixLength, suffixLength),
  }));

  const groups = new Map<string, Variant[]>();
  for (const variant of strippedVariants) {
    const match = variant.matches.find(
      (entry: Variant["matches"][number]) => entry.key === selector.name,
    );
    const key = matchKey(match);
    const current = groups.get(key) ?? [];
    current.push(removeMatchForSelector(variant, selector.name));
    groups.set(key, current);
  }

  const cases = Array.from(groups.entries()).map(([key, groupVariants]) => {
    const caseKey = caseKeyFromMatch(key);
    const tokens = serializeVariants(
      groupVariants,
      restSelectors,
      declarations,
      isPluralContext
        ? { arg: selectorConfig.arg, offset: selectorConfig.offset ?? 0 }
        : plural,
    );
    return `${caseKey} {${tokens}}`;
  });

  let header = `${selectorConfig.arg}, ${selectorConfig.type},`;
  if (selectorConfig.offset && selectorConfig.offset !== 0) {
    header += ` offset:${selectorConfig.offset}`;
  }

  const select = `{${header} ${cases.join(" ")}}`;

  return [
    serializePattern(prefix, { plural }),
    select,
    serializePattern(suffix, { plural }),
  ].join("");
}

function matchKey(match: Variant["matches"][number] | undefined): string {
  if (!match || match.type === "catchall-match") return "*";
  return match.value;
}

function caseKeyFromMatch(match: string): string {
  if (match === "*" || match === "other") return "other";
  return match;
}

function removeMatchForSelector(
  variant: Variant,
  selectorName: string,
): Variant {
  return {
    ...variant,
    matches: variant.matches.filter(
      (entry: Variant["matches"][number]) => entry.key !== selectorName,
    ),
  };
}

function removeMatchesForSelectors(
  variant: Variant,
  selectorNames: string[],
): Variant {
  const selectorNameSet = new Set(selectorNames);
  return {
    ...variant,
    matches: variant.matches.filter(
      (entry: Variant["matches"][number]) => !selectorNameSet.has(entry.key),
    ),
  };
}

function resolveSelectorConfig(
  selector: VariableReference,
  declarations: Declaration[],
): {
  type: "select" | "plural" | "selectordinal";
  arg: string;
  offset?: number;
} {
  const local = declarations.find(
    (declaration) =>
      declaration.type === "local-variable" &&
      declaration.name === selector.name,
  ) as Declaration | undefined;

  if (
    local &&
    local.type === "local-variable" &&
    local.value.annotation?.type === "function-reference" &&
    local.value.annotation?.name === "plural"
  ) {
    const arg =
      local.value.arg.type === "variable-reference"
        ? local.value.arg.name
        : selector.name;
    const typeOption = optionValue(local.value.annotation, "type");
    const offsetOption = optionValue(local.value.annotation, "offset");
    return {
      type: typeOption === "ordinal" ? "selectordinal" : "plural",
      arg,
      offset: offsetOption ? Number(offsetOption) : undefined,
    };
  }

  return {
    type: "select",
    arg: selector.name,
  };
}

function resolvePluralSelectorPair(
  firstSelector: VariableReference,
  secondSelector: VariableReference,
  declarations: Declaration[],
):
  | {
      exactSelector: VariableReference;
      pluralSelector: VariableReference;
      config: {
        type: "plural" | "selectordinal";
        arg: string;
        offset?: number;
      };
    }
  | undefined {
  return (
    tryResolvePluralSelectorPair(
      firstSelector,
      secondSelector,
      declarations,
    ) ??
    tryResolvePluralSelectorPair(
      secondSelector,
      firstSelector,
      declarations,
    )
  );
}

function tryResolvePluralSelectorPair(
  exactSelector: VariableReference,
  pluralSelector: VariableReference,
  declarations: Declaration[],
):
  | {
      exactSelector: VariableReference;
      pluralSelector: VariableReference;
      config: {
        type: "plural" | "selectordinal";
        arg: string;
        offset?: number;
      };
    }
  | undefined {
  const exactDeclaration = declarations.find(
    (declaration) =>
      declaration.type === "local-variable" &&
      declaration.name === exactSelector.name,
  );
  const pluralConfig = resolveSelectorConfig(pluralSelector, declarations);

  if (
    pluralConfig.type !== "plural" &&
    pluralConfig.type !== "selectordinal"
  ) {
    return undefined;
  }

  if (
    !exactDeclaration ||
    exactDeclaration.type !== "local-variable" ||
    exactDeclaration.value.annotation !== undefined ||
    exactDeclaration.value.arg.type !== "variable-reference" ||
    exactDeclaration.value.arg.name !== pluralConfig.arg
  ) {
    return undefined;
  }

  return {
    exactSelector,
    pluralSelector,
    config: pluralConfig as {
      type: "plural" | "selectordinal";
      arg: string;
      offset?: number;
    },
  };
}

function serializePluralSelectorPair(
  variants: Variant[],
  selectors: VariableReference[],
  declarations: Declaration[],
  plural: PluralContext | undefined,
  pair: {
    exactSelector: VariableReference;
    pluralSelector: VariableReference;
    config: {
      type: "plural" | "selectordinal";
      arg: string;
      offset?: number;
    };
  },
): string {
  const patterns = variants.map((variant) => variant.pattern);
  const minPatternLength = Math.min(
    ...patterns.map((pattern) => pattern.length),
  );

  const rawPrefix = commonPrefix(
    variants.map((variant) => variant.pattern),
    true,
  );
  const prefixLength =
    rawPrefix.length >= minPatternLength ? 0 : rawPrefix.length;
  const patternsWithoutPrefix = patterns.map((pattern) =>
    pattern.slice(prefixLength),
  );
  const rawSuffix = commonSuffix(patternsWithoutPrefix, true);
  const suffixLength =
    rawSuffix.length >= minPatternLength - prefixLength ? 0 : rawSuffix.length;
  const prefix = prefixLength === 0 ? [] : rawPrefix;
  const suffix = suffixLength === 0 ? [] : rawSuffix;
  const strippedVariants = variants.map((variant) => ({
    ...variant,
    pattern: stripPattern(variant.pattern, prefixLength, suffixLength),
  }));

  const groups = new Map<string, Variant[]>();
  for (const variant of strippedVariants) {
    const exactMatch = variant.matches.find(
      (entry: Variant["matches"][number]) => entry.key === pair.exactSelector.name,
    );
    const pluralMatch = variant.matches.find(
      (entry: Variant["matches"][number]) => entry.key === pair.pluralSelector.name,
    );
    const key = pluralPairCaseKey(exactMatch, pluralMatch);
    const current = groups.get(key) ?? [];
    current.push(
      removeMatchesForSelectors(variant, [
        pair.exactSelector.name,
        pair.pluralSelector.name,
      ]),
    );
    groups.set(key, current);
  }

  const cases = Array.from(groups.entries())
    .sort(([left], [right]) => pluralCasePriority(left) - pluralCasePriority(right))
    .map(([key, groupVariants]) => {
      const tokens = serializeVariants(groupVariants, selectors, declarations, {
        arg: pair.config.arg,
        offset: pair.config.offset ?? 0,
      });
      return `${key} {${tokens}}`;
    });

  let header = `${pair.config.arg}, ${pair.config.type},`;
  if (pair.config.offset && pair.config.offset !== 0) {
    header += ` offset:${pair.config.offset}`;
  }

  const select = `{${header} ${cases.join(" ")}}`;

  return [
    serializePattern(prefix, { plural }),
    select,
    serializePattern(suffix, { plural }),
  ].join("");
}

function pluralPairCaseKey(
  exactMatch: Variant["matches"][number] | undefined,
  pluralMatch: Variant["matches"][number] | undefined,
): string {
  if (exactMatch?.type === "literal-match") {
    return `=${exactMatch.value}`;
  }
  if (pluralMatch?.type === "literal-match") {
    return pluralMatch.value;
  }
  return "other";
}

function pluralCasePriority(key: string): number {
  if (key.startsWith("=")) return 0;
  if (key === "other") return 2;
  return 1;
}

function optionValue(
  annotation: FunctionReference,
  name: string,
): string | undefined {
  const option = annotation.options.find(
    (entry: FunctionReference["options"][number]) => entry.name === name,
  );
  if (!option || option.value.type !== "literal") return undefined;
  return option.value.value;
}

function serializePattern(
  pattern: Pattern,
  options: { plural: PluralContext | undefined },
): string {
  return pattern
    .map((part: Pattern[number]) => {
      switch (part.type) {
        case "text":
          return escapeText(part.value, options);
        case "expression":
          return serializeExpression(part, options);
        case "markup-start":
        case "markup-end":
        case "markup-standalone":
          throw new Error(
            "Markup placeholders are not supported by ICU MessageFormat 1",
          );
      }
    })
    .join("");
}

function serializeExpression(
  expression: Expression,
  options: { plural: PluralContext | undefined },
): string {
  if (
    expression.annotation?.type === "function-reference" &&
    expression.annotation.name === POUND_FUNCTION
  ) {
    return serializePound(expression.arg, expression.annotation, options);
  }

  const arg =
    expression.arg.type === "variable-reference"
      ? expression.arg.name
      : expression.arg.value;

  if (!expression.annotation) {
    return `{${arg}}`;
  }

  const style = optionValue(expression.annotation, "style");
  if (style) {
    return `{${arg}, ${expression.annotation.name}, ${style}}`;
  }
  return `{${arg}, ${expression.annotation.name}}`;
}

/**
 * `#` displays `arg - offset` of the plural it sits in. Write `#` when it
 * sits in that plural. Elsewhere, for example after an editor removed or
 * changed the plural around it, write what it displays: `{count, number}`,
 * or a one-case plural that applies the offset.
 */
function serializePound(
  arg: Expression["arg"],
  annotation: FunctionReference,
  options: { plural: PluralContext | undefined },
): string {
  if (arg.type !== "variable-reference") return "#";
  const offsetOption = optionValue(annotation, "offset");
  const offset = offsetOption === undefined ? undefined : Number(offsetOption);
  if (
    options.plural &&
    options.plural.arg === arg.name &&
    // imports before the offset was kept on `#` have no offset option
    (offset === undefined || offset === options.plural.offset)
  ) {
    return "#";
  }
  if (!offset) return `{${arg.name}, number}`;
  return `{${arg.name}, plural, offset:${offset} other {#}}`;
}

function escapeText(
  value: string,
  options: { plural: PluralContext | undefined },
): string {
  let escaped = value.replace(/'/g, "''");
  escaped = escaped.replace(/\{/g, "'{'").replace(/\}/g, "'}'");
  if (options.plural) {
    escaped = escaped.replace(/#/g, "'#'");
  }
  return escaped;
}

export const _private = {
  serializePattern,
  resolveSelectorConfig,
};

function stripPattern(
  pattern: Pattern,
  prefixLength: number,
  suffixLength: number,
): Pattern {
  return pattern.slice(prefixLength, pattern.length - suffixLength);
}

function commonPrefix(patterns: Pattern[], avoidPound: boolean): Pattern {
  const prefix: Pattern = [];
  const minLength = Math.min(...patterns.map((pattern) => pattern.length));
  for (let i = 0; i < minLength; i += 1) {
    const base = patterns[0]?.[i];
    if (!base) break;
    if (avoidPound && isPoundExpression(base)) break;
    if (patterns.every((pattern) => patternElementsEqual(pattern[i], base))) {
      prefix.push(base);
    } else {
      break;
    }
  }
  return prefix;
}

function commonSuffix(patterns: Pattern[], avoidPound: boolean): Pattern {
  const suffix: Pattern = [];
  const minLength = Math.min(...patterns.map((pattern) => pattern.length));
  for (let i = 0; i < minLength; i += 1) {
    const base = patterns[0]?.[patterns[0]!.length - 1 - i];
    if (!base) break;
    if (avoidPound && isPoundExpression(base)) break;
    if (
      patterns.every((pattern) =>
        patternElementsEqual(pattern[pattern.length - 1 - i], base),
      )
    ) {
      suffix.unshift(base);
    } else {
      break;
    }
  }
  return suffix;
}

function patternElementsEqual(
  left: Pattern[number] | undefined,
  right: Pattern[number] | undefined,
): boolean {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type === "text" && right.type === "text") {
    return left.value === right.value;
  }
  if (left.type === "expression" && right.type === "expression") {
    if (left.arg.type !== right.arg.type) return false;
    if (left.arg.type === "variable-reference") {
      if (
        right.arg.type !== "variable-reference" ||
        left.arg.name !== right.arg.name
      ) {
        return false;
      }
    } else if (
      right.arg.type !== "literal" ||
      left.arg.value !== right.arg.value
    ) {
      return false;
    }

    if (!left.annotation && !right.annotation) return true;
    if (!left.annotation || !right.annotation) return false;
    if (left.annotation.name !== right.annotation.name) return false;
    return (
      JSON.stringify(left.annotation.options) ===
      JSON.stringify(right.annotation.options)
    );
  }
  return false;
}

function isPoundExpression(part: Pattern[number]): boolean {
  return (
    part.type === "expression" &&
    part.annotation?.type === "function-reference" &&
    part.annotation.name === POUND_FUNCTION
  );
}
