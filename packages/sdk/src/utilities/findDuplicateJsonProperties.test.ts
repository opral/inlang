import { describe, expect, test } from "vitest";
import {
	findDuplicateJsonProperties,
	stringifyJsonKeepingEntries,
} from "./detectJsonFormatting.js";

describe("findDuplicateJsonProperties", () => {
	test.each([
		["arrays", "[", "]"],
		["objects", '{"child":', "}"],
		["mixed containers", '{"child":[', "]}"],
	])(
		"handles deep %s without consuming the call stack",
		(_name, open, close) => {
			const prefix = open.repeat(6000);
			const suffix = close.repeat(6000);
			const source = prefix + String.raw`{"x":1,"\u0078":2,"x":3}` + suffix;
			expect(() => JSON.parse(source)).not.toThrow();
			expect(findDuplicateJsonProperties(source)).toEqual([
				{
					key: "x",
					firstOffset: prefix.length + 1,
					duplicateOffset: prefix.length + 7,
				},
				{
					key: "x",
					firstOffset: prefix.length + 1,
					duplicateOffset: prefix.length + 18,
				},
			]);
		}
	);

	test("restores sibling scopes and source order after deeply nested overwritten values", () => {
		const deep = "[".repeat(6000) + '{"x":1,"x":2}' + "]".repeat(6000);
		const prefix = '{"😀":0,"x":';
		const suffix = ',"x":{"x":3,"x":4},"sibling":{"x":5}}';
		const source = prefix + deep + suffix;
		expect(() => JSON.parse(source)).not.toThrow();
		expect(findDuplicateJsonProperties(source)).toEqual([
			{
				key: "x",
				firstOffset: prefix.length + 6001,
				duplicateOffset: prefix.length + 6007,
			},
			{
				key: "x",
				firstOffset: 8,
				duplicateOffset: prefix.length + deep.length + 1,
			},
			{
				key: "x",
				firstOffset: prefix.length + deep.length + 6,
				duplicateOffset: prefix.length + deep.length + 12,
			},
		]);
	});

	test("validates malformed deep JSON before reporting any duplicates", () => {
		const source = "[".repeat(6000) + '{"x":1,"x":2}' + "]".repeat(5999);
		let nativeError: unknown;
		try {
			JSON.parse(source);
		} catch (error) {
			nativeError = error;
		}
		expect(nativeError).toBeInstanceOf(SyntaxError);
		expect(() => findDuplicateJsonProperties(source)).toThrow(SyntaxError);
		expect(() => findDuplicateJsonProperties(source)).toThrow(
			nativeError as SyntaxError
		);
	});

	test("reports every repeat against the first spelling before parse loses it", () => {
		const source = String.raw`{"hello":"first","\u0068ello":"second","hello":"last"}`;
		expect(JSON.parse(source)).toEqual({ hello: "last" });
		expect(findDuplicateJsonProperties(source)).toEqual([
			{ key: "hello", firstOffset: 1, duplicateOffset: 17 },
			{ key: "hello", firstOffset: 1, duplicateOffset: 39 },
		]);
	});

	test("walks overwritten objects, nested objects and objects in arrays", () => {
		const source = '{"a":{"x":1,"x":2},"a":[{"y":1,"y":2},{"y":3,"y":4}]}';
		expect(findDuplicateJsonProperties(source)).toEqual([
			{ key: "x", firstOffset: 6, duplicateOffset: 12 },
			{ key: "a", firstOffset: 1, duplicateOffset: 19 },
			{ key: "y", firstOffset: 25, duplicateOffset: 31 },
			{ key: "y", firstOffset: 39, duplicateOffset: 45 },
		]);
	});

	test("walks nested arrays without mixing the keys of their objects", () => {
		const source = '[[{"x":1,"x":2}],[{"x":3}]]';
		expect(findDuplicateJsonProperties(source)).toEqual([
			{ key: "x", firstOffset: 3, duplicateOffset: 9 },
		]);
	});

	test.each([
		[String.raw`"a\"b"`, '"a\\u0022b"', 'a"b'],
		['"a\\\\b"', '"a\\u005cb"', "a\\b"],
		['"😀"', '"\\ud83d\\ude00"', "😀"],
		['"\\ud800"', '"\\uD800"', "\ud800"],
		['""', '""', ""],
		['"__proto__"', '"__proto__"', "__proto__"],
		['"constructor"', '"constructor"', "constructor"],
		['"$schema"', '"\\u0024schema"', "$schema"],
	])("compares decoded keys %s and %s", (first, second, key) => {
		const source = `{${first}:0,${second}:1}`;
		expect(findDuplicateJsonProperties(source)).toEqual([
			{ key, firstOffset: 1, duplicateOffset: first.length + 4 },
		]);
	});

	test("uses zero-based UTF-16 offsets including whitespace and astral characters", () => {
		const source = ' \r\n{ "😀": 1,\r\n "😀": 2 }\n';
		expect(findDuplicateJsonProperties(source)).toEqual([
			{
				key: "😀",
				firstOffset: source.indexOf('"'),
				duplicateOffset: source.lastIndexOf('"😀"'),
			},
		]);
	});

	test.each([
		'{"a":{"x":1},"b":{"x":2},"x":3}',
		'[{"x":1},{"x":2}]',
		'{"a.b":1,"a":{"b":2}}',
		'{"é":1,"e\\u0301":2}',
		String.raw`{"$schema":"https://example.com/schema.json","text":"{\"a\":1,\"a\":2} [] , : \\"}`,
		' { "values": [0,-1.2e+3,true,false,null,[],{}] } ',
		'"hello"',
		"0",
		"true",
		"false",
		"null",
		"[]",
		"{}",
	])(
		"does not confuse independent objects, strings or scalar values: %s",
		(source) => {
			expect(findDuplicateJsonProperties(source)).toEqual([]);
		}
	);

	test.each([
		"",
		"{",
		'{"a":1,"a":2,}',
		'{"a":1,"a":2} trailing',
		'{"a":1 /* comment */}',
		'{"a":1,// comment\n"a":2}',
		'{"a":01}',
		'{"a":undefined}',
		String.raw`{"\uZZZZ":1}`,
		'{"a":"unterminated}',
		"[1,]",
		'\uFEFF{"a":1}',
	])("keeps the native SyntaxError for invalid JSON: %s", (source) => {
		let nativeError: unknown;
		try {
			JSON.parse(source);
		} catch (error) {
			nativeError = error;
		}
		expect(nativeError).toBeInstanceOf(SyntaxError);
		expect(() => findDuplicateJsonProperties(source)).toThrow(
			nativeError as SyntaxError
		);
	});

	test("does not retain keys between calls", () => {
		expect(findDuplicateJsonProperties('{"x":1,"x":2}')).toHaveLength(1);
		expect(findDuplicateJsonProperties('{"x":3}')).toEqual([]);
	});
});

describe("format preservation still declines duplicate properties", () => {
	test.each([
		'{"a":1,"a":2}',
		String.raw`{"a":1,"\u0061":2}`,
		'{"nested":{"a":1,"a":2}}',
		'{"array":[{"a":1,"a":2}]}',
	])("does not preserve an ambiguous source: %s", (previous) => {
		expect(
			stringifyJsonKeepingEntries({ previous, next: JSON.parse(previous) })
		).toBeUndefined();
	});

	test("preserves a unique source including its BOM, escaping and whitespace", () => {
		const previous =
			'\uFEFF{\r\n  "\\u0061" : [{ "x" : 1 }, { "x" : 2 }]\r\n}\r\n';
		expect(
			stringifyJsonKeepingEntries({
				previous,
				next: { a: [{ x: 1 }, { x: 2 }] },
			})
		).toBe(previous);
	});
});
