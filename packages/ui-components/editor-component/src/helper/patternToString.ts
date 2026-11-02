import type { Pattern } from "@inlang/sdk";

/**
 * Converts a pattern to plain preview text. Variable references retain their
 * `{name}` placeholders and literal expressions contribute their literal value.
 * Markup is omitted intentionally; this is not a source serializer.
 * @param props.pattern The pattern to convert to a string.
 * @returns The pattern as a string.
 *
 * @example
 * patternToString({ pattern: [{ value: "Hello" }, { type: "expression", arg: { type: "variable-reference", name: "name" } }] }) -> "Hello {name}"
 */

const patternToString = (props: { pattern: Pattern }): string => {
  if (!props.pattern) {
    return "";
  }
  return props.pattern
    .map((p) => {
      if ("value" in p) {
        return p.value;
      } else if (p.type === "expression") {
        return p.arg.type === "variable-reference"
          ? `{${p.arg.name}}`
          : p.arg.value;
      }
      return "";
    })
    .join("");
};

export default patternToString;
