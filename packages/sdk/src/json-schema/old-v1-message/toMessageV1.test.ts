import { test, expect } from "vitest";
import { toMessageV1 } from "./toMessageV1.js";
import { Value } from "@sinclair/typebox/value";
import { MessageV1 } from "./schemaV1.js";
import type { BundleNested } from "../../database/schema.js";

test("toMessageV1", () => {
	const message: unknown = toMessageV1(bundle);
	expect(Value.Check(MessageV1, message)).toBe(true);

	expect(message).toStrictEqual(messageV1);
});

test("throws when message contains markup placeholders", () => {
	const markupBundle: BundleNested = {
		id: "hello_world",
		declarations: [],
		messages: [
			{
				bundleId: "hello_world",
				id: "hello_world_en",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "hello_world_en_1",
						matches: [],
						messageId: "hello_world_en",
						pattern: [
							{
								type: "markup-start",
								name: "b",
								options: [
									{
										name: "kind",
										value: { type: "literal", value: "strong" },
									},
								],
								attributes: [{ name: "track", value: true }],
							},
							{ type: "text", value: "Hello World!" },
							{
								type: "markup-end",
								name: "b",
								attributes: [{ name: "track", value: true }],
							},
						],
					},
				],
			},
		],
	};

	expect(() => toMessageV1(markupBundle)).toThrow(
		"Markup placeholders are not supported in MessageV1 conversion"
	);
});

test("serializes nested selectors and matches", () => {
	const serialized = toMessageV1({
		id: "welcome",
		declarations: [{ type: "input-variable", name: "audience" }],
		messages: [
			{
				id: "welcome_en",
				bundleId: "welcome",
				locale: "en",
				selectors: [{ type: "variable-reference", name: "audience" }],
				variants: [
					{
						id: "welcome_en_admin",
						messageId: "welcome_en",
						matches: [
							{ type: "literal-match", key: "audience", value: "admin" },
						],
						pattern: [{ type: "text", value: "Welcome, admin" }],
					},
					{
						id: "welcome_en_other",
						messageId: "welcome_en",
						matches: [{ type: "catchall-match", key: "audience" }],
						pattern: [{ type: "text", value: "Welcome" }],
					},
				],
			},
		],
	});

	expect(serialized.selectors).toEqual([
		{ type: "VariableReference", name: "audience" },
	]);
	expect(serialized.variants.map((variant) => variant.match)).toEqual([
		["admin"],
		["*"],
	]);
});

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
