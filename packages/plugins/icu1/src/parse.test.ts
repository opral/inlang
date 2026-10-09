import { describe, expect, it } from "vitest";
import { parseMessage } from "./parse.js";
import type { Declaration, Match, Pattern, VariantImport } from "@inlang/sdk";

const baseArgs = {
  bundleId: "bundle",
  locale: "en",
};

describe("parseMessage", () => {
  it("parses text and arguments", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "Hello {name}!",
    });

    expect(parsed.declarations).toEqual([
      { type: "input-variable", name: "name" },
    ] satisfies Declaration[]);
    expect(parsed.selectors).toEqual([]);
    expect(parsed.variants).toEqual([
      {
        messageBundleId: "bundle",
        messageLocale: "en",
        matches: [],
        pattern: [
          { type: "text", value: "Hello " },
          {
            type: "expression",
            arg: { type: "variable-reference", name: "name" },
          },
          { type: "text", value: "!" },
        ],
      },
    ] satisfies VariantImport[]);
  });

  it("parses select cases", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "{gender, select, male {He} female {She} other {They}}",
    });

    expect(parsed.declarations).toEqual(
      expect.arrayContaining([
        { type: "input-variable", name: "gender" },
      ] satisfies Declaration[]),
    );
    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "gender" },
    ]);

    const matches = parsed.variants.map((variant) => variant.matches ?? []);
    expect(matches).toEqual(
      expect.arrayContaining([
        [{ type: "literal-match", key: "gender", value: "male" }],
        [{ type: "literal-match", key: "gender", value: "female" }],
        [{ type: "catchall-match", key: "gender" }],
      ]),
    );
  });

  it("declares selector inputs without interpolation", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "{count, plural, one {item} other {items}}",
    });

    expect(parsed.declarations).toEqual(
      expect.arrayContaining([
        { type: "input-variable", name: "count" },
      ] satisfies Declaration[]),
    );
  });

  it("parses plurals with offset, exact, and pound", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{count, plural, offset:1 =0 {no items} one {# item} other {# items}}",
    });

    expect(parsed.declarations).toEqual(
      expect.arrayContaining([
        { type: "input-variable", name: "count" },
        {
          type: "local-variable",
          name: "countPluralOffset1",
          value: {
            type: "expression",
            arg: { type: "variable-reference", name: "count" },
            annotation: {
              type: "function-reference",
              name: "plural",
              options: [
                { name: "offset", value: { type: "literal", value: "1" } },
              ],
            },
          },
        },
        {
          type: "local-variable",
          name: "countPluralOffset1Exact",
          value: {
            type: "expression",
            arg: { type: "variable-reference", name: "count" },
          },
        },
      ] satisfies Declaration[]),
    );

    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "countPluralOffset1Exact" },
      { type: "variable-reference", name: "countPluralOffset1" },
    ]);

    const matches = parsed.variants.map((variant) => variant.matches ?? []);
    expect(matches).toEqual(
      expect.arrayContaining([
        [
          {
            type: "literal-match",
            key: "countPluralOffset1Exact",
            value: "0",
          },
          { type: "catchall-match", key: "countPluralOffset1" },
        ],
        [
          { type: "catchall-match", key: "countPluralOffset1Exact" },
          { type: "literal-match", key: "countPluralOffset1", value: "one" },
        ],
        [
          { type: "catchall-match", key: "countPluralOffset1Exact" },
          { type: "catchall-match", key: "countPluralOffset1" },
        ],
      ]),
    );

    const pattern = parsed.variants.find((variant) =>
      (variant.matches ?? []).some(
        (match: Match) =>
          match.type === "literal-match" && match.value === "one",
      ),
    )?.pattern as Pattern;

    // `#` displays count - offset, so the offset is kept on the expression
    expect(pattern).toEqual([
      {
        type: "expression",
        arg: { type: "variable-reference", name: "count" },
        annotation: {
          type: "function-reference",
          name: "icu:pound",
          options: [{ name: "offset", value: { type: "literal", value: "1" } }],
        },
      },
      { type: "text", value: " item" },
    ]);
  });

  it("keeps the offset of the innermost plural on #", () => {
    const pounds = (messageSource: string) =>
      parseMessage({ ...baseArgs, messageSource }).variants.flatMap((variant) =>
        (variant.pattern ?? []).flatMap((part) =>
          part.type === "expression" &&
          part.annotation?.name === "icu:pound" &&
          part.arg.type === "variable-reference"
            ? [
                {
                  arg: part.arg.name,
                  options: part.annotation.options,
                },
              ]
            : [],
        ),
      );
    const offset = (value: string) => [
      { name: "offset", value: { type: "literal", value } },
    ];

    // no offset: no options, as before
    expect(pounds("{count, plural, one {# item} other {# items}}")).toEqual([
      { arg: "count", options: [] },
      { arg: "count", options: [] },
    ]);
    // offset:0 is no offset
    expect(pounds("{count, plural, offset:0 other {# items}}")).toEqual([
      { arg: "count", options: [] },
    ]);
    // a select inside the plural keeps the plural's offset
    expect(
      pounds(
        "{count, plural, offset:1 other {{gender, select, male {He and # others} other {They and # others}}}}",
      ),
    ).toEqual([
      { arg: "count", options: offset("1") },
      { arg: "count", options: offset("1") },
    ]);
    // a nested plural on another argument has its own offset
    expect(
      pounds(
        "{count, plural, offset:2 other {# and {guests, plural, other {# guests}}}}",
      ),
    ).toEqual([
      { arg: "count", options: offset("2") },
      { arg: "guests", options: [] },
    ]);
  });

  it("parses selectordinal", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    });

    expect(parsed.declarations).toEqual(
      expect.arrayContaining([
        { type: "input-variable", name: "place" },
        {
          type: "local-variable",
          name: "placeOrdinal",
          value: {
            type: "expression",
            arg: { type: "variable-reference", name: "place" },
            annotation: {
              type: "function-reference",
              name: "plural",
              options: [
                { name: "type", value: { type: "literal", value: "ordinal" } },
              ],
            },
          },
        },
      ] satisfies Declaration[]),
    );
  });

  it("orders exact plural cases before category and other cases", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{item, plural, one {one item} other {other items} =0 {no items}}",
    });

    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "itemPluralExact" },
      { type: "variable-reference", name: "itemPlural" },
    ]);

    expect(parsed.variants.map((variant) => variant.matches ?? [])).toEqual([
      [
        { type: "literal-match", key: "itemPluralExact", value: "0" },
        { type: "catchall-match", key: "itemPlural" },
      ],
      [
        { type: "catchall-match", key: "itemPluralExact" },
        { type: "literal-match", key: "itemPlural", value: "one" },
      ],
      [
        { type: "catchall-match", key: "itemPluralExact" },
        { type: "catchall-match", key: "itemPlural" },
      ],
    ]);
  });

  it("shares exact plural selectors across nested branches", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{gender, select, male {{n, plural, one {one} other {many}}} female {{n, plural, =0 {zero} other {many}}} other {fallback}}",
    });

    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "gender" },
      { type: "variable-reference", name: "nPluralExact" },
      { type: "variable-reference", name: "nPlural" },
    ]);

    expect(parsed.variants.map((variant) => variant.matches ?? [])).toEqual([
      [
        { type: "literal-match", key: "gender", value: "male" },
        { type: "catchall-match", key: "nPluralExact" },
        { type: "literal-match", key: "nPlural", value: "one" },
      ],
      [
        { type: "literal-match", key: "gender", value: "male" },
        { type: "catchall-match", key: "nPluralExact" },
        { type: "catchall-match", key: "nPlural" },
      ],
      [
        { type: "literal-match", key: "gender", value: "female" },
        { type: "literal-match", key: "nPluralExact", value: "0" },
        { type: "catchall-match", key: "nPlural" },
      ],
      [
        { type: "literal-match", key: "gender", value: "female" },
        { type: "catchall-match", key: "nPluralExact" },
        { type: "catchall-match", key: "nPlural" },
      ],
      [{ type: "catchall-match", key: "gender" }],
    ]);
  });

  it("avoids local variable name collisions with input variables", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "{countPlural} {count, plural, one {one} other {other}}",
    });

    expect(parsed.declarations).toEqual(
      expect.arrayContaining([
        { type: "input-variable", name: "countPlural" },
        expect.objectContaining({
          type: "local-variable",
          name: "countPlural1",
        }),
      ] satisfies Declaration[]),
    );
    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "countPlural1" },
    ]);
  });

  it("parses function arguments with style", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "The time is {when, time, short}.",
    });

    const pattern = parsed.variants[0]?.pattern as Pattern;
    expect(pattern[1]).toEqual({
      type: "expression",
      arg: { type: "variable-reference", name: "when" },
      annotation: {
        type: "function-reference",
        name: "time",
        options: [
          { name: "style", value: { type: "literal", value: "short" } },
        ],
      },
    });
  });

  it("parses nested selects", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{season, select, spring {{day, select, sunny {Sun} other {Cloud}}} other {Any}}",
    });

    expect(parsed.selectors).toEqual([
      { type: "variable-reference", name: "season" },
      { type: "variable-reference", name: "day" },
    ]);
  });

  it("gives plurals nested on the same argument separate selectors", () => {
    // a shared selector would merge the cases of both plurals
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{n, plural, one {a} other {{n, plural, one {b} other {c}}}}",
    });

    expect(parsed.selectors.map((selector) => selector.name)).toEqual([
      "nPlural",
      "nPlural1",
    ]);
    expect(
      parsed.variants.map((variant) => [variant.matches, variant.pattern]),
    ).toEqual([
      [
        [{ type: "literal-match", key: "nPlural", value: "one" }],
        [{ type: "text", value: "a" }],
      ],
      [
        [
          { type: "catchall-match", key: "nPlural" },
          { type: "literal-match", key: "nPlural1", value: "one" },
        ],
        [{ type: "text", value: "b" }],
      ],
      [
        [
          { type: "catchall-match", key: "nPlural" },
          { type: "catchall-match", key: "nPlural1" },
        ],
        [{ type: "text", value: "c" }],
      ],
    ]);
  });

  it("merges selects on the same argument", () => {
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{g, select, a {A} other {O}} {g, select, a {A2} b {B2} other {O2}}",
    });

    expect(parsed.selectors.map((selector) => selector.name)).toEqual(["g"]);
    expect(
      parsed.variants.map((variant) => [
        variant.matches,
        variant.pattern
          ?.map((part) => (part.type === "text" ? part.value : ""))
          .join(""),
      ]),
    ).toEqual([
      [[{ type: "literal-match", key: "g", value: "a" }], "A A2"],
      [[{ type: "literal-match", key: "g", value: "b" }], "O B2"],
      [[{ type: "catchall-match", key: "g" }], "O O2"],
    ]);
  });

  it("orders a selector after the selectors it is nested in", () => {
    // `h` occurs first, but is nested in `nPlural1` in another case
    const parsed = parseMessage({
      ...baseArgs,
      messageSource:
        "{n, plural, =0 {{h, select, other {x}}} =1 {{n, plural, =1 {y} other {{h, select, b {B} other {z}}}}} other {w}}",
    });

    expect(parsed.selectors.map((selector) => selector.name)).toEqual([
      "nPluralExact",
      "nPlural",
      "nPlural1Exact",
      "nPlural1",
      "h",
    ]);
  });

  it("parses a plural that only applies an offset as #", () => {
    // the export writes a # with an offset outside of its plural so
    const parsed = parseMessage({
      ...baseArgs,
      messageSource: "You and {n, plural, offset:1 other {#}} others",
    });

    expect(parsed.selectors).toEqual([]);
    expect(parsed.variants[0]?.pattern?.[1]).toEqual({
      type: "expression",
      arg: { type: "variable-reference", name: "n" },
      annotation: {
        type: "function-reference",
        name: "icu:pound",
        options: [{ name: "offset", value: { type: "literal", value: "1" } }],
      },
    });
  });
});
