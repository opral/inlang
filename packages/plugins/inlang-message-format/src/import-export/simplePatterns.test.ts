import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";

const load = (values: Record<string, string>[]) =>
	importFiles({
		files: values.map((value, index) => ({
			locale: index === 0 ? "en" : "de",
			content: new TextEncoder().encode(JSON.stringify(value)),
		})),
		settings: { baseLocale: "en", locales: ["en", "de"], modules: [] },
	});

test("simple strings retain chunk boundaries, input order, empty names and locale merges", async () => {
	const result = await load([
		{
			repeated: "Hi {b}{a}{b}!",
			empty: "",
			odd: "{} {user name} {__proto__}",
			braces: "} {a} tail",
		},
		{ repeated: "{c}{a}" },
	]);
	expect(
		result.bundles.find((bundle) => bundle.id === "repeated")?.declarations
	).toEqual(["b", "a", "c"].map((name) => ({ type: "input-variable", name })));
	expect(result.variants[0]?.pattern).toEqual([
		{ type: "text", value: "Hi " },
		...["b", "a", "b"].map((name) => ({
			type: "expression",
			arg: { type: "variable-reference", name },
		})),
		{ type: "text", value: "!" },
	]);
	expect(result.variants[1]?.pattern).toEqual([]);
	expect(
		result.bundles
			.find((bundle) => bundle.id === "odd")
			?.declarations?.map((declaration) => declaration.name)
	).toEqual(["", "user name", "__proto__"]);
	expect(result.variants[3]?.pattern).toEqual([
		{ type: "text", value: "} " },
		{ type: "expression", arg: { type: "variable-reference", name: "a" } },
		{ type: "text", value: " tail" },
	]);
});

test.each([
	[
		String.raw`x \{literal\} {name}`,
		[
			{ type: "text", value: "x {literal} " },
			{ type: "expression", arg: { type: "variable-reference", name: "name" } },
		],
	],
	["unfinished {name", [{ type: "text", value: "unfinished {name" }]],
	[
		"{outer{inner}",
		[
			{
				type: "expression",
				arg: { type: "variable-reference", name: "outer{inner" },
			},
		],
	],
	[
		"{user:name}",
		[
			{
				type: "expression",
				arg: { type: "variable-reference", name: "user:name" },
			},
		],
	],
	[
		"{amount: number}",
		[
			{
				type: "expression",
				arg: { type: "variable-reference", name: "amount" },
				annotation: { type: "function-reference", name: "number", options: [] },
			},
		],
	],
	[
		"{#link}x{/link}",
		[
			{ type: "markup-start", name: "link" },
			{ type: "text", value: "x" },
			{ type: "markup-end", name: "link" },
		],
	],
] as const)(
	"complex boundary preserves parser semantics for %s",
	async (value, expected) => {
		const result = await load([{ boundary: value }]);
		expect(result.variants[0]?.pattern).toEqual(expected);
	}
);

test("invalid markup still rejects after an ordinary placeholder", async () => {
	await expect(load([{ broken: "{name} {#}" }])).rejects.toThrow(
		"Invalid markup placeholder"
	);
});

test("flat string catalogs retain own-key order, dotted collisions and reserved keys", async () => {
	const values = Object.fromEntries([
		["$schema", "https://example.test/schema"],
		["a", "Parent"],
		["a.b", "Child {name}"],
		["__proto__", "Prototype"],
		["constructor", "Constructor"],
		["2", "Numeric"],
	]);
	const result = await load([values]);
	expect(result.bundles.map((bundle) => bundle.id)).toEqual(
		Object.keys(values).filter((key) => key !== "$schema")
	);
	expect(result.messages.map((message) => message.bundleId)).toEqual(
		result.bundles.map((bundle) => bundle.id)
	);
	expect(result.variants).toHaveLength(5);
});
