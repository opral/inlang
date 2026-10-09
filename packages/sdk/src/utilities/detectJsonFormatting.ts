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

/**
 * vendored from https://github.com/ehmicky/guess-json-indent
 */
// Guess the indentation of a JSON string
const guessJsonIndent = (jsonString: string) => {
	const firstIndex = skipWhitespaces(jsonString, 0);

	if (
		firstIndex === undefined ||
		!isJsonObjectOrArray(jsonString[firstIndex])
	) {
		return;
	}

	const secondIndex = skipWhitespaces(jsonString, firstIndex + 1);

	if (secondIndex === undefined) {
		return;
	}

	return getIndent(jsonString, firstIndex, secondIndex);
};

// Whitespaces are ignored before|between|after tokens in JSON.
// Uses imperative logic for performance.
const skipWhitespaces = (jsonString: string | any[], startIndex: number) => {
	for (let index = startIndex; index < jsonString.length; index += 1) {
		const character = jsonString[index];

		if (!isJsonWhitespace(character)) {
			return index;
		}
	}
	return;
};

// JSON defines only those are valid whitespaces
const isJsonWhitespace = (character: string) =>
	character === " " ||
	character === "\t" ||
	character === "\n" ||
	character === "\r";

// If the top-level value is another type than an object or an array, there is
// no possible indentation
const isJsonObjectOrArray = (character: string | undefined) =>
	character === "{" || character === "[";

// Uses imperative logic for performance
// @ts-expect-error - not all code paths return a value
const getIndent = (
	jsonString: string | any[],
	firstIndex: number,
	secondIndex: number
) => {
	let indent;

	for (let index = secondIndex - 1; index > firstIndex; index -= 1) {
		const character = jsonString[index];

		if (character === "\r") {
			return;
		}

		if (character === "\n") {
			return normalizeIndent(indent);
		}

		if (indent === undefined) {
			indent = character;
		} else if (indent[0] === character) {
			indent += character;
		} else {
			return;
		}
	}
};

const normalizeIndent = (indent: string | any[] | undefined) => {
	if (indent === undefined) {
		return 0;
	}

	return indent[0] === " " ? indent.length : indent;
};
