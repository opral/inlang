import type { Bundle, Message, Variant } from "@inlang/sdk";
import { expect, test } from "vitest";
import { exportFiles } from "./exportFiles.js";

test("exporting does not mutate declaration or match ordering", async () => {
	const bundle: Bundle = {
		id: "example",
		declarations: [
			{ type: "input-variable", name: "zebra" },
			{ type: "input-variable", name: "alpha" },
		],
	};
	const message: Message = {
		id: "example-en",
		bundleId: bundle.id,
		locale: "en",
		selectors: [
			{ type: "variable-reference", name: "zebra" },
			{ type: "variable-reference", name: "alpha" },
		],
	};
	const variant: Variant = {
		id: "example-en-variant",
		messageId: message.id,
		matches: [
			{ type: "literal-match", key: "zebra", value: "yes" },
			{ type: "catchall-match", key: "alpha" },
		],
		pattern: [{ type: "text", value: "Example" }],
	};
	const originalBundle = structuredClone(bundle);
	const originalMessage = structuredClone(message);
	const originalVariant = structuredClone(variant);

	const exported = await runExportFiles(bundle, message, variant);

	expect(exported.example[0]).toMatchObject({
		declarations: ["input alpha", "input zebra"],
		selectors: ["alpha", "zebra"],
		match: { "alpha=*, zebra=yes": "Example" },
	});
	expect(bundle).toStrictEqual(originalBundle);
	expect(message).toStrictEqual(originalMessage);
	expect(variant).toStrictEqual(originalVariant);
});

test("inferring catchall matches does not mutate an empty match array", async () => {
	const bundle: Bundle = {
		id: "example",
		declarations: [
			{ type: "input-variable", name: "count" },
			{
				type: "local-variable",
				name: "formatted",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
			},
		],
	};
	const message: Message = {
		id: "example-en",
		bundleId: bundle.id,
		locale: "en",
		selectors: [],
	};
	const variant: Variant = {
		id: "example-en-variant",
		messageId: message.id,
		matches: [],
		pattern: [
			{
				type: "expression",
				arg: { type: "variable-reference", name: "formatted" },
			},
		],
	};

	const exported = await runExportFiles(bundle, message, variant);

	expect(exported.example[0].match).toStrictEqual({
		"formatted=*": "{formatted}",
	});
	expect(variant.matches).toStrictEqual([]);
});

test("local declarations retain their dependency-safe ordering", async () => {
	const bundle: Bundle = {
		id: "example",
		declarations: [
			{
				type: "local-variable",
				name: "zebra",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
			},
			{
				type: "local-variable",
				name: "alpha",
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: "zebra" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [],
					},
				},
			},
			{ type: "input-variable", name: "count" },
		],
	};
	const message: Message = {
		id: "example-en",
		bundleId: bundle.id,
		locale: "en",
		selectors: [],
	};
	const variant: Variant = {
		id: "example-en-variant",
		messageId: message.id,
		matches: [],
		pattern: [
			{
				type: "expression",
				arg: { type: "variable-reference", name: "alpha" },
			},
		],
	};
	const originalDeclarations = structuredClone(bundle.declarations);

	const exported = await runExportFiles(bundle, message, variant);

	expect(exported.example[0].declarations).toStrictEqual([
		"input count",
		"local zebra = count: number",
		"local alpha = zebra: number",
	]);
	expect(bundle.declarations).toStrictEqual(originalDeclarations);
});

async function runExportFiles(
	bundle: Bundle,
	message: Message,
	variant: Variant
) {
	const exported = await exportFiles({
		settings: {} as any,
		bundles: [bundle],
		messages: [message],
		variants: [variant],
	});

	return JSON.parse(new TextDecoder().decode(exported[0]?.content));
}
