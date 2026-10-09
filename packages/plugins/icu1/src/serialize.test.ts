import { describe, expect, it } from "vitest";
import type { Bundle, Message, Variant } from "@inlang/sdk";
import { IntlMessageFormat } from "intl-messageformat";
import { parseMessage } from "./parse.js";
import { serializeMessage } from "./serialize.js";

const baseArgs = {
  bundleId: "bundle",
  locale: "en",
};

function buildMessage(messageSource: string): {
  bundle: Bundle;
  message: Message;
  variants: Variant[];
} {
  const parsed = parseMessage({
    ...baseArgs,
    messageSource,
  });
  const messageId = "message-en";
  return {
    bundle: {
      id: "bundle",
      declarations: parsed.declarations,
    },
    message: {
      id: messageId,
      bundleId: "bundle",
      locale: "en",
      selectors: parsed.selectors,
    },
    variants: parsed.variants.map((variant, index) => ({
      id: `variant-${index}`,
      messageId,
      matches: variant.matches ?? [],
      pattern: variant.pattern ?? [],
    })),
  };
}

describe("serializeMessage", () => {
  it("serializes simple patterns", () => {
    const { bundle, message, variants } = buildMessage("Hello {name}!");
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "Hello {name}!",
    );
  });

  it("serializes selects", () => {
    const { bundle, message, variants } = buildMessage(
      "{gender, select, male {He} female {She} other {They}}",
    );
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "{gender, select, male {He} female {She} other {They}}",
    );
  });

  it("serializes plurals with offset and pounds", () => {
    const { bundle, message, variants } = buildMessage(
      "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
    );
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
    );
  });

  describe("# outside the plural it refers to", () => {
    // e.g. after an editor removed the plural around `# others`
    const withoutPlural = (messageSource: string) => {
      const { bundle, message, variants } = buildMessage(messageSource);
      return serializeMessage({
        bundle,
        message: { ...message, selectors: [] },
        variants: [{ ...variants.at(-1)!, matches: [] }],
      });
    };

    it("serializes # without an offset as the number it displays", () => {
      expect(
        withoutPlural("{count, plural, one {# item} other {# items}}"),
      ).toBe("{count, number} items");
    });

    it("serializes # with an offset as a plural that applies the offset", () => {
      const exported = withoutPlural(
        "{count, plural, offset:1 one {You and # other} other {You and # others}}",
      );
      expect(exported).toBe(
        "You and {count, plural, offset:1 other {#}} others",
      );
      // the export imports as # with the same offset
      expect(
        parseMessage({ ...baseArgs, messageSource: exported }).variants.map(
          (variant) => variant.pattern?.[1],
        ),
      ).toEqual([
        {
          type: "expression",
          arg: { type: "variable-reference", name: "count" },
          annotation: {
            type: "function-reference",
            name: "icu:pound",
            options: [
              { name: "offset", value: { type: "literal", value: "1" } },
            ],
          },
        },
      ]);
    });

    it("serializes # in a plural on another argument as the number it displays", () => {
      const { bundle, message, variants } = buildMessage(
        "{guests, plural, offset:2 other {x}}",
      );
      const countPound = buildMessage(
        "{count, plural, offset:1 other {# others}}",
      ).variants[0]!.pattern;
      expect(
        serializeMessage({
          bundle,
          message,
          variants: [{ ...variants[0]!, pattern: countPound }],
        }),
      ).toBe(
        "{guests, plural, offset:2 other {{count, plural, offset:1 other {#}} others}}",
      );
    });

    it("keeps # without an offset option inside a plural with an offset", () => {
      // imports from before the offset was kept on #
      const { bundle, message, variants } = buildMessage(
        "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
      );
      const legacyVariants = variants.map((variant) => ({
        ...variant,
        pattern: variant.pattern.map((part) =>
          part.type === "expression" && part.annotation?.name === "icu:pound"
            ? { ...part, annotation: { ...part.annotation, options: [] } }
            : part,
        ),
      }));
      expect(
        serializeMessage({ bundle, message, variants: legacyVariants }),
      ).toBe(
        "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
      );
    });
  });

  it("does not bind an offset-0 # to a nested plural with an offset", () => {
    // the outer `#` stays out of the nested plural's cases, where a bare `#`
    // would display n - 1
    const source =
      "{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}";
    const { bundle, message, variants } = buildMessage(source);
    expect(serializeMessage({ bundle, message, variants })).toBe(source);
  });

  it("quotes runs of special characters as one segment", () => {
    // quoting them one by one gives '#''#', where '' reads as an apostrophe
    for (const source of [
      "'{}' and it''s",
      "{n, plural, other {'##' and '#{'}}",
      "{n, plural, one {'##'} other {x'#{'}}",
    ]) {
      const { bundle, message, variants } = buildMessage(source);
      const exported = serializeMessage({ bundle, message, variants });
      expect(exported).toBe(source);
      // and the export is stable
      const again = buildMessage(exported);
      expect(serializeMessage(again)).toBe(source);
    }
  });

  describe("literal text round-trips with the same display", () => {
    // Exports `text` as the only text of a message, in a plural or not.
    const exportText = (text: string, inPlural: boolean): string => {
      const { bundle, message, variants } = buildMessage(
        inPlural ? "{n, plural, other {x}}" : "x",
      );
      return serializeMessage({
        bundle,
        message,
        variants: [
          { ...variants[0]!, pattern: [{ type: "text", value: text }] },
        ],
      });
    };
    const display = (source: string) =>
      new IntlMessageFormat(source, "en").format({ n: 1 });

    const expectRoundTrip = (text: string, inPlural: boolean) => {
      const exported = exportText(text, inPlural);
      expect(display(exported), exported).toBe(text);
      // a second export is byte-identical
      expect(serializeMessage(buildMessage(exported))).toBe(exported);
      // and the import reads back the same text
      const imported = parseMessage({ ...baseArgs, messageSource: exported });
      expect(
        imported.variants[0]?.pattern
          ?.map((part) => (part.type === "text" ? part.value : ""))
          .join(""),
      ).toBe(text);
    };

    it("quotes special characters separated by apostrophes as one segment", () => {
      // '#' + '' + '#' reads as one quoted segment in which '' is one
      // apostrophe, so quoting them one by one gains an apostrophe per export
      expect(exportText("#'#", true)).toBe("{n, plural, other {'#''#'}}");
      expectRoundTrip("#'#", true);
      expect(exportText("{'}", false)).toBe("'{''}'");
      expectRoundTrip("{'}", false);
      expect(
        serializeMessage(buildMessage("{count, plural, other {'#''#'}}")),
      ).toBe("{count, plural, other {'#''#'}}");
      expect(serializeMessage(buildMessage("'{''}'"))).toBe("'{''}'");
    });

    it("escapes function styles the same way", () => {
      // the import keeps the style as ICU source, escaped by the same rules
      for (const source of [
        "{v, fmt, '{''}'}",
        "{v, fmt, it''s '{'x'}'}",
        "{n, number, ::currency/EUR}",
      ]) {
        expect(serializeMessage(buildMessage(source))).toBe(source);
      }
    });

    it("round-trips random text (seeded)", () => {
      // mulberry32
      let seed = 4443;
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const alphabet = ["a", " ", "'", "'", "{", "}", "#"];
      for (let i = 0; i < 2000; i++) {
        const length = Math.floor(random() * 10);
        let text = "";
        for (let j = 0; j < length; j++) {
          text += alphabet[Math.floor(random() * alphabet.length)];
        }
        expectRoundTrip(text, true);
        expectRoundTrip(text, false);
      }
    });
  });

  describe("# displays what it displayed in the source", () => {
    const counts = [0, 1, 2, 5, 22];
    const format = (source: string, values: Record<string, unknown>) =>
      new IntlMessageFormat(source, "en").format(values);

    // imports from before the offset was kept on # have no offset option
    const withoutPoundOffsets = (variants: Variant[]): Variant[] =>
      variants.map((variant) => ({
        ...variant,
        pattern: variant.pattern.map((part) =>
          part.type === "expression" && part.annotation?.name === "icu:pound"
            ? { ...part, annotation: { ...part.annotation, options: [] } }
            : part,
        ),
      }));

    const expectSameDisplay = (
      source: string,
      exported: string,
      valuesFor: (count: number) => Record<string, unknown>,
    ) => {
      for (const count of counts) {
        expect(format(exported, valuesFor(count))).toBe(
          format(source, valuesFor(count)),
        );
      }
    };

    it("keeps # without an offset as the number in a plural with an offset", () => {
      const source =
        "{count, plural, one {# item} other {# items}}: {count, plural, offset:1 one {you and # other} other {you and # others}}";
      const { bundle, message, variants } = buildMessage(source);
      const exported = serializeMessage({ bundle, message, variants });
      expectSameDisplay(source, exported, (count) => ({ count }));
      expect(format(exported, { count: 2 })).toBe("2 items: you and 1 other");
    });

    it("keeps # with an offset in a plural without an offset", () => {
      const source =
        "{count, plural, offset:1 one {you and # other} other {you and # others}} ({count, plural, one {# guest} other {# guests}})";
      const { bundle, message, variants } = buildMessage(source);
      const exported = serializeMessage({ bundle, message, variants });
      expectSameDisplay(source, exported, (count) => ({ count }));
    });

    for (const legacy of [false, true]) {
      const label = legacy ? "a legacy #" : "#";
      const prepare = (variants: Variant[]) =>
        legacy ? withoutPoundOffsets(variants) : variants;

      it(`keeps the offset of ${label} hoisted out of its plural by a select`, () => {
        const source =
          "{gender, select, male {{count, plural, offset:1 other {# his}}} other {{count, plural, offset:1 other {# their}}}}";
        const { bundle, message, variants } = buildMessage(source);
        const exported = serializeMessage({
          bundle,
          message,
          variants: prepare(variants),
        });
        for (const gender of ["male", "other"]) {
          expectSameDisplay(source, exported, (count) => ({ count, gender }));
        }
      });

      it(`keeps the offset of ${label} that ends up in a plural on another argument`, () => {
        const source =
          "{guests, plural, other {{gender, select, male {{count, plural, offset:1 other {# his}}} other {{count, plural, offset:1 other {# their}}}}}}";
        const { bundle, message, variants } = buildMessage(source);
        const exported = serializeMessage({
          bundle,
          message,
          variants: prepare(variants),
        });
        for (const gender of ["male", "other"]) {
          expectSameDisplay(source, exported, (count) => ({
            count,
            gender,
            guests: 3,
          }));
        }
      });

      it(`keeps the offset of ${label} after an editor removed its plural`, () => {
        const { bundle, message, variants } = buildMessage(
          "{count, plural, offset:1 one {You and # other} other {You and # others}}",
        );
        const exported = serializeMessage({
          bundle,
          message: { ...message, selectors: [] },
          variants: prepare([{ ...variants.at(-1)!, matches: [] }]),
        });
        for (const count of counts) {
          expect(format(exported, { count })).toBe(
            `You and ${count - 1} others`,
          );
        }
      });
    }

    it("keeps # without an offset that a select moves into a plural with an offset", () => {
      // the select under the offset plural moves the shared `#` of the
      // nested offset-free plural out of it
      const source =
        "{count, plural, offset:1 other {{gender, select, male {{count, plural, other {# x}}} other {{count, plural, other {# y}}}}}}";
      const { bundle, message, variants } = buildMessage(source);
      const exported = serializeMessage({ bundle, message, variants });
      for (const gender of ["male", "other"]) {
        expectSameDisplay(source, exported, (count) => ({ count, gender }));
      }
      expect(format(exported, { count: 2, gender: "male" })).toBe("2 x");
    });

    it("resolves a legacy # by the plurals of its own message", () => {
      // the bundle's declarations are shared by all locales: another locale
      // using the argument without an offset must not change this one
      const source =
        "{count, plural, offset:1 =0 {nobody} one {you and # other} other {you and # others}}";
      const { bundle, message, variants } = buildMessage(source);
      const de = buildMessage(
        "{count, plural, one {# Person} other {# Personen}}",
      );
      const exported = serializeMessage({
        bundle: {
          ...bundle,
          declarations: [
            ...bundle.declarations,
            ...de.bundle.declarations.filter(
              (declaration) =>
                !bundle.declarations.some(
                  (existing) => existing.name === declaration.name,
                ),
            ),
          ],
        },
        message,
        variants: withoutPoundOffsets(variants),
      });
      expect(exported).toBe(source);
      expectSameDisplay(source, exported, (count) => ({ count }));
    });

    it("keeps a legacy # in the plural with an offset it sits in", () => {
      const source =
        "{count, plural, offset:1 =0 {no one} one {you and # other} other {you and # others}}";
      const { bundle, message, variants } = buildMessage(source);
      const exported = serializeMessage({
        bundle,
        message,
        variants: withoutPoundOffsets(variants),
      });
      expect(exported).toBe(source);
      expectSameDisplay(source, exported, (count) => ({ count }));
    });
  });

  it("writes no # in a select nested in a plural", () => {
    // ICU and intl-messageformat read `#` and `'#'` in a select nested in a
    // plural as literal text, the import reads them as in the plural
    const source =
      "{count, plural, other {{gender, select, male {He has '#'#} other {# they have '#'}}}}";
    const { bundle, message, variants } = buildMessage(source);
    const exported = serializeMessage({ bundle, message, variants });
    expect(exported).toBe(
      "{gender, select, male {He has #{count, number}} other {{count, number} they have #}}",
    );
    expect(serializeMessage(buildMessage(exported))).toBe(exported);
    const format = (gender: string) =>
      new IntlMessageFormat(exported, "en").format({ count: 5, gender });
    expect(format("male")).toBe("He has #5");
    expect(format("other")).toBe("5 they have #");
  });

  it("serializes selectordinal", () => {
    const { bundle, message, variants } = buildMessage(
      "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    );
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    );
  });

  it("serializes functions with style", () => {
    const { bundle, message, variants } = buildMessage(
      "The time is {when, time, short}.",
    );
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "The time is {when, time, short}.",
    );
  });

  it("returns empty output when selectors exist but no variants", () => {
    const { bundle, message } = buildMessage(
      "{gender, select, male {He} female {She} other {They}}",
    );

    expect(serializeMessage({ bundle, message, variants: [] })).toBe("");
  });

  it("keeps identical select cases intact", () => {
    const { bundle, message, variants } = buildMessage(
      "{gender, select, male {Hello} female {Hello} other {Hello}}",
    );

    expect(serializeMessage({ bundle, message, variants })).toBe(
      "{gender, select, male {Hello} female {Hello} other {Hello}}",
    );
  });

  it("throws for markup placeholders", () => {
    const messageId = "message-en";
    const bundle: Bundle = {
      id: "bundle",
      declarations: [],
    };
    const message: Message = {
      id: messageId,
      bundleId: "bundle",
      locale: "en",
      selectors: [],
    };
    const variants: Variant[] = [
      {
        id: "variant-0",
        messageId,
        matches: [],
        pattern: [
          { type: "text", value: "Click " },
          { type: "markup-start", name: "link" },
          { type: "text", value: "here" },
          { type: "markup-end", name: "link" },
        ],
      },
    ];

    expect(() => serializeMessage({ bundle, message, variants })).toThrow(
      "Markup placeholders are not supported by ICU MessageFormat 1",
    );
  });
});

