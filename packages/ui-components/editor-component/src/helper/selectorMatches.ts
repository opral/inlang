import type { Declaration, VariantRow } from "@inlang/sdk";
import { pluralRules, resolveAnnotation } from "@inlang/sdk/browser";

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
  const resolver = resolveAnnotation(name, declarations);
  if (resolver?.name === "plural") {
    const cacheKey = JSON.stringify([locale, resolver.options]);
    const cached = pluralCache.get(cacheKey);
    if (cached) return copy(cached);
    // Unknown locale or runtime options: offer categories without guessing an English rule.
    // ICU `offset` shifts the number before category selection; the category set stays the same.
    const plural = pluralRules(name, declarations, locale);
    const rules = plural?.rules;
    const type = plural?.type ?? "cardinal";
    const offset = plural?.offset ?? 0;
    const values = plural ? plural.categories : categories;
    const samples = new Map<string, number[]>();
    if (rules) for (const number of [...Array.from({ length: 201 }, (_, index) => index), 0.1, 0.2, 1.5, 2.5, 1000, 1000000]) {
      const category = rules.select(number);
      const examples = samples.get(category) ?? [];
      if (examples.length < 3) examples.push(number + offset);
      samples.set(category, examples);
    }
    const result: SelectorMatches = {
      label: rules ? `${type === "ordinal" ? "Ordinal" : "Cardinal"} plural · ${locale}${offset ? ` · offset ${offset}` : ""}` : "Plural · runtime rules",
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
