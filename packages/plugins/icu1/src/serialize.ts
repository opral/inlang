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
import { escapeIcuText } from "./escape.js";

const POUND_FUNCTION = "icu:pound";

/**
 * The plural or selectordinal that encloses a pattern, which `#` refers to.
 * A select passes the enclosing plural through to its cases.
 */
type PluralContext = {
  arg: string;
  offset: number;
  /**
   * The pattern sits in a select nested in the plural. ICU and
   * intl-messageformat read `#` there as a literal "#" and `'#'` as an
   * apostrophe, "#" and the start of a quote, while the import reads `#`
   * there as the number and `'#'` as "#". So `#` is only written directly in
   * its plural, and a literal "#" there throws `HashInSelect`.
   */
  inSelect: boolean;
  /** Write a literal "#" in a select nested in the plural as `'#'`. */
  quoteHashInSelect?: boolean;
};

/**
 * Thrown for a literal "#" in a select nested in a plural, which ICU and the
 * import read differently. See `serializePluralCases`.
 */
class HashInSelect extends Error {
  constructor() {
    super('A literal "#" in a select nested in a plural');
  }
}

export function serializeMessage(args: {
  bundle: Bundle;
  message: Message;
  variants: Variant[];
}): string {
  const { bundle, message, variants } = args;
  const pluralOffsets = collectPluralOffsets(bundle.declarations, message);
  if (message.selectors.length === 0) {
    if (variants.length === 0) return "";
    return serializePattern(variants[0]!.pattern, {
      plural: undefined,
      pluralOffsets,
    });
  }

  return serializeVariants(
    variants,
    message.selectors,
    bundle.declarations,
    undefined,
    pluralOffsets,
  );
}

/**
 * The offsets of the plurals on each argument, to resolve the offset of a
 * `#` imported before the offset was kept on `#`. Only the plurals the
 * message selects on count: the bundle's declarations are shared by all
 * locales, and another locale may use the same argument without an offset.
 * For an argument the message has no plural on, e.g. after an editor removed
 * the plural around a `#`, all plurals of the bundle on it count.
 */
type PluralOffsets = Map<string, Set<number>>;

function collectPluralOffsets(
  declarations: Declaration[],
  message: Message,
): PluralOffsets {
  const selected = new Set(message.selectors.map((selector) => selector.name));
  const all: PluralOffsets = new Map();
  const ofMessage: PluralOffsets = new Map();
  for (const declaration of declarations) {
    if (
      declaration.type !== "local-variable" ||
      declaration.value.arg.type !== "variable-reference" ||
      declaration.value.annotation?.type !== "function-reference" ||
      declaration.value.annotation.name !== "plural"
    ) {
      continue;
    }
    const arg = declaration.value.arg.name;
    const offset = parseOffset(
      optionValue(declaration.value.annotation, "offset"),
    );
    for (const offsets of selected.has(declaration.name)
      ? [all, ofMessage]
      : [all]) {
      if (!offsets.has(arg)) offsets.set(arg, new Set());
      offsets.get(arg)!.add(offset);
    }
  }
  for (const [arg, offsets] of all) {
    if (!ofMessage.has(arg)) ofMessage.set(arg, offsets);
  }
  return ofMessage;
}

