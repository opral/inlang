import { parse } from "@messageformat/parser";
import type {
  Content,
  FunctionArg,
  Octothorpe,
  PlainArg,
  Select,
} from "@messageformat/parser";
import type {
  Declaration,
  Expression,
  FunctionReference,
  LocalVariable,
  Match,
  Pattern,
  VariableReference,
  VariantImport,
} from "@inlang/sdk";
import { escapeIcuText } from "./escape.js";

export type ParsedMessage = {
  declarations: Declaration[];
  selectors: VariableReference[];
  variants: VariantImport[];
};

type Branch = {
  pattern: Pattern;
  matches: Match[];
  /**
   * For each select argument the branch has a catch-all match on: the keys
   * of the selects that sent the branch to `other`. A later select on the
   * same argument can't reach those keys in this branch.
   */
  selectOtherKeys: Map<string, Set<string>>;
  /** The selectors of the selects and plurals the branch is nested in. */
  enclosing: string[];
};

type Token = Content | PlainArg | FunctionArg | Select | Octothorpe;
type TokenList = Token[];

type PluralSelector = {
  selectorName: string;
  exactSelectorName?: string;
  arg: string;
  type: "plural" | "selectordinal";
  offset?: number;
};

/**
 * The plural or selectordinal a `#` refers to: the innermost enclosing one.
 */
type PluralContext = {
  arg: string;
  offset?: number;
};

type ParseContext = {
  inputVariables: Map<string, Declaration>;
  localVariables: Map<string, LocalVariable>;
  selectors: string[];
  /**
   * The selectors of the plurals with the same argument, type and offset.
   * Usually one, shared by plurals in different branches. A plural nested in
   * or following another one gets the next one: sharing a selector would
   * merge their cases.
   */
  pluralSelectors: Map<string, PluralSelector[]>;
  exactPluralSelectorKeys: Set<string>;
  /** Which of the selectors with its key each plural uses. */
  pluralIndexes: Map<Token, number>;
  /**
   * For each selector, the selectors nested in it. A nested selector must
   * follow the selectors it is nested in: variants match by the selectors in
   * order, so a nested selector ahead of its enclosing one, which a select
   * or plural nested elsewhere can register first, decides first.
   */
  nested: Map<string, Set<string>>;
};

const NULL_BRANCH: Branch = {
  pattern: [],
  matches: [],
  selectOtherKeys: new Map(),
  enclosing: [],
};

export function parseMessage(args: {
  messageSource: string;
  bundleId: string;
  locale: string;
}): ParsedMessage {
  const tokens = parse(args.messageSource, {
    strict: false,
  }) as TokenList;

  const context: ParseContext = {
    inputVariables: new Map(),
    localVariables: new Map(),
    selectors: [],
    pluralSelectors: new Map(),
    exactPluralSelectorKeys: collectExactPluralSelectorKeys(tokens),
    pluralIndexes: assignPluralIndexes(tokens),
    nested: new Map(),
  };

  const branches = expandTokens(tokens, NULL_BRANCH, context, undefined);

  const declarations = [
    ...context.inputVariables.values(),
    ...context.localVariables.values(),
  ];

  const selectors: VariableReference[] = orderSelectors(context).map(
    (name) => ({
      type: "variable-reference",
      name,
    }),
  );

  const variants: VariantImport[] = branches.map((branch) => ({
    messageBundleId: args.bundleId,
    messageLocale: args.locale,
    matches: branch.matches,
    pattern: branch.pattern,
  }));

  return { declarations, selectors, variants };
}