/**
 * Exports `source`, and expects the export and a second export to display
 * what the source displays for every combination of `values`, and the second
 * export to be byte-identical unless `stable` is false.
 */
function expectSameDisplay(
  source: string,
  values: Record<string, unknown[]>,
  options: { stable: boolean } = { stable: true },
): string {
  const exported = serializeMessage(buildMessage(source));
  const again = serializeMessage(buildMessage(exported));
  if (options.stable) expect(again, exported).toBe(exported);
  const sourceFormat = new IntlMessageFormat(source, "en");
  for (const output of [exported, again]) {
    const outputFormat = new IntlMessageFormat(output, "en");
    for (const combination of combinations(values)) {
      expect(
        outputFormat.format(combination),
        `${output} with ${JSON.stringify(combination)}`,
      ).toBe(sourceFormat.format(combination));
    }
  }
  return exported;
}

function combinations(
  values: Record<string, unknown[]>,
): Record<string, unknown>[] {
  return Object.entries(values).reduce<Record<string, unknown>[]>(
    (result, [name, options]) =>
      result.flatMap((combination) =>
        options.map((option) => ({ ...combination, [name]: option })),
      ),
    [{}],
  );
}

const counts = [0, 1, 2, 5, 22];

describe("# next to a select in a plural", () => {
  it("keeps # out of a select that follows it", () => {
    // the select can't take the shared `# item ` out of its cases, which
    // would leave `other` empty
    const source =
      "{count, plural, one {# item} other {# items}} {gender, select, female {for her} other {}}";
    const exported = expectSameDisplay(source, {
      count: counts,
      gender: ["female", "male"],
    });
    expect(exported).toBe(
      "{count, plural, one {# item {gender, select, female {for her} other {}}} other {# items {gender, select, female {for her} other {}}}}",
    );
  });

  it("writes # between two selects as the number", () => {
    const source =
      "{count, plural, other {{a, select, x {X} other {Y}} has # {b, select, x {cat} other {cats}}}}";
    expectSameDisplay(source, {
      count: counts,
      a: ["x", "y"],
      b: ["x", "y"],
    });
  });

  it("writes # with an offset between two selects as the number", () => {
    const source =
      "{count, plural, offset:1 =0 {Nobody} other {{host, select, me {You} other {{host}}} and # {g, select, one {other} other {others}}}}";
    expectSameDisplay(source, {
      count: counts,
      host: ["me", "Ann"],
      g: ["one", "two"],
    });
  });

  it("keeps a select with a literal # out of the plural", () => {
    // `'#'` in a select nested in a plural is not a quoted "#" for ICU
    const source =
      "{count, plural, one {# issue} other {# issues}} in {channel, select, general {#general} other {#random}}";
    const exported = expectSameDisplay(source, {
      count: counts,
      channel: ["general", "other"],
    });
    expect(exported).toBe(source);
  });

  it("keeps a select with a literal # out of a plural it is nested in", () => {
    const source =
      "{count, plural, one {{g, select, a {A} other {B}} '#'1} other {{g, select, a {A} other {B}} '#'{count}}}";
    expectSameDisplay(source, { count: counts, g: ["a", "b"] });
  });

  it("escapes adjacent literal texts together", () => {
    // escaped one by one, `#'#` and `#` would give '#''#' + '#', which reads
    // as one quoted segment
    expectSameDisplay(
      "{n, plural, one {'#''#'} other {x}}{g, select, other {#}}",
      { n: counts, g: ["a"] },
    );
  });
});

