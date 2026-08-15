import { test, expect } from "vitest";
import { fromMessageV1 } from "./fromMessageV1.js";
import { Value } from "@sinclair/typebox/value";
import { MessageV1 } from "./schemaV1.js";
import type { BundleNested } from "../../database/schema.js";

const messageV1: MessageV1 = {
	id: "hello_world",
	alias: {},
	variants: [
		{
			languageTag: "en",
			match: [],
			pattern: [
				{
					type: "Text",
					value: "Hello World!",
				},
			],
		},
		{
			languageTag: "de",
			match: [],
			pattern: [
				{
					type: "Text",
					value: "Hallo Welt!",
				},
			],
		},
	],
	selectors: [],
};

const bundle: BundleNested = {
	id: "hello_world",
	declarations: [],
	messages: [
		{
			bundleId: "hello_world",
			id: "hello_world" + "_en",
			locale: "en",
			selectors: [],
			variants: [
				{
					id: "hello_world" + "_en_1",
					matches: [],
					messageId: "hello_world" + "_en",
					pattern: [
						{
							type: "text",
							value: "Hello World!",
						},
					],
				},
			],
		},
		{
			bundleId: "hello_world",
			id: "hello_world" + "_de",
			locale: "de",
			selectors: [],
			variants: [
				{
					id: "hello_world" + "_de_1",
					matches: [],
					messageId: "hello_world" + "_de",
					pattern: [
						{
							type: "text",
							value: "Hallo Welt!",
						},
					],
				},
			],
		},
	],
};

test("fromMessageV1", () => {
	expect(Value.Check(MessageV1, messageV1)).toBe(true);
	const nestedBundle: unknown = fromMessageV1(messageV1);

	expect(nestedBundle).toEqual(bundle);
});

test("preserves selectors, matches, and variable declarations", () => {
	const converted = fromMessageV1({
		id: "welcome",
		alias: {},
		selectors: [{ type: "VariableReference", name: "audience" }],
		variants: [
			{
				languageTag: "en",
				match: ["admin"],
				pattern: [
					{ type: "Text", value: "Hello " },
					{ type: "VariableReference", name: "name" },
				],
			},
			{
				languageTag: "en",
				match: ["*"],
				pattern: [{ type: "Text", value: "Hello" }],
			},
			{
				languageTag: "de",
				match: ["*"],
				pattern: [{ type: "Text", value: "Hallo" }],
			},
		],
	});

	expect(converted.declarations).toEqual([
		{ type: "input-variable", name: "audience" },
		{ type: "input-variable", name: "name" },
	]);
	expect(converted.messages.map((message) => message.selectors)).toEqual([
		[{ type: "variable-reference", name: "audience" }],
		[{ type: "variable-reference", name: "audience" }],
	]);
	expect(
		converted.messages[0]?.variants.map((variant) => variant.matches)
	).toEqual([
		[{ type: "literal-match", key: "audience", value: "admin" }],
		[{ type: "catchall-match", key: "audience" }],
	]);
});

test("rejects variants whose matches do not align with selectors", () => {
	expect(() =>
		fromMessageV1({
			id: "invalid",
			alias: {},
			selectors: [{ type: "VariableReference", name: "audience" }],
			variants: [{ languageTag: "en", match: [], pattern: [] }],
		})
	).toThrow("has 0 matches for 1 selectors");
});