function expandTokens(
  tokens: TokenList,
  branch: Branch,
  context: ParseContext,
  pluralContext: PluralContext | undefined,
): Branch[] {
  let branches: Branch[] = [cloneBranch(branch)];

  for (const token of tokens) {
    switch (token.type) {
      case "content": {
        for (const current of branches) {
          current.pattern.push({ type: "text", value: token.value });
        }
        break;
      }
      case "argument": {
        ensureInputVariable(context, token.arg);
        for (const current of branches) {
          current.pattern.push({
            type: "expression",
            arg: { type: "variable-reference", name: token.arg },
          });
        }
        break;
      }
      case "function": {
        ensureInputVariable(context, token.arg);
        const annotation = functionAnnotation(token.key, token.param);
        for (const current of branches) {
          current.pattern.push({
            type: "expression",
            arg: { type: "variable-reference", name: token.arg },
            annotation,
          });
        }
        break;
      }
      case "octothorpe": {
        if (!pluralContext) {
          for (const current of branches) {
            current.pattern.push({ type: "text", value: "#" });
          }
          break;
        }

        ensureInputVariable(context, pluralContext.arg);
        for (const current of branches) {
          current.pattern.push(poundExpression(pluralContext));
        }
        break;
      }
      case "select": {
        ensureInputVariable(context, token.arg);
        ensureSelectorOrder(context, token.arg);
        const nextBranches: Branch[] = [];
        for (const current of branches) {
          if (selectsAgain(token, current)) {
            addNested(context, current.enclosing, token.arg);
          }
          for (const { selectCase, branch } of selectCaseBranches(
            token,
            current,
          )) {
            branch.enclosing = [...current.enclosing, token.arg];
            for (const expanded of expandTokens(
              selectCase.tokens,
              branch,
              context,
              pluralContext,
            )) {
              expanded.enclosing = current.enclosing;
              nextBranches.push(expanded);
            }
          }
        }
        branches = nextBranches;
        break;
      }
      case "plural":
      case "selectordinal": {
        ensureInputVariable(context, token.arg);
        if (isOffsetPound(token)) {
          for (const current of branches) {
            current.pattern.push(
              poundExpression({ arg: token.arg, offset: token.pluralOffset }),
            );
          }
          break;
        }
        const type = token.type as "plural" | "selectordinal";
        const pluralSelectorKey = createPluralSelectorKey({
          arg: token.arg,
          type,
          offset: token.pluralOffset,
        });
        const withExactSelector =
          context.exactPluralSelectorKeys.has(pluralSelectorKey);
        const pluralSelector = ensurePluralSelector(context, {
          arg: token.arg,
          type,
          offset: token.pluralOffset,
          withExactSelector,
          index: context.pluralIndexes.get(token) ?? 0,
        });
        ensureSelectorOrder(
          context,
          pluralSelector.selectorName,
          pluralSelector.exactSelectorName,
        );
        for (const current of branches) {
          addNested(context, current.enclosing, pluralSelector.selectorName);
        }

        const nextBranches: Branch[] = [];
        for (const selectCase of sortSelectCases(token.cases, token.type)) {
          for (const current of branches) {
            const matches = matchesForCase(pluralSelector, selectCase.key);
            const newBranch = cloneBranch({
              ...current,
              matches: [...current.matches, ...matches],
              enclosing: [...current.enclosing, pluralSelector.selectorName],
            });
            for (const expanded of expandTokens(
              selectCase.tokens,
              newBranch,
              context,
              { arg: token.arg, offset: token.pluralOffset },
            )) {
              expanded.enclosing = current.enclosing;
              nextBranches.push(expanded);
            }
          }
        }
        branches = nextBranches;
        break;
      }
      default: {
        const exhaustive: never = token;
        throw new Error(`Unsupported token type ${(exhaustive as any)?.type}`);
      }
    }
  }

  return branches;
}

/**
 * `#` displays `arg - offset`. Keep the offset on the expression, so
 * consumers can format `#` without finding the enclosing plural.
 */
function poundExpression(pluralContext: PluralContext): Pattern[number] {
  return {
    type: "expression",
    arg: { type: "variable-reference", name: pluralContext.arg },
    annotation: {
      type: "function-reference",
      name: "icu:pound",
      options:
        pluralContext.offset && pluralContext.offset !== 0
          ? [
              {
                name: "offset",
                value: { type: "literal", value: String(pluralContext.offset) },
              },
            ]
          : [],
    },
  };
}

