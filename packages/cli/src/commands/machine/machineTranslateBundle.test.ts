import { expect, test } from "vitest";
import type { BundleNested } from "@inlang/sdk";
import { machineTranslateBundle } from "./machineTranslateBundle.js";

test("translated variants get ids in the order of the source variants", async () => {
  const values = Array.from({ length: 20 }, (_, index) => `v${index}`);
  const bundle: BundleNested = {
    id: "bundle",
    declarations: [],
    messages: [
      {
        id: "en",
        bundleId: "bundle",
        locale: "en",
        selectors: [{ type: "variable-reference", name: "n" }],
        variants: values.map((value) => ({
          id: `en-${value}`,
          messageId: "en",
          matches: [{ type: "literal-match", key: "n", value }],
          pattern: [{ type: "text", value }],
        })),
      },
    ],
  } as any;

  const result = await machineTranslateBundle({
    bundle,
    sourceLocale: "en",
    targetLocales: ["de"],
    provider: {
      translateText: async ({ text }) => ({
        ok: true,
        translatedText: `${text} (de)`,
      }),
    },
  });

  const de = result.data!.messages.find((message) => message.locale === "de")!;
  // variants are ordered by id: the source order
  const ids = de.variants.map((variant) => variant.id!);
  expect([...ids].sort()).toEqual(ids);
  expect(de.variants.map((variant) => variant.matches)).toEqual(
    bundle.messages[0]!.variants.map((variant) => variant.matches),
  );
});

const provider = {
  translateText: async ({ text }: { text: string }) => ({
    ok: true as const,
    translatedText: `${text} (de)`,
  }),
};

/** A plural bundle: en has `one` and `*`, de has the given variants. */
function pluralBundle(de: Array<[string, string]>): BundleNested {
  const variant = (message: string, value: string, text: string) => ({
    id: `${message}-${value}`,
    messageId: message,
    message_id: message,
    matches:
      value === "*"
        ? [{ type: "catchall-match", key: "countPlural" }]
        : [{ type: "literal-match", key: "countPlural", value }],
    pattern: [{ type: "text", value: text }],
  });
  return {
    id: "items",
    declarations: [],
    messages: [
      {
        id: "en",
        bundleId: "items",
        locale: "en",
        selectors: [{ type: "variable-reference", name: "countPlural" }],
        variants: [
          variant("en", "one", "One item"),
          variant("en", "*", "Many items"),
        ],
      },
      {
        id: "de",
        bundleId: "items",
        locale: "de",
        selectors: [{ type: "variable-reference", name: "countPlural" }],
        variants: de.map(([value, text]) => variant("de", value, text)),
      },
    ],
  } as any;
}

const valuesOf = (message: { variants: Array<{ matches: any[] }> }) =>
  message.variants.map((variant) =>
    variant.matches[0].type === "catchall-match"
      ? "*"
      : variant.matches[0].value,
  );

test("a translated variant goes to its place in the source message", async () => {
  const bundle = pluralBundle([["*", "Viele Dinge"]]);
  const result = await machineTranslateBundle({
    bundle,
    sourceLocale: "en",
    targetLocales: ["de"],
    provider,
  });

  const de = result.data!.messages.find((m) => m.locale === "de")!;
  expect(valuesOf(de)).toEqual(["one", "*"]);
  // the existing catch-all keeps its text and gets an id after `one`
  expect(de.variants[1]!.pattern).toEqual([
    { type: "text", value: "Viele Dinge" },
  ]);
  const ids = de.variants.map((variant) => variant.id!);
  expect([...ids].sort()).toEqual(ids);
  expect(ids).not.toContain("de-*");
  expect(result.replacedVariantIds).toEqual(["de-*"]);
});

test("variants already in order keep their ids", async () => {
  const bundle = pluralBundle([["one", "Ein Ding"]]);
  const result = await machineTranslateBundle({
    bundle,
    sourceLocale: "en",
    targetLocales: ["de"],
    provider,
  });

  const de = result.data!.messages.find((m) => m.locale === "de")!;
  expect(valuesOf(de)).toEqual(["one", "*"]);
  expect(de.variants[0]!.id).toBe("de-one");
  expect(result.replacedVariantIds).toBeUndefined();
});

test("a variant the source doesn't have stays after the one it followed", async () => {
  // e.g. Polish `few`, which English doesn't have
  const bundle = pluralBundle([
    ["few", "Kilka"],
    ["*", "Wiele"],
  ]);
  const result = await machineTranslateBundle({
    bundle,
    sourceLocale: "en",
    targetLocales: ["de"],
    provider,
  });

  const de = result.data!.messages.find((m) => m.locale === "de")!;
  expect(valuesOf(de)).toEqual(["few", "one", "*"]);
  expect(result.replacedVariantIds).toEqual(["de-few", "de-*"]);
});
