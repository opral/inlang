/**
 * vendored from https://github.com/ehmicky/guess-json-indent
 *
 * Guesses the indentation of a JSON string. Returns the number of spaces, the
 * indentation string (e.g. a tab), `0` for JSON without indentation, or
 * `undefined` if it can't be guessed.
 */
export const guessJsonIndent = (jsonString: string) => {
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