/**
 * Whether the token is `{arg, plural, offset:N other {#}}`, which the export
 * writes for a `#` with an offset outside of its plural. It imports as that
 * `#`, without a selector, so that a second export writes it the same.
 */
function isOffsetPound(token: Token): boolean {
  return (
    token.type === "plural" &&
    token.pluralOffset !== undefined &&
    token.pluralOffset !== 0 &&
    token.cases.length === 1 &&
    token.cases[0]!.key === "other" &&
    token.cases[0]!.tokens.length === 1 &&
    token.cases[0]!.tokens[0]!.type === "octothorpe"
  );
}

/**
 * The cases of a select a branch reaches, each with the branch that takes it.
 *
 * A select on an argument the branch already selects on, e.g. a select nested
 * in or following another select on the same argument, doesn't select again:
 * the branch takes the case of the value it matched, and a branch on `other`
 * only splits off the keys the earlier selects don't have.
 */
function selectCaseBranches(
  token: Select,
  current: Branch,
): { selectCase: Select["cases"][number]; branch: Branch }[] {
  const literalKeys = token.cases
    .map((selectCase) => selectCase.key)
    .filter((key) => key !== "other");
  const otherCase = token.cases.find(
    (selectCase) => selectCase.key === "other",
  );
  const matchIndex = current.matches.findIndex(
    (match) => match.key === token.arg,
  );
  const existing = current.matches[matchIndex];

  if (!existing) {
    return token.cases.map((selectCase) => {
      const branch = cloneBranch(current);
      if (selectCase.key === "other") {
        branch.matches.push({ type: "catchall-match", key: token.arg });
        branch.selectOtherKeys.set(token.arg, new Set(literalKeys));
      } else {
        branch.matches.push({
          type: "literal-match",
          key: token.arg,
          value: selectCase.key,
        });
      }
      return { selectCase, branch };
    });
  }

  if (existing.type === "literal-match") {
    const selectCase = token.cases.find(
      (entry) => entry.key === existing.value,
    ) ??
      otherCase ?? { ...token.cases[0]!, key: "other", tokens: [] };
    return [{ selectCase, branch: cloneBranch(current) }];
  }

  const otherKeys = current.selectOtherKeys.get(token.arg) ?? new Set();
  const result: { selectCase: Select["cases"][number]; branch: Branch }[] = [];
  for (const selectCase of token.cases) {
    if (selectCase.key === "other") {
      const branch = cloneBranch(current);
      branch.selectOtherKeys.set(
        token.arg,
        new Set([...otherKeys, ...literalKeys]),
      );
      result.push({ selectCase, branch });
    } else if (!otherKeys.has(selectCase.key)) {
      const branch = cloneBranch(current);
      branch.matches[matchIndex] = {
        type: "literal-match",
        key: token.arg,
        value: selectCase.key,
      };
      branch.selectOtherKeys.delete(token.arg);
      result.push({ selectCase, branch });
    }
  }
  return result;
}

/**
 * Whether the select gives the branch a new match on its argument: the
 * branch has none yet, or matches `other` of an earlier select that lacks
 * keys of this one.
 */
function selectsAgain(token: Select, current: Branch): boolean {
  const existing = current.matches.find((match) => match.key === token.arg);
  if (!existing) return true;
  if (existing.type === "literal-match") return false;
  const otherKeys = current.selectOtherKeys.get(token.arg) ?? new Set();
  return token.cases.some(
    (selectCase) =>
      selectCase.key !== "other" && !otherKeys.has(selectCase.key),
  );
}

function addNested(
  context: ParseContext,
  enclosing: string[],
  selectorName: string,
) {
  for (const outer of enclosing) {
    if (outer === selectorName) continue;
    const nested = context.nested.get(outer) ?? new Set();
    nested.add(selectorName);
    context.nested.set(outer, nested);
  }
}