describe("literal # next to selects and plurals the variants don't use", () => {
  it("moves a literal # out of a select despite a plural of another case", () => {
    expectSameDisplay(
      "{m, plural, one {{m, plural, offset:1 other {#}} '#'{g, select, b {B} other {O}}} other {{m, plural, offset:1 one {you} other {# others}}}}",
      { m: counts, g: ["a", "b"] },
    );
  });

  it("moves a select out of a plural whose other case doesn't use it", () => {
    expectSameDisplay(
      "{n, plural, one {{g, select, a {A} other {B}} '#'} other {C}} {n, plural, one {{g, select, b {X} other {Y}}} other {Z}}",
      { n: counts, g: ["a", "b", "c"] },
    );
    expectSameDisplay(
      "{n, plural, one {{h, select, a {A} other {B}} '#'} other {C}}{n, plural, =2 {{h, select, b {X} other {Y}}} other {Z}}",
      { n: counts, h: ["a", "b", "c"] },
    );
  });
});

describe("selectors nested in each other in different cases", () => {
  it("keeps variants without a match on the outer selector in every case", () => {
    expectSameDisplay(
      "{g, select, a {{n, plural, one {{m, plural, one {A} other {B}}} other {C}}} other {{m, plural, one {{n, plural, one {D} other {E}}} other {F}}}}",
      { g: ["a", "b"], n: counts, m: counts },
    );
    // the second export nests the selects differently
    expectSameDisplay(
      "{h, select, a {{g, select, a {{m, plural, one {A} other {B}}} other {C}}} other {{m, plural, one {one item} other {{g, select, a {her items} other {their items}}}}}}",
      { h: ["a", "b"], g: ["a", "b"], m: counts },
      { stable: false },
    );
    expectSameDisplay(
      "{n, plural, one {{g, select, a {She} other {They}} posted in '#'general} other {# posts}}{m, plural, one {} other { by {g, select, a {her} other {them}}}}",
      { n: counts, m: counts, g: ["a", "b"] },
      { stable: false },
    );
  });
});

