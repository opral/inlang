import type { Declaration, FunctionReference, VariantRow } from "@inlang/sdk";

export type MatchSuggestion = { value: string; description: string };
export type SelectorMatches = {
  label: string;
  suggestions: MatchSuggestion[];
  /** A known plural resolver has a finite result set; untyped inputs do not. */
  allowed?: string[];
};
const pluralCache = new Map<string, SelectorMatches>();
const categories = ["zero", "one", "two", "few", "many", "other"];
const fallback: MatchSuggestion = { value: "*", description: "Fallback · matches any remaining value" };
/** Results are cached, so callers always receive a private copy they may mutate. */
const copy = (matches: SelectorMatches): SelectorMatches => ({
  label: matches.label,
  suggestions: matches.suggestions.map(suggestion => ({ ...suggestion })),
  ...(matches.allowed ? { allowed: [...matches.allowed] } : {}),
});

/** Derive suggestions from declarations, never from a variable's spelling. */
export function selectorMatches(name: string, declarations: Declaration[], locale: string, variants: VariantRow[]): SelectorMatches {
  const seen = new Set<string>();
  function annotation(variable: string): FunctionReference | undefined {
    if (seen.has(variable)) return;
    seen.add(variable);
    const declaration = declarations.find(value => value.name === variable);
    if (!declaration) return;
    if (declaration.type === "input-variable") return declaration.annotation;
    return declaration.value.annotation ?? (declaration.value.arg.type === "variable-reference" ? annotation(declaration.value.arg.name) : undefined);
  }
  const resolver = annotation(name);
  if (resolver?.name === "plural") {
    const cacheKey = JSON.stringify([locale, resolver.options]);
    const cached = pluralCache.get(cacheKey);
    if (cached) return copy(cached);
    const option = resolver.options.find(value => value.name === "type");
    let knownType = !option || option.value.type === "literal" && ["cardinal", "ordinal"].includes(option.value.value);
    const type = option?.value.type === "literal" && option.value.value === "ordinal" ? "ordinal" : "cardinal";
    const ruleOptions: Intl.PluralRulesOptions = { type };
    const numericOptions = ["minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits", "minimumSignificantDigits", "maximumSignificantDigits"];
    for (const option of resolver.options.filter(value => value.name !== "type")) {
      if (numericOptions.includes(option.name) && option.value.type === "literal" && option.value.value.trim() && Number.isFinite(Number(option.value.value))) {
        Object.assign(ruleOptions, { [option.name]: Number(option.value.value) });
      } else knownType = false;
    }
    let rules: Intl.PluralRules | undefined;
    try {
      if (knownType && Intl.PluralRules.supportedLocalesOf(locale).length) rules = new Intl.PluralRules(locale, ruleOptions);
    } catch { /* Unknown locale: offer categories without guessing an English rule. */ }
    const values = rules ? rules.resolvedOptions().pluralCategories : categories;
    const samples = new Map<string, number[]>();
    if (rules) for (const number of [...Array.from({ length: 201 }, (_, index) => index), 0.1, 0.2, 1.5, 2.5, 1000, 1000000]) {
      const category = rules.select(number);
      const examples = samples.get(category) ?? [];
      if (examples.length < 3) examples.push(number);
      samples.set(category, examples);
    }
    const result: SelectorMatches = {
      label: rules ? `${type === "ordinal" ? "Ordinal" : "Cardinal"} plural · ${locale}` : "Plural · runtime rules",
      allowed: rules ? [...values, "*"] : undefined,
      suggestions: [...values.map(value => ({ value, description: samples.get(value)?.length ? `e.g. ${samples.get(value)!.join(", ")}` : "Plural category" })), fallback],
    };
    if (pluralCache.size >= 128) pluralCache.delete(pluralCache.keys().next().value!);
    pluralCache.set(cacheKey, result);
    return copy(result);
  }
  const existing = [...new Set(variants.flatMap(variant => variant.matches.flatMap(match => match.key === name && match.type === "literal-match" && match.value ? [match.value] : [])))];
  return { label: resolver ? `${resolver.name} · custom value` : "Text · custom value", suggestions: [...existing.map(value => ({ value, description: "Used in this message" })), fallback] };
}