/**
 * The selectors in the order they first occur, except that a selector
 * follows the selectors it is nested in (see `ParseContext.nested`). An exact
 * selector stays right before its plural selector.
 */
function orderSelectors(context: ParseContext): string[] {
  const exactOf = new Map<string, string>();
  const pluralOf = new Map<string, string>();
  for (const shared of context.pluralSelectors.values()) {
    for (const selector of shared) {
      if (selector?.exactSelectorName) {
        exactOf.set(selector.selectorName, selector.exactSelectorName);
        pluralOf.set(selector.exactSelectorName, selector.selectorName);
      }
    }
  }
  const remaining = [
    ...new Set(context.selectors.map((name) => pluralOf.get(name) ?? name)),
  ];
  const isNestedInRemaining = (name: string) =>
    remaining.some(
      (outer) => outer !== name && context.nested.get(outer)?.has(name),
    );
  const ordered: string[] = [];
  while (remaining.length > 0) {
    // the first selector not nested in another remaining one; the first one
    // if they are nested in each other in different branches
    const index = Math.max(
      0,
      remaining.findIndex((name) => !isNestedInRemaining(name)),
    );
    const [name] = remaining.splice(index, 1);
    const exact = exactOf.get(name!);
    if (exact) ordered.push(exact);
    ordered.push(name!);
  }
  return ordered;
}

function ensureInputVariable(context: ParseContext, name: string) {
  if (!context.inputVariables.has(name)) {
    context.inputVariables.set(name, {
      type: "input-variable",
      name,
    });
  }
}

function ensurePluralSelector(
  context: ParseContext,
  args: {
    arg: string;
    type: "plural" | "selectordinal";
    offset?: number;
    withExactSelector: boolean;
    /** Which of the selectors with this key. */
    index: number;
  },
): PluralSelector {
  const key = createPluralSelectorKey(args);
  const shared = context.pluralSelectors.get(key) ?? [];
  const existing = shared[args.index];
  if (existing) {
    if (args.withExactSelector && !existing.exactSelectorName) {
      existing.exactSelectorName = createExactSelector(context, {
        arg: args.arg,
        selectorName: existing.selectorName,
      });
    }
    return existing;
  }

  const baseName =
    args.type === "selectordinal"
      ? `${args.arg}Ordinal`
      : `${args.arg}Plural${args.offset && args.offset !== 0 ? `Offset${args.offset}` : ""}`;
  let selectorName = baseName;
  let suffix = 1;
  while (
    context.localVariables.has(selectorName) ||
    context.inputVariables.has(selectorName)
  ) {
    selectorName = `${baseName}${suffix}`;
    suffix += 1;
  }

  const options = [] as FunctionReference["options"];
  if (args.type === "selectordinal") {
    options.push({
      name: "type",
      value: { type: "literal", value: "ordinal" },
    });
  }
  if (args.offset && args.offset !== 0) {
    options.push({
      name: "offset",
      value: { type: "literal", value: String(args.offset) },
    });
  }

  const localVariable: LocalVariable = {
    type: "local-variable",
    name: selectorName,
    value: {
      type: "expression",
      arg: { type: "variable-reference", name: args.arg },
      annotation: {
        type: "function-reference",
        name: "plural",
        options,
      },
    },
  };

  context.localVariables.set(selectorName, localVariable);
  const pluralSelector = {
    selectorName,
    arg: args.arg,
    type: args.type,
    offset: args.offset,
    exactSelectorName: args.withExactSelector
      ? createExactSelector(context, {
          arg: args.arg,
          selectorName,
        })
      : undefined,
  } satisfies PluralSelector;
  shared[args.index] = pluralSelector;
  context.pluralSelectors.set(key, shared);

  return pluralSelector;
}

