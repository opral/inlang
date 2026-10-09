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

  it("serializes a pound outside a plural as the number it stands for", () => {
    // e.g. after an editor removed the plural around `# items`
    const { bundle, message, variants } = buildMessage(
      "{count, plural, one {# item} other {# items}}",
    );
    expect(
      serializeMessage({
        bundle,
        message: { ...message, selectors: [] },
        variants: [{ ...variants.at(-1)!, matches: [] }],
      }),
    ).toBe("{count, number} items");
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
        // the shared suffix moves out of the single case, which is equivalent
        "{guests, plural, offset:2 other {{count, plural, offset:1 other {#}}}} others",
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
    // the export moves the outer `#` into the nested plural's cases, where a
    // bare `#` would display n - 1
    const { bundle, message, variants } = buildMessage(
      "{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}",
    );
    expect(serializeMessage({ bundle, message, variants })).toBe(
      "{n, plural, other {{n, plural, offset:1 one {{n, number} and one} other {{n, number} and many}}}}",
    );
  });

  it("quotes runs of special characters as one segment", () => {
    // quoting them one by one gives '#''#', where '' reads as an apostrophe
    for (const source of [
      "'{}' and it''s",
      "{n, plural, other {'##' and '#{'}}",
      "{n, plural, other {{g, select, a {'##'} other {x}}}}",
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

  it("escapes a literal # inside a select nested in a plural", () => {
    const source =
      "{count, plural, other {{gender, select, male {He has '#'#} other {# they have '#'}}}}";
    const { bundle, message, variants } = buildMessage(source);
    expect(serializeMessage({ bundle, message, variants })).toBe(source);
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
