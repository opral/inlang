/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Using parsimmon because:
 *
 * 1. Chevrotain is too complicated.
 * 2. TypeScript's compiler doesn't work in the browser.
 * 3. TypeScripts compiler
 */

import Parsimmon from "parsimmon";

const mImportPattern = /import\s+(?:\*\s+as\s+m|\{\s*m\s*\})/;

const createParser = (sourceCode: string) => {
  return Parsimmon.createLanguage({
    entry: (r) => {
      return Parsimmon.alt(r.findMessage!, Parsimmon.any)
        .many()
        .map((matches) => matches.flatMap((match) => match))
        .map((matches) =>
          matches
            .filter((item) => typeof item === "object")
            .flat()
            .filter((item) => item !== null)
        );
    },

    findReference: function (r) {
      return Parsimmon.seq(
        Parsimmon.regex(/(import \* as m)|(import { m })/),
        r.findMessage!.many()
      );
    },

    dotNotation: () => {
      return Parsimmon.seqMap(
        Parsimmon.string("."),
        Parsimmon.index, // Capture start position
        Parsimmon.regex(/\w+/), // Match the function name
        Parsimmon.index, // Capture end position of function name
        (_, start, messageId, end) => {
          return {
            messageId,
            start,
            end,
          };
        }
      );
    },

    doubleQuote: () => {
      return Parsimmon.seqMap(
        Parsimmon.string('"'),
        Parsimmon.index, // Capture start position
        Parsimmon.regex(/[\w.]+/), // Match the function name
        Parsimmon.string('"'),
        (_, start, messageId) => {
          return {
            messageId,
            start,
          };
        }
      );
    },

    singleQuote: () => {
      return Parsimmon.seqMap(
        Parsimmon.string("'"),
        Parsimmon.index, // Capture start position
        Parsimmon.regex(/[\w.]+/), // Match the function name
        Parsimmon.string("'"),
        (_, start, messageId) => {
          return {
            messageId,
            start,
          };
        }
      );
    },

    bracketNotation: (r) => {
      return Parsimmon.seqMap(
        Parsimmon.string("["),
        Parsimmon.alt(r.doubleQuote!, r.singleQuote!),
        Parsimmon.string("]"),
        Parsimmon.index, // Capture end position
        (_, quote, __, end) => {
          return {
            messageId: quote.messageId,
            start: quote.start,
            end: end,
          };
        }
      );
    },

    findMessage: (r) => {
      return Parsimmon.seqMap(
        Parsimmon.index, // capture start offset
        Parsimmon.regex(/.*?m/s), // find earliest m from current position
        Parsimmon.alt(r.dotNotation!, r.bracketNotation!).or(
          Parsimmon.succeed(null)
        ),
        Parsimmon.regex(/\((?:[^()]|\([^()]*\))*\)/).or(Parsimmon.succeed("")), // function arguments or empty string
        (startIndex, match, notation, args) => {
          const mOffset = startIndex.offset + match.length - 1;
          const prevChar =
            mOffset > 0 ? sourceCode[mOffset - 1] ?? "" : "";
          const hasValidPrefix =
            mOffset === 0 || !/[a-zA-Z0-9/]/.test(prevChar);

          if (!hasValidPrefix) {
            return null;
          }
          // false positive (m not followed by dot or bracket notation)
          if (notation === null) {
            return null;
          }
          return {
            messageId: `${notation.messageId}`,
            position: {
              start: {
                line: notation.start.line,
                character: notation.start.column,
              },
              end: {
                line: notation.end.line,
                character: notation.end.column + args.length, // adjust for arguments length
              },
            },
          };
        }
      );
    },
  });
};

// Parse the expression
export function parse(sourceCode: string) {
  try {
    if (!sourceCode || !mImportPattern.test(sourceCode)) {
      return [];
    }
    const parser = createParser(sourceCode);
    return parser.entry!.tryParse(sourceCode);
  } catch (e) {
    return [];
  }
}
