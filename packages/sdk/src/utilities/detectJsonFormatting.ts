import { guessJsonIndent } from "./guessJsonIndent.js";

/**
 * Detects the formatting of a JSON file and returns a function
 * that can be used to stringify JSON with the same formatting.
 *
 * @example
 *   const file = await fs.readFile("./messages.json", { encoding: "utf-8" })
 *   const stringify = detectJsonFormatting(file)
 *   const newFile = stringify(json)
 */
export const detectJsonFormatting = (
	file: string
): ((
	value: Parameters<typeof JSON.stringify>[0],
	replacer?: Parameters<typeof JSON.stringify>[1]
	// space is provided by the function
) => string) => {
	const endsWithNewLine = file.endsWith("\n");
	const spacing = guessJsonIndent(file);

	return (value, replacer) =>
		JSON.stringify(value, replacer, spacing as any) +
		(endsWithNewLine ? "\n" : "");
};
