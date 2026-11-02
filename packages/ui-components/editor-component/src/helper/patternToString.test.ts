import { describe, expect, it } from "vitest";
import patternToString from "./patternToString.js";
import type { Pattern } from "@inlang/sdk";

describe("patternToString", () => {
  it("Should transform pattern to string", () => {
    const pattern: Pattern = [
      {
        type: "text",
        value: "Hello, ",
      },
      {
        type: "expression",
        arg: {
          type: "variable-reference",
          name: "name",
        },
      },
      {
        type: "text",
        value: "!",
      },
    ];

    const text = patternToString({ pattern });

    const correspondingText = "Hello, {name}!";

    expect(text).toStrictEqual(correspondingText);
  });

  it("includes literal expressions in plain preview text while omitting markup", () => {
    const pattern: Pattern = [
      { type: "markup-start", name: "b" },
      { type: "expression", arg: { type: "literal", value: "literal {name}" } },
      { type: "markup-end", name: "b" },
      { type: "text", value: "\n" },
      {
        type: "expression",
        arg: { type: "literal", value: "42" },
        annotation: { type: "function-reference", name: "number", options: [] },
      },
      { type: "markup-standalone", name: "br" },
      { type: "text", value: " " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ];

    expect(patternToString({ pattern })).toBe("literal {name}\n42 {name}");
  });
});