function serializeVariants(
  variants: Variant[],
  selectors: VariableReference[],
  declarations: Declaration[],
  plural: PluralContext | undefined,
  pluralOffsets: PluralOffsets,
): string {
  if (variants.length === 0) return "";
  if (selectors.length === 0) {
    return serializePattern(variants[0]!.pattern, { plural, pluralOffsets });
  }

  const nextSelectorIndex = selectors.findIndex((candidate) =>
    variants.some((variant) =>
      variant.matches.some((match) => match.key === candidate.name),
    ),
  );
  if (nextSelectorIndex === -1) {
    return serializePattern(variants[0]!.pattern, { plural, pluralOffsets });
  }

  const selector = selectors[nextSelectorIndex]!;
  const pluralSelectorPair = resolvePluralSelectorPair(
    selectors,
    nextSelectorIndex,
    declarations,
  );
  if (pluralSelectorPair) {
    return serializePluralSelectorPair(
      variants,
      selectors.slice(nextSelectorIndex + 2),
      declarations,
      plural,
      pluralOffsets,
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

  const caseContext: PluralContext | undefined = isPluralContext
    ? {
        arg: selectorConfig.arg,
        offset: selectorConfig.offset ?? 0,
        inSelect: false,
      }
    : plural && { ...plural, inSelect: true };
  const below = pluralContextsOf([selector, ...restSelectors], declarations);
  // a `#` stays in the plural it is a `#` of
  const keepsPart = (part: Pattern[number]) =>
    writesPound(part, { plural: caseContext, pluralOffsets }) ||
    keepsPound(part, { below, outside: plural, pluralOffsets });
  const rawPrefix = commonPrefix(
    variants.map((variant) => variant.pattern),
    keepsPart,
  );
  // a shared `#` that is a `#` only around the selector, or a literal "#" in
  // a select in a plural (see `PluralContext.inSelect`), moves out even if
  // that leaves a case empty
  const hoistHash =
    !plural?.quoteHashInSelect &&
    patterns.some((pattern) =>
      pattern.some(
        (part) =>
          (isHashText(part) && !isPluralContext && plural !== undefined) ||
          (writesPound(part, { plural, pluralOffsets }) &&
            !writesPound(part, { plural: caseContext, pluralOffsets })),
      ),
    );
  const prefixLength =
    rawPrefix.length >= minPatternLength && !hoistHash ? 0 : rawPrefix.length;
  const patternsWithoutPrefix = patterns.map((pattern) =>
    pattern.slice(prefixLength),
  );
  const rawSuffix = commonSuffix(patternsWithoutPrefix, keepsPart);
  const suffixLength =
    rawSuffix.length >= minPatternLength - prefixLength && !hoistHash
      ? 0
      : rawSuffix.length;
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
  if (!isPluralContext) addOtherVariants(groups);

  const pluralCases = isPluralContext
    ? serializePluralCases({
        groups,
        selectors: restSelectors,
        declarations,
        config: selectorConfig as PluralConfig,
        pluralOffsets,
        caseKey: caseKeyFromMatch,
        level: {
          variants,
          selectors: [selector, ...restSelectors],
          plural,
        },
      })
    : serializeSelectCases({
        groups,
        selectors: restSelectors,
        declarations,
        plural,
        pluralOffsets,
      });
  if ("serialized" in pluralCases) return pluralCases.serialized;
  const { cases, siblings } = pluralCases;

  let header = `${selectorConfig.arg}, ${selectorConfig.type},`;
  if (selectorConfig.offset && selectorConfig.offset !== 0) {
    header += ` offset:${selectorConfig.offset}`;
  }

  const select = `{${header} ${cases.join(" ")}}`;

  if (siblings) {
    return serializeSiblings({
      siblings,
      select,
      prefix,
      suffix,
      selectors: restSelectors,
      declarations,
      plural,
      pluralOffsets,
    });
  }

  return [
    serializePattern(prefix, { plural, pluralOffsets }),
    select,
    serializePattern(suffix, { plural, pluralOffsets }),
  ].join("");
}

type PluralConfig = {
  type: "plural" | "selectordinal";
  arg: string;
  offset?: number;
};

type Siblings = { heads: Map<string, Variant[]>; tail: Variant[] };

/**
 * Serializes the cases of a plural, grouped by case key. Returns the cases
 * and, if the variants continue with a sibling of the plural (see
 * `splitSiblings`), the siblings.
 *
 * A literal "#" in a select nested in the plural reads differently in ICU
 * and in the import (see `PluralContext.inSelect`). If the select doesn't
 * depend on the plural, it moves out of the plural: after it, e.g. for
 * `{n, plural, one {# item} other {# items}} in {c, select, a {#a} other {#b}}`,
 * or around it, and the plural is serialized in each of its cases (returned
 * as `serialized`). Otherwise the "#" is quoted, which the import reads back.
 */
function serializePluralCases(args: {
  groups: Map<string, Variant[]>;
  selectors: VariableReference[];
  declarations: Declaration[];
  config: PluralConfig;
  pluralOffsets: PluralOffsets;
  caseKey: (key: string) => string;
  /** The variants and selectors of the plural, and the context around it. */
  level: {
    variants: Variant[];
    selectors: VariableReference[];
    plural: PluralContext | undefined;
  };
}):
  | { cases: string[]; siblings: Siblings | undefined }
  | { serialized: string } {
  const { groups, selectors, declarations, config } = args;
  const context: PluralContext = {
    arg: config.arg,
    offset: config.offset ?? 0,
    inSelect: false,
  };
  const serializeCases = (
    caseGroups: Map<string, Variant[]>,
    caseContext: PluralContext,
  ) =>
    Array.from(caseGroups.entries()).map(
      ([key, groupVariants]) =>
        `${args.caseKey(key)} {${serializeVariants(
          groupVariants,
          selectors,
          declarations,
          caseContext,
          args.pluralOffsets,
        )}}`,
    );

  const siblings = splitSiblings(groups, selectors, declarations, {
    config,
    headContext: context,
    plural: args.level.plural,
    pluralOffsets: args.pluralOffsets,
  });
  try {
    return {
      cases: serializeCases(siblings?.heads ?? groups, context),
      siblings,
    };
  } catch (error) {
    if (!(error instanceof HashInSelect)) throw error;
  }
  const independent = splitSiblings(groups, selectors, declarations, {
    headContext: context,
    plural: args.level.plural,
    pluralOffsets: args.pluralOffsets,
  });
  if (independent) {
    return {
      cases: serializeCases(independent.heads, context),
      siblings: independent,
    };
  }
  for (const select of selectors) {
    const moved = moveSelectOut(
      select,
      args.level.selectors.slice(0, args.level.selectors.indexOf(select)),
      args.level.variants,
      declarations,
    );
    if (!moved) continue;
    return {
      serialized: serializeVariants(
        moved,
        [
          select,
          ...args.level.selectors.filter((candidate) => candidate !== select),
        ],
        declarations,
        args.level.plural,
        args.pluralOffsets,
      ),
    };
  }
  return {
    cases: serializeCases(siblings?.heads ?? groups, {
      ...context,
      quoteHashInSelect: true,
    }),
    siblings,
  };
}

/**
 * Serializes the cases of a select. A literal "#" in them, if the select is
 * in a plural, throws `HashInSelect`, unless what follows the select doesn't
 * depend on it: then it is serialized after the select, outside of it (see
 * `splitSiblings`).
 */
function serializeSelectCases(args: {
  groups: Map<string, Variant[]>;
  selectors: VariableReference[];
  declarations: Declaration[];
  plural: PluralContext | undefined;
  pluralOffsets: PluralOffsets;
}): { cases: string[]; siblings: Siblings | undefined } {
  const { selectors, declarations, plural } = args;
  const serializeCases = (caseGroups: Map<string, Variant[]>) =>
    Array.from(caseGroups.entries()).map(
      ([key, groupVariants]) =>
        `${caseKeyFromMatch(key)} {${serializeVariants(
          groupVariants,
          selectors,
          declarations,
          plural && { ...plural, inSelect: true },
          args.pluralOffsets,
        )}}`,
    );
  try {
    return { cases: serializeCases(args.groups), siblings: undefined };
  } catch (error) {
    if (!(error instanceof HashInSelect)) throw error;
    const siblings = splitSiblings(args.groups, selectors, declarations, {
      headContext: plural && { ...plural, inSelect: true },
      plural,
      pluralOffsets: args.pluralOffsets,
    });
    if (!siblings) throw error;
    return { cases: serializeCases(siblings.heads), siblings };
  }
}

/**
 * The variants with the select as their outermost selector, if its cases
 * don't depend on the selectors before it (`before`): each combination of
 * their matches has variants for each key of the select or, for a key the
 * select has elsewhere only, for `other`, which that key selects there.
 * Those are added for the key. Undefined if the cases depend on the
 * selectors before it.
 */
function moveSelectOut(
  selector: VariableReference,
  before: VariableReference[],
  variants: Variant[],
  declarations: Declaration[],
): Variant[] | undefined {
  const local = declarations.find(
    (declaration) =>
      declaration.type === "local-variable" &&
      declaration.name === selector.name,
  );
  if (
    local?.type === "local-variable" ||
    resolveSelectorConfig(selector, declarations).type !== "select"
  ) {
    return undefined;
  }
  const beforeNames = new Set(before.map((entry) => entry.name));
  const keys = new Set<string>();
  const byBefore = new Map<string, Map<string, Variant[]>>();
  for (const variant of variants) {
    const match = variant.matches.find((entry) => entry.key === selector.name);
    if (!match) return undefined;
    const key = matchKey(match);
    if (key !== "*") keys.add(key);
    const combination = JSON.stringify(
      variant.matches.filter((entry) => beforeNames.has(entry.key)),
    );
    const cases = byBefore.get(combination) ?? new Map<string, Variant[]>();
    cases.set(key, [...(cases.get(key) ?? []), variant]);
    byBefore.set(combination, cases);
  }
  const result: Variant[] = [];
  for (const cases of byBefore.values()) {
    const others = cases.get("*");
    for (const key of keys) {
      const keyVariants = cases.get(key);
      if (keyVariants) {
        result.push(...keyVariants);
      } else if (others) {
        result.push(
          ...others.map((other) => ({
            ...other,
            matches: other.matches.map((entry) =>
              entry.key === selector.name
                ? {
                    type: "literal-match" as const,
                    key: selector.name,
                    value: key,
                  }
                : entry,
            ),
          })),
        );
      } else {
        return undefined;
      }
    }
    if (others) result.push(...others);
  }
  return result;
}

/**
 * Separate plurals on the same argument, e.g.
 * `{n, plural, one {# file} other {# files}} {n, plural, one {was} other {were}}`,
 * import as separate selectors, whose variants are the product of their
 * cases. Splits such variants back into the cases of the first plural and,
 * following it, the variants of the second, instead of nesting the second
 * plural in each case of the first.
 *
 * With a `config`, only splits off a plural with the same argument, type and
 * offset. Without one, splits off any selector. What all cases end with
 * moves to the rest, up to a `#` that is neither a `#` of the rest's plural
 * nor of `plural`, the context around both.
 *
 * Returns the case groups with only the first plural's part of the pattern
 * and the variants of the rest, or undefined if the variants are not such a
 * product.
 */
function splitSiblings(
  groups: Map<string, Variant[]>,
  restSelectors: VariableReference[],
  declarations: Declaration[],
  options: {
    config?: PluralConfig;
    /** The context of the cases. */
    headContext: PluralContext | undefined;
    /** The context around the cases and the rest. */
    plural: PluralContext | undefined;
    pluralOffsets: PluralOffsets;
  },
): Siblings | undefined {
  let tail: Variant[] | undefined;
  const heads = new Map<string, Variant[]>();
  for (const [key, groupVariants] of groups) {
    const head = commonPrefix(
      groupVariants.map((variant) => variant.pattern),
      () => false,
    );
    const rest = groupVariants.map((variant) => ({
      ...variant,
      pattern: variant.pattern.slice(head.length),
    }));
    if (tail === undefined) {
      tail = rest;
    } else if (!sameVariants(tail, rest)) {
      return undefined;
    }
    heads.set(key, [{ ...groupVariants[0]!, matches: [], pattern: head }]);
  }
  if (!tail) return undefined;

  const nextIndex = restSelectors.findIndex((candidate) =>
    tail!.some((variant) =>
      variant.matches.some((match) => match.key === candidate.name),
    ),
  );
  if (nextIndex === -1) return undefined;
  const { config } = options;
  const nextConfig =
    resolvePluralSelectorPair(restSelectors, nextIndex, declarations)?.config ??
    resolveSelectorConfig(restSelectors[nextIndex]!, declarations);
  if (
    config &&
    (nextConfig.type !== config.type ||
      nextConfig.arg !== config.arg ||
      (nextConfig.offset ?? 0) !== (config.offset ?? 0))
  ) {
    return undefined;
  }

  // what all cases end with goes to the rest
  const restContext: PluralContext | undefined =
    nextConfig.type === "select"
      ? undefined
      : {
          arg: nextConfig.arg,
          offset: nextConfig.offset ?? 0,
          inSelect: false,
        };
  const between = commonSuffix(
    [...heads.values()].map((head) => head[0]!.pattern),
    (part) =>
      writesPound(part, {
        plural: options.headContext,
        pluralOffsets: options.pluralOffsets,
      }) &&
      !writesPound(part, {
        plural: options.plural,
        pluralOffsets: options.pluralOffsets,
      }) &&
      !writesPound(part, {
        plural: restContext,
        pluralOffsets: options.pluralOffsets,
      }),
  );
  for (const head of heads.values()) {
    head[0]!.pattern = head[0]!.pattern.slice(
      0,
      head[0]!.pattern.length - between.length,
    );
  }
  return {
    heads,
    tail: tail.map((variant) => ({
      ...variant,
      pattern: [...between, ...variant.pattern],
    })),
  };
}

/**
 * Serializes sibling plurals, see `splitSiblings`: the first plural and
 * the variants of the rest. Leaves out the first plural if it displays
 * nothing.
 */
function serializeSiblings(args: {
  siblings: Siblings;
  select: string;
  prefix: Pattern;
  suffix: Pattern;
  selectors: VariableReference[];
  declarations: Declaration[];
  plural: PluralContext | undefined;
  pluralOffsets: PluralOffsets;
}): string {
  const { siblings, prefix, suffix, plural, pluralOffsets } = args;
  const isEmpty = [...siblings.heads.values()].every(
    (head) => head[0]!.pattern.length === 0,
  );
  if (isEmpty) {
    return serializeVariants(
      siblings.tail.map((variant) => ({
        ...variant,
        pattern: [...prefix, ...variant.pattern, ...suffix],
      })),
      args.selectors,
      args.declarations,
      plural,
      pluralOffsets,
    );
  }
  return [
    serializePattern(prefix, { plural, pluralOffsets }),
    args.select,
    serializeVariants(
      siblings.tail.map((variant) => ({
        ...variant,
        pattern: [...variant.pattern, ...suffix],
      })),
      args.selectors,
      args.declarations,
      plural,
      pluralOffsets,
    ),
  ].join("");
}

function sameVariants(left: Variant[], right: Variant[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (variant, index) =>
        JSON.stringify(variant.matches) ===
          JSON.stringify(right[index]!.matches) &&
        variant.pattern.length === right[index]!.pattern.length &&
        variant.pattern.every((part, partIndex) =>
          patternElementsEqual(part, right[index]!.pattern[partIndex]),
        ),
    )
  );
}

/**
 * Adds to each case of a select the variants of `other` it lacks. A select
 * nested in or following another select on the same argument can give a key
 * variants in some branches only, e.g. `b` in
 * `{h, select, other {}}{g, select, a {{h, select, b {B} other {}}} other {}}`
 * has a variant for `g = a` only: for another `g`, `h = b` selects the
 * variant of `other`. A variant of `other` is not added if a variant of the
 * case matches whenever it does, which variants select first.
 */
function addOtherVariants(groups: Map<string, Variant[]>) {
  const others = groups.get("*");
  if (!others) return;
  for (const [key, group] of groups) {
    if (key === "*") continue;
    for (const other of others) {
      if (!group.some((variant) => coversMatches(variant, other))) {
        group.push(other);
      }
    }
  }
}

/** Whether `variant` matches whenever `other` matches. */
function coversMatches(variant: Variant, other: Variant): boolean {
  return variant.matches.every((match) => {
    if (match.type === "catchall-match") return true;
    const otherMatch = other.matches.find((entry) => entry.key === match.key);
    return (
      otherMatch?.type === "literal-match" && otherMatch.value === match.value
    );
  });
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

/**
 * The exact selector and plural selector at `index` of the selectors, which
 * the import puts in this order. Accepts the reverse order unless the exact
 * selector belongs to the plural selector after it, e.g. in
 * `[nPluralOffset1, nPluralExact, nPlural]`.
 */
function resolvePluralSelectorPair(
  selectors: VariableReference[],
  index: number,
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
  const firstSelector = selectors[index];
  const secondSelector = selectors[index + 1];
  if (!firstSelector || !secondSelector) return undefined;
  const exactFirst = tryResolvePluralSelectorPair(
    firstSelector,
    secondSelector,
    declarations,
  );
  if (exactFirst) return exactFirst;
  const thirdSelector = selectors[index + 2];
  if (
    thirdSelector &&
    tryResolvePluralSelectorPair(secondSelector, thirdSelector, declarations)
  ) {
    return undefined;
  }
  return tryResolvePluralSelectorPair(
    secondSelector,
    firstSelector,
    declarations,
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

  if (pluralConfig.type !== "plural" && pluralConfig.type !== "selectordinal") {
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
  pluralOffsets: PluralOffsets,
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

  const caseContext: PluralContext = {
    arg: pair.config.arg,
    offset: pair.config.offset ?? 0,
    inSelect: false,
  };
  const below = [caseContext, ...pluralContextsOf(selectors, declarations)];
  // a `#` stays in the plural it is a `#` of
  const keepsPart = (part: Pattern[number]) =>
    writesPound(part, { plural: caseContext, pluralOffsets }) ||
    keepsPound(part, { below, outside: plural, pluralOffsets });
  const rawPrefix = commonPrefix(
    variants.map((variant) => variant.pattern),
    keepsPart,
  );
  // a shared `#` that is a `#` only around the plural moves out even if that
  // leaves a case empty
  const hoistHash = patterns.some((pattern) =>
    pattern.some(
      (part) =>
        writesPound(part, { plural, pluralOffsets }) &&
        !writesPound(part, { plural: caseContext, pluralOffsets }),
    ),
  );
  const prefixLength =
    rawPrefix.length >= minPatternLength && !hoistHash ? 0 : rawPrefix.length;
  const patternsWithoutPrefix = patterns.map((pattern) =>
    pattern.slice(prefixLength),
  );
  const rawSuffix = commonSuffix(patternsWithoutPrefix, keepsPart);
  const suffixLength =
    rawSuffix.length >= minPatternLength - prefixLength && !hoistHash
      ? 0
      : rawSuffix.length;
  const prefix = prefixLength === 0 ? [] : rawPrefix;
  const suffix = suffixLength === 0 ? [] : rawSuffix;
  const strippedVariants = variants.map((variant) => ({
    ...variant,
    pattern: stripPattern(variant.pattern, prefixLength, suffixLength),
  }));

  const groups = new Map<string, Variant[]>();
  for (const variant of strippedVariants) {
    const exactMatch = variant.matches.find(
      (entry: Variant["matches"][number]) =>
        entry.key === pair.exactSelector.name,
    );
    const pluralMatch = variant.matches.find(
      (entry: Variant["matches"][number]) =>
        entry.key === pair.pluralSelector.name,
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

  const pluralCases = serializePluralCases({
    groups: new Map(
      Array.from(groups.entries()).sort(
        ([left], [right]) =>
          pluralCasePriority(left) - pluralCasePriority(right),
      ),
    ),
    selectors,
    declarations,
    config: pair.config,
    pluralOffsets,
    caseKey: (key) => key,
    level: {
      variants,
      selectors: [pair.exactSelector, pair.pluralSelector, ...selectors],
      plural,
    },
  });
  if ("serialized" in pluralCases) return pluralCases.serialized;
  const { cases, siblings } = pluralCases;

  let header = `${pair.config.arg}, ${pair.config.type},`;
  if (pair.config.offset && pair.config.offset !== 0) {
    header += ` offset:${pair.config.offset}`;
  }

  const select = `{${header} ${cases.join(" ")}}`;

  if (siblings) {
    return serializeSiblings({
      siblings,
      select,
      prefix,
      suffix,
      selectors,
      declarations,
      plural,
      pluralOffsets,
    });
  }

  return [
    serializePattern(prefix, { plural, pluralOffsets }),
    select,
    serializePattern(suffix, { plural, pluralOffsets }),
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

type PatternOptions = {
  /** The plural or selectordinal the pattern sits in. */
  plural: PluralContext | undefined;
  /** To resolve the offset of a legacy `#`. */
  pluralOffsets: PluralOffsets;
};

function serializePattern(pattern: Pattern, options: PatternOptions): string {
  return mergeTexts(pattern)
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
  options: PatternOptions,
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
 * sits in a plural on the same argument with the same offset. Elsewhere, for
 * example after an editor removed or changed the plural around it, write what
 * it displays: `{count, number}`, or a one-case plural that applies the
 * offset.
 */
function serializePound(
  arg: Expression["arg"],
  annotation: FunctionReference,
  options: PatternOptions,
): string {
  if (arg.type !== "variable-reference") return "#";
  const offset = poundOffset(arg.name, annotation, options);
  if (
    options.plural &&
    options.plural.arg === arg.name &&
    offset === options.plural.offset
  ) {
    // ICU reads `#` in a select nested in the plural as a literal "#"
    if (!options.plural.inSelect) return "#";
  }
  if (offset === 0) return `{${arg.name}, number}`;
  return `{${arg.name}, plural, offset:${offset} other {#}}`;
}

/**
 * The offset a `#` subtracts from its argument.
 *
 * `#` imports with an `offset` option when its plural has an offset, and
 * without one when it has none. Imports from before the offset was kept on
 * `#` have no option even in a plural with an offset. A `#` without an option
 * is therefore only such a legacy `#` when no plural on its argument (see
 * `collectPluralOffsets`) lacks an offset: then it takes the offset of the
 * enclosing plural on its argument, or, outside of one, the offset of the
 * plural on its argument. Otherwise it has offset 0.
 */
function poundOffset(
  argName: string,
  annotation: FunctionReference,
  options: PatternOptions,
): number {
  const offsetOption = optionValue(annotation, "offset");
  if (offsetOption !== undefined) return parseOffset(offsetOption);

  const pluralOffsets = options.pluralOffsets.get(argName) ?? new Set();
  if (pluralOffsets.size === 0 || pluralOffsets.has(0)) return 0;

  // legacy `#`
  if (options.plural?.arg === argName) return options.plural.offset;
  // outside of its plural, the offset is only known if all plurals on the
  // argument share it
  if (pluralOffsets.size === 1) return [...pluralOffsets][0]!;
  return 0;
}

function parseOffset(value: string | undefined): number {
  if (value === undefined) return 0;
  const offset = Number(value);
  return Number.isFinite(offset) ? offset : 0;
}

/**
 * Joins adjacent text parts, to escape them together: escaped one by one,
 * the texts `#'` and `#` give `'#'''` and `'#'`, which read as one quoted
 * segment.
 */
function mergeTexts(pattern: Pattern): Pattern {
  const merged: Pattern = [];
  for (const part of pattern) {
    const last = merged.at(-1);
    if (part.type === "text" && last?.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: last.value + part.value,
      };
    } else {
      merged.push(part);
    }
  }
  return merged;
}

function escapeText(value: string, options: PatternOptions): string {
  if (
    options.plural?.inSelect &&
    !options.plural.quoteHashInSelect &&
    value.includes("#")
  ) {
    throw new HashInSelect();
  }
  return escapeIcuText(value, options.plural !== undefined);
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

function commonPrefix(
  patterns: Pattern[],
  stopAt: (part: Pattern[number]) => boolean,
): Pattern {
  const prefix: Pattern = [];
  const minLength = Math.min(...patterns.map((pattern) => pattern.length));
  for (let i = 0; i < minLength; i += 1) {
    const base = patterns[0]?.[i];
    if (!base) break;
    if (stopAt(base)) break;
    if (patterns.every((pattern) => patternElementsEqual(pattern[i], base))) {
      prefix.push(base);
    } else {
      break;
    }
  }
  return prefix;
}

function commonSuffix(
  patterns: Pattern[],
  stopAt: (part: Pattern[number]) => boolean,
): Pattern {
  const suffix: Pattern = [];
  const minLength = Math.min(...patterns.map((pattern) => pattern.length));
  for (let i = 0; i < minLength; i += 1) {
    const base = patterns[0]?.[patterns[0]!.length - 1 - i];
    if (!base) break;
    if (stopAt(base)) break;
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

/**
 * Whether the part is a `#` that stays where it is, instead of moving out
 * into the context `outside`: it is not written as `#` there, but can be in
 * one of the plurals `below`, which the pattern is serialized in.
 */
function keepsPound(
  part: Pattern[number],
  options: {
    below: PluralContext[];
    outside: PluralContext | undefined;
    pluralOffsets: PluralOffsets;
  },
): boolean {
  const { pluralOffsets } = options;
  return (
    !writesPound(part, { plural: options.outside, pluralOffsets }) &&
    options.below.some((plural) => writesPound(part, { plural, pluralOffsets }))
  );
}

/** The contexts of the plurals among the selectors. */
function pluralContextsOf(
  selectors: VariableReference[],
  declarations: Declaration[],
): PluralContext[] {
  return selectors.flatMap((selector) => {
    const config = resolveSelectorConfig(selector, declarations);
    return config.type === "select"
      ? []
      : [{ arg: config.arg, offset: config.offset ?? 0, inSelect: false }];
  });
}

/** Whether the part is a `#` written as `#` in the context. */
function writesPound(part: Pattern[number], options: PatternOptions): boolean {
  if (
    !isPoundExpression(part) ||
    part.type !== "expression" ||
    part.arg.type !== "variable-reference"
  ) {
    return false;
  }
  const context = options.plural;
  return (
    context !== undefined &&
    !context.inSelect &&
    context.arg === part.arg.name &&
    context.offset ===
      poundOffset(part.arg.name, part.annotation as FunctionReference, options)
  );
}

function isHashText(part: Pattern[number]): boolean {
  return part.type === "text" && part.value.includes("#");
}

function isPoundExpression(part: Pattern[number]): boolean {
  return (
    part.type === "expression" &&
    part.annotation?.type === "function-reference" &&
    part.annotation.name === POUND_FUNCTION
  );
}
