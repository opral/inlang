import { expect, it } from "vitest";
import type { Declaration, VariantRow } from "@inlang/sdk";
import { selectorMatches } from "./selectorMatches.js";
const plural = (options: { name: string; value: { type: "literal"; value: string } }[] = []): Declaration[] => [
  { type: "input-variable", name: "count" },
  { type: "local-variable", name: "amount", value: { type: "expression", arg: { type: "variable-reference", name: "count" }, annotation: { type: "function-reference", name: "plural", options } } },
];
it("offers locale-specific cardinal categories and a distinct fallback", () => {
  expect(selectorMatches("amount", plural(), "en", []).allowed).toEqual(["one", "other", "*"]);
  expect(selectorMatches("amount", plural(), "ar", []).allowed).toEqual(expect.arrayContaining(["zero", "one", "two", "few", "many", "other", "*"]));
  expect(selectorMatches("amount", plural(), "ru", []).suggestions.find(s => s.value === "few")?.description).toContain("2");
  expect(selectorMatches("amount", plural(), "en", []).suggestions.find(s => s.value === "*")?.description).toContain("Fallback");
});
it("distinguishes ordinal categories and supplies examples", () => {
  const result = selectorMatches("amount", plural([{ name: "type", value: { type: "literal", value: "ordinal" } }]), "en", []);
  // CLDR order, as the SDK reports plural categories
  expect(result.allowed).toEqual(["one", "two", "few", "other", "*"]);
  expect(result.label).toBe("Ordinal plural · en");
  expect(result.suggestions.find(s => s.value === "two")?.description).toContain("2");
});
it("follows aliases while handling cycles without recursion errors", () => {
  const declarations = plural();
  declarations.push({ type: "local-variable", name: "alias", value: { type: "expression", arg: { type: "variable-reference", name: "amount" } } });
  expect(selectorMatches("alias", declarations, "en", []).allowed).toContain("one");
  expect(selectorMatches("x", [
    { type: "local-variable", name: "x", value: { type: "expression", arg: { type: "variable-reference", name: "y" } } },
    { type: "local-variable", name: "y", value: { type: "expression", arg: { type: "variable-reference", name: "x" } } },
  ], "en", []).allowed).toBeUndefined();
});
it("does not infer plural types from names or constrain arbitrary text", () => {
  const variants = [{ id: "a", message_id: "m", pattern: [], matches: [{ type: "literal-match", key: "countPlural", value: "custom" }] }] as VariantRow[];
  const result = selectorMatches("countPlural", [{ type: "input-variable", name: "countPlural" }], "en", variants);
  expect(result.allowed).toBeUndefined();
  expect(result.suggestions.map(s => s.value)).toEqual(["custom", "*"]);
});
it("does not silently use English rules for unsupported or invalid locales", () => {
  expect(selectorMatches("amount", plural(), "zz", []).allowed).toBeUndefined();
  expect(selectorMatches("amount", plural(), "bad_locale", []).suggestions.map(s => s.value)).toContain("few");
});
it("keeps runtime plural options open rather than pretending the type is known", () => {
  const declarations = plural();
  const declaration = declarations[1]!;
  if (declaration.type === "local-variable") declaration.value.annotation!.options.push({ name: "type", value: { type: "variable-reference", name: "type" } });
  expect(selectorMatches("amount", declarations, "en", []).allowed).toBeUndefined();
});

it("respects literal digit options and caches equivalent plural contexts", () => {
  const declarations = plural([{ name: "minimumFractionDigits", value: { type: "literal", value: "2" } }]);
  const result = selectorMatches("amount", declarations, "en", []);
  expect(result.suggestions.find(s => s.value === "other")?.description).toBe("e.g. 0, 1, 2");
  result.allowed!.push("banana");
  result.suggestions.length = 0;
  const cached = selectorMatches("amount", declarations, "en", []);
  expect(cached).not.toBe(result);
  expect(cached.allowed).toEqual(["one", "other", "*"]);
  expect(cached.suggestions.map(s => s.value)).toEqual(["one", "other", "*"]);
});

it("keeps categories known for ICU offsets and shifts the examples", () => {
  const result = selectorMatches("amount", plural([{ name: "offset", value: { type: "literal", value: "1" } }]), "en", []);
  expect(result.allowed).toEqual(["one", "other", "*"]);
  expect(result.label).toBe("Cardinal plural · en · offset 1");
  expect(result.suggestions.find(s => s.value === "one")?.description).toBe("e.g. 2");
  expect(selectorMatches("amount", plural([{ name: "offset", value: { type: "literal", value: "x" } }]), "en", []).allowed).toBeUndefined();
});
