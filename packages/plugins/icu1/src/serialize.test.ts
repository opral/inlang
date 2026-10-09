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