describe("plurals on the same argument", () => {
  it("keeps the cases of sibling plurals apart", () => {
    const source =
      "{count, plural, one {# file} other {# files}} {count, plural, one {was} other {were}} deleted";
    const exported = expectSameDisplay(source, { count: counts });
    expect(exported).toBe(source);
  });

  it("keeps the cases of sibling plurals with exact matches apart", () => {
    const source =
      "{count, plural, =0 {no file} one {# file} other {# files}} {count, plural, =1 {was} other {were}} deleted";
    const exported = expectSameDisplay(source, { count: counts });
    expect(exported).toBe(source);
  });

  it("keeps the cases of a nested plural apart", () => {
    const source =
      "{n, plural, one {one} other {{n, plural, =2 {two} one {never} other {many}}}}";
    const exported = expectSameDisplay(source, { n: counts });
    expect(exported).toBe(source);
  });

  it("keeps the cases of nested plurals with an offset apart", () => {
    expectSameDisplay(
      "{n, plural, offset:1 =0 {nobody} =1 {you} other {{n, plural, offset:1 one {you and # other} other {you and # others}}}}",
      { n: counts },
    );
  });

  it("keeps a select nested in a nested plural after both plurals", () => {
    // the select occurs in another case first: as a selector ahead of the
    // nested plural it would decide first
    expectSameDisplay(
      "{n, plural, =0 {{h, select, other {x}}} =1 {{n, plural, =1 {y} other {{h, select, b {B} other {z}}}}} other {w}}",
      { n: counts, h: ["b", "c"] },
    );
  });

  it("keeps exact matches with the plural they belong to", () => {
    // the exact selector of the inner plural is not the one of the outer
    // plural with an offset
    expectSameDisplay(
      "{n, plural, offset:1 one {{n, plural, =1 {X} other {Y}}} other {Z}}",
      { n: counts },
    );
  });
});

