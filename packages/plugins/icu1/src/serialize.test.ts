import { describe, expect, it } from "vitest";
import type { Bundle, Message, Variant } from "@inlang/sdk";
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
