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

export type ParsedMessage = {
  declarations: Declaration[];
  selectors: VariableReference[];
  variants: VariantImport[];
};

type Branch = {
  pattern: Pattern;
  matches: Match[];
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
  pluralSelectors: Map<string, PluralSelector>;
  exactPluralSelectorKeys: Set<string>;
};

const NULL_BRANCH: Branch = { pattern: [], matches: [] };

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
  };

  const branches = expandTokens(tokens, NULL_BRANCH, context, undefined);

  const declarations = [
    ...context.inputVariables.values(),
    ...context.localVariables.values(),
  ];

  const selectors: VariableReference[] = context.selectors.map((name) => ({
    type: "variable-reference",
    name,
  }));

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
        // `#` displays `arg - offset`. Keep the offset on the expression, so
        // consumers can format `#` without finding the enclosing plural.
        const poundOptions: FunctionReference["options"] =
          pluralContext.offset && pluralContext.offset !== 0
            ? [
                {
                  name: "offset",
                  value: {
                    type: "literal",
                    value: String(pluralContext.offset),
                  },
                },
              ]
            : [];
        for (const current of branches) {
          current.pattern.push({
            type: "expression",
            arg: { type: "variable-reference", name: pluralContext.arg },
            annotation: {
              type: "function-reference",
              name: "icu:pound",
              options: poundOptions,
            },
          });
        }
        break;
      }
      case "select":
      case "plural":
      case "selectordinal": {
        ensureInputVariable(context, token.arg);
        const pluralSelectorKey =
          token.type === "select"
            ? undefined
            : createPluralSelectorKey({
                arg: token.arg,
                type: token.type,
                offset: token.pluralOffset,
              });
        const withExactSelector =
          pluralSelectorKey !== undefined &&
          context.exactPluralSelectorKeys.has(pluralSelectorKey);
        const selectorName =
          token.type === "select"
            ? token.arg
            : ensurePluralSelector(context, {
                arg: token.arg,
                type: token.type,
                offset: token.pluralOffset,
                withExactSelector,
              }).selectorName;
        const pluralSelector =
          token.type === "select"
            ? undefined
            : context.pluralSelectors.get(pluralSelectorKey!);
        ensureSelectorOrder(
          context,
          selectorName,
          pluralSelector?.exactSelectorName,
        );

        const nextBranches: Branch[] = [];
        for (const selectCase of sortSelectCases(token.cases, token.type)) {
          const matches = matchesForCase(
            selectorName,
            selectCase.key,
            token.type,
            pluralSelector,
          );
          for (const current of branches) {
            const branchMatches = matches
              ? [...current.matches, ...matches]
              : current.matches;
            const newBranch = cloneBranch({
              pattern: current.pattern,
              matches: branchMatches,
            });
            const expanded = expandTokens(
              selectCase.tokens,
              newBranch,
              context,
              token.type === "select"
                ? pluralContext
                : { arg: token.arg, offset: token.pluralOffset },
            );
            nextBranches.push(...expanded);
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
  },
): PluralSelector {
  const key = createPluralSelectorKey(args);
  const existing = context.pluralSelectors.get(key);
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
  context.pluralSelectors.set(key, pluralSelector);

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

function matchesForCase(
  selectorName: string,
  key: string,
  selectorType: "select" | "plural" | "selectordinal",
  pluralSelector?: PluralSelector,
): Match[] | undefined {
  if (
    selectorType !== "select" &&
    pluralSelector?.exactSelectorName !== undefined
  ) {
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
  // Quote each run of special characters as one segment: quoting them one
  // by one gives `'#''#'`, where `''` reads as an apostrophe.
  const special = options.inPlural ? /[{}#]+/g : /[{}]+/g;
  return value.replace(/'/g, "''").replace(special, (run) => `'${run}'`);
}

function cloneBranch(branch: Branch): Branch {
  return {
    pattern: branch.pattern.map((part: Pattern[number]) => ({ ...part })),
    matches: branch.matches.map((match: Match) => ({ ...match })),
  };
}