function ensureSelectorOrder(
  context: ParseContext,
  selectorName: string,
  exactSelectorName?: string,
) {
  if (!exactSelectorName) {
    if (!context.selectors.includes(selectorName)) {
      context.selectors.push(selectorName);
    }
    return;
  }

  const exactIndex = context.selectors.indexOf(exactSelectorName);
  const selectorIndex = context.selectors.indexOf(selectorName);

  if (exactIndex === -1 && selectorIndex === -1) {
    context.selectors.push(exactSelectorName, selectorName);
    return;
  }

  if (exactIndex === -1 && selectorIndex !== -1) {
    context.selectors.splice(selectorIndex, 0, exactSelectorName);
    return;
  }

  if (exactIndex !== -1 && selectorIndex === -1) {
    context.selectors.splice(exactIndex + 1, 0, selectorName);
    return;
  }

  if (exactIndex > selectorIndex) {
    context.selectors.splice(exactIndex, 1);
    context.selectors.splice(selectorIndex, 0, exactSelectorName);
  }
}

function createExactSelector(
  context: ParseContext,
  args: { arg: string; selectorName: string },
): string {
  const baseName = `${args.selectorName}Exact`;
  let exactSelectorName = baseName;
  let suffix = 1;
  while (
    context.localVariables.has(exactSelectorName) ||
    context.inputVariables.has(exactSelectorName)
  ) {
    exactSelectorName = `${baseName}${suffix}`;
    suffix += 1;
  }

  context.localVariables.set(exactSelectorName, {
    type: "local-variable",
    name: exactSelectorName,
    value: {
      type: "expression",
      arg: { type: "variable-reference", name: args.arg },
    },
  });

  return exactSelectorName;
}

function matchesForCase(pluralSelector: PluralSelector, key: string): Match[] {
  const { selectorName } = pluralSelector;
  if (pluralSelector.exactSelectorName !== undefined) {
    if (key === "other") {
      return [
        { type: "catchall-match", key: pluralSelector.exactSelectorName },
        { type: "catchall-match", key: selectorName },
      ];
    }

    if (isExactPluralCaseKey(key)) {
      return [
        {
          type: "literal-match",
          key: pluralSelector.exactSelectorName,
          value: key.slice(1),
        },
        { type: "catchall-match", key: selectorName },
      ];
    }

    return [
      { type: "catchall-match", key: pluralSelector.exactSelectorName },
      { type: "literal-match", key: selectorName, value: key },
    ];
  }

  if (key === "other") {
    return [{ type: "catchall-match", key: selectorName }];
  }

  return [{ type: "literal-match", key: selectorName, value: key }];
}

/**
 * Assigns each plural which of the selectors with its key (argument, type
 * and offset) it uses: the first one that no plural before it in the same
 * branch uses, i.e. no plural it is nested in or that precedes it, in any
 * case. Plurals in different cases of a select or plural can share one.
 */
function assignPluralIndexes(tokens: TokenList): Map<Token, number> {
  const indexes = new Map<Token, number>();
  // the number of selectors with each key used before
  const walk = (list: TokenList, used: Map<string, number>) => {
    let current = new Map(used);
    for (const token of list) {
      if (
        (token.type !== "select" &&
          token.type !== "plural" &&
          token.type !== "selectordinal") ||
        isOffsetPound(token)
      ) {
        continue;
      }
      const inCases = new Map(current);
      if (token.type !== "select") {
        const key = createPluralSelectorKey({
          arg: token.arg,
          type: token.type,
          offset: token.pluralOffset,
        });
        const index = current.get(key) ?? 0;
        indexes.set(token, index);
        inCases.set(key, index + 1);
      }
      const after = new Map(inCases);
      for (const selectCase of token.cases) {
        for (const [key, count] of walk(selectCase.tokens, inCases)) {
          after.set(key, Math.max(after.get(key) ?? 0, count));
        }
      }
      current = after;
    }
    return current;
  };
  walk(tokens, new Map());
  return indexes;
}