describe("selects on the same argument", () => {
  it("merges sibling selects", () => {
    const exported = expectSameDisplay(
      "{g, select, female {She} other {They}} {g, select, female {is} other {are}} here",
      { g: ["female", "male"] },
    );
    expect(exported).toBe("{g, select, female {She is} other {They are}} here");
  });

  it("merges nested selects", () => {
    const exported = expectSameDisplay(
      "{g, select, a {A} other {{g, select, a {never} b {B} other {O}}}}",
      { g: ["a", "b", "c"] },
    );
    expect(exported).toBe("{g, select, a {A} b {B} other {O}}");
  });

  it("selects a key a nested select adds in other branches by other", () => {
    expectSameDisplay(
      "{h, select, other {-}}{g, select, a {{h, select, b {B} other {O}}} other {X}}",
      { g: ["a", "c"], h: ["b", "c"] },
    );
  });
});

describe("display after export (seeded)", () => {
  it("displays nested selects and plurals as in the source", () => {
    // mulberry32
    let seed = 4444;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(options: T[]): T =>
      options[Math.floor(random() * options.length)]!;
    // Selectors nest in one order, g, n, h, m: a select or plural only
    // contains or precedes ones on the same or a later argument. Repeated
    // arguments give plurals and selects on the same argument. In a select
    // nested in a plural, ICU reads # and '#' as literal text, unlike the
    // import, so they are not generated there.
    const args = ["g", "n", "h", "m"];
    type Place = "outside" | "plural" | "select in plural";
    const generate = (depth: number, place: Place, from: number): string => {
      // texts sit between expressions: the import reads adjacent texts as
      // one, which the export moves differently than two
      const expression = () =>
        place === "plural" && random() < 0.5
          ? "#"
          : pick(["{x}", "{n, number}"]);
      let result = expression();
      for (let part = Math.floor(random() * 3); part > 0; part--) {
        if (depth === 0 || random() < 0.4) {
          const hash = { outside: "#", plural: "'#'", "select in plural": "c" };
          result += pick(["a", " b ", hash[place]]) + expression();
          continue;
        }
        const index = from + Math.floor(random() * (args.length - from));
        const arg = args[index]!;
        from = index;
        if (arg === "g" || arg === "h") {
          const keys = ["a", "b"].filter(() => random() < 0.6);
          const inCase: Place =
            place === "outside" ? "outside" : "select in plural";
          result += `{${arg}, select, ${[...keys, "other"]
            .map((key) => `${key} {${generate(depth - 1, inCase, index)}}`)
            .join(" ")}}`;
        } else {
          const offset = arg === "m" ? " offset:1" : "";
          const keys = ["=0", "=1", "one"].filter(() => random() < 0.4);
          result += `{${arg}, plural,${offset} ${[...keys, "other"]
            .map((key) => `${key} {${generate(depth - 1, "plural", index)}}`)
            .join(" ")}}`;
        }
      }
      return result;
    };
    const values = combinations({
      n: counts,
      m: [1, 5],
      g: ["a", "b", "c"],
      h: ["a", "c"],
      x: ["X"],
    });
    for (let i = 0; i < 300; i++) {
      const source = generate(2, "outside", 0);
      const exported = serializeMessage(buildMessage(source));
      const again = serializeMessage(buildMessage(exported));
      const sourceFormat = new IntlMessageFormat(source, "en");
      const exportFormat = new IntlMessageFormat(exported, "en");
      const againFormat = new IntlMessageFormat(again, "en");
      for (const combination of values) {
        const expected = sourceFormat.format(combination);
        expect(
          exportFormat.format(combination),
          `${source} -> ${exported}`,
        ).toBe(expected);
        expect(againFormat.format(combination), `${exported} -> ${again}`).toBe(
          expected,
        );
      }
    }
  });
});
