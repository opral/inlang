import { Text, VariableReference, type VariantRow } from "@inlang/sdk";

type PlaceholderMetadata = Record<
  string,
  {
    leadingCharacter?: string;
    trailingCharacter?: string;
  }
>;

const escapeStart = `<span class="notranslate">`;
const escapeEnd = "</span>";

export function findMatchingVariant(
  variants: VariantRow[],
  matches: VariantRow["matches"],
): VariantRow | undefined {
  if (matches.length === 0) {
    return variants.find((variant) => variant.matches.length === 0);
  }

  return variants.find((variant) => {
    if (variant.matches.length !== matches.length) {
      return false;
    }

    return matches.every((sourceMatch) =>
      variant.matches.some((targetMatch) => {
        if (
          targetMatch.key !== sourceMatch.key ||
          targetMatch.type !== sourceMatch.type
        ) {
          return false;
        }

        if (
          sourceMatch.type === "literal-match" &&
          targetMatch.type === "literal-match"
        ) {
          return sourceMatch.value === targetMatch.value;
        }

        return true;
      }),
    );
  });
}

export function serializePattern(
  pattern: VariantRow["pattern"],
  placeholderMetadata: PlaceholderMetadata,
) {
  let result = "";
  for (const [index, element] of pattern.entries()) {
    if (element.type === "text") {
      result += element.value
        .replaceAll("\r", "<inlang-CarriageReturn>")
        .replaceAll("\n", "<inlang-LineFeed>");
    } else {
      // @ts-expect-error placeholder metadata is keyed by name at runtime
      placeholderMetadata[element.name] = {
        leadingCharacter: result.at(-1) ?? undefined,
        trailingCharacter:
          pattern[index + 1]?.type === "text"
            ? (pattern[index + 1] as Text).value[0]
            : undefined,
      };
      result += `${escapeStart}${JSON.stringify(element)}${escapeEnd}`;
    }
  }
  return result;
}

export function deserializePattern(text: string): VariantRow["pattern"] {
  const result: VariantRow["pattern"] = [];
  const unescapedText = text
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("<inlang-CarriageReturn>", "\r")
    .replaceAll("<inlang-LineFeed> ", "\n")
    .replaceAll("<inlang-LineFeed>", "\n");
  let index = 0;
  while (index < unescapedText.length) {
    const start = unescapedText.indexOf(escapeStart, index);
    if (start === -1) {
      result.push({ type: "text", value: unescapedText.slice(index) });
      break;
    } else if (index < start) {
      result.push({ type: "text", value: unescapedText.slice(index, start) });
      index = start;
      continue;
    }
    const end = unescapedText.indexOf(escapeEnd, start);
    if (end === -1) {
      result.push({ type: "text", value: unescapedText.slice(index) });
      break;
    }

    const expressionAsText = unescapedText.slice(
      start + escapeStart.length,
      end,
    );
    const expression = JSON.parse(expressionAsText) as VariableReference;

    // @ts-expect-error placeholder metadata is preserved at runtime
    result.push(expression);
    index = end + escapeEnd.length;
  }
  return result;
}