function isExactPluralCaseKey(key: string): boolean {
  return /^=-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(key);
}

function collectExactPluralSelectorKeys(tokens: TokenList): Set<string> {
  const keys = new Set<string>();

  for (const token of tokens) {
    if (token.type === "plural" || token.type === "selectordinal") {
      if (
        token.cases.some((selectCase) => isExactPluralCaseKey(selectCase.key))
      ) {
        keys.add(
          createPluralSelectorKey({
            arg: token.arg,
            type: token.type,
            offset: token.pluralOffset,
          }),
        );
      }
    }

    if (
      token.type === "select" ||
      token.type === "plural" ||
      token.type === "selectordinal"
    ) {
      for (const selectCase of token.cases) {
        for (const key of collectExactPluralSelectorKeys(selectCase.tokens)) {
          keys.add(key);
        }
      }
    }
  }

  return keys;
}

function createPluralSelectorKey(args: {
  arg: string;
  type: "plural" | "selectordinal";
  offset?: number;
}): string {
  return `${args.arg}|${args.type}|${args.offset ?? 0}`;
}

function sortSelectCases(
  cases: Select["cases"],
  selectorType: "select" | "plural" | "selectordinal",
): Select["cases"] {
  if (selectorType === "select") {
    return cases;
  }

  return [...cases]
    .map((selectCase, index) => ({ selectCase, index }))
    .sort((left, right) => {
      const priorityDiff =
        selectCasePriority(left.selectCase.key) -
        selectCasePriority(right.selectCase.key);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.selectCase);
}

function selectCasePriority(key: string): number {
  if (isExactPluralCaseKey(key)) return 0;
  if (key === "other") return 2;
  return 1;
}

function functionAnnotation(
  name: string,
  param?: TokenList,
): Expression["annotation"] {
  const options: FunctionReference["options"] = [];
  const style = param
    ? serializeTokens(param, { inPlural: false }).trim()
    : undefined;
  if (style && style.length > 0) {
    options.push({ name: "style", value: { type: "literal", value: style } });
  }

  return {
    type: "function-reference",
    name,
    options,
  };
}

function serializeTokens(
  tokens: TokenList,
  options: { inPlural: boolean },
): string {
  let result = "";
  for (const token of tokens) {
    switch (token.type) {
      case "content":
        result += escapeText(token.value, options);
        break;
      case "argument":
        result += `{${token.arg}}`;
        break;
      case "function": {
        const style = token.param
          ? `, ${serializeTokens(token.param, { inPlural: false })}`
          : "";
        result += `{${token.arg}, ${token.key}${style}}`;
        break;
      }
      case "octothorpe":
        result += "#";
        break;
      case "select":
      case "plural":
      case "selectordinal": {
        let header = `${token.arg}, ${token.type},`;
        if (token.pluralOffset && token.pluralOffset !== 0) {
          header += ` offset:${token.pluralOffset}`;
        }
        const cases = token.cases
          .map(
            (selectCase) =>
              `${selectCase.key} {${serializeTokens(selectCase.tokens, {
                inPlural: token.type !== "select",
              })}}`,
          )
          .join(" ");
        result += `{${header} ${cases}}`;
        break;
      }
      default: {
        const exhaustive: never = token;
        throw new Error(`Unsupported token type ${(exhaustive as any)?.type}`);
      }
    }
  }
  return result;
}

function escapeText(value: string, options: { inPlural: boolean }): string {
  return escapeIcuText(value, options.inPlural);
}

function cloneBranch(branch: Branch): Branch {
  return {
    pattern: branch.pattern.map((part: Pattern[number]) => ({ ...part })),
    matches: branch.matches.map((match: Match) => ({ ...match })),
    selectOtherKeys: new Map(
      [...branch.selectOtherKeys].map(([arg, keys]) => [arg, new Set(keys)]),
    ),
    enclosing: branch.enclosing,
  };
}
