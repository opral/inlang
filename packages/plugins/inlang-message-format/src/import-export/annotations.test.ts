import { expect, test } from "vitest";
import type {
	Bundle,
	Declaration,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { importFiles } from "./importFiles.js";
import { exportFiles } from "./exportFiles.js";

// Pattern expressions keep their function annotation, written with the
// syntax of local declarations: `{count: icu:pound offset=1}`.

test("keeps the offset of ICU # imported by plugin-icu1 across export and import", async () => {
	// what `@inlang/plugin-icu1` imports for
	// `{count, plural, offset:1 one {You and # other} other {You and # others}}`
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "count" },
		{
			type: "local-variable",
			name: "countPluralOffset1",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: {
					type: "function-reference",
					name: "plural",
					options: [{ name: "offset", value: { type: "literal", value: "1" } }],
				},
			},
		},
	];
	const pound: Pattern[number] = {
		type: "expression",
		arg: { type: "variable-reference", name: "count" },
		annotation: {
			type: "function-reference",
			name: "icu:pound",
			options: [{ name: "offset", value: { type: "literal", value: "1" } }],
		},
	};
	const bundle: Bundle = { id: "guests", declarations };
	const message: Message = {
		id: "guests-en",
		bundleId: "guests",
		locale: "en",
		selectors: [{ type: "variable-reference", name: "countPluralOffset1" }],
	};
	const variants: Variant[] = [
		{
			id: "one",
			messageId: "guests-en",
			matches: [
				{ type: "literal-match", key: "countPluralOffset1", value: "one" },
			],
			pattern: [
				{ type: "text", value: "You and " },
				pound,
				{ type: "text", value: " other" },
			],
		},
		{
			id: "other",
			messageId: "guests-en",
			matches: [{ type: "catchall-match", key: "countPluralOffset1" }],
			pattern: [
				{ type: "text", value: "You and " },
				pound,
				{ type: "text", value: " others" },
			],
		},
	];

	const exported = await exportFiles({
		settings: {} as any,
		bundles: [bundle],
		messages: [message],
		variants,
	});
	const json = JSON.parse(new TextDecoder().decode(exported[0]!.content));
	expect(json.guests).toStrictEqual([
		{
			declarations: [
				"input count",
				"local countPluralOffset1 = count: plural offset=1",
			],
			selectors: ["countPluralOffset1"],
			match: {
				"countPluralOffset1=one": "You and {count: icu:pound offset=1} other",
				"countPluralOffset1=*": "You and {count: icu:pound offset=1} others",
			},
		},
	]);

	const imported = await importFiles({
		settings: {} as any,
		files: [{ locale: "en", content: exported[0]!.content }],
	});
	expect(imported.bundles).toStrictEqual([bundle]);
	expect(imported.messages[0]?.selectors).toStrictEqual(message.selectors);
	expect(
		imported.variants.map(({ matches, pattern }) => ({ matches, pattern }))
	).toStrictEqual(
		variants.map(({ matches, pattern }) => ({ matches, pattern }))
	);
});

test("keeps function annotations and their options on pattern expressions", async () => {
	const files = {
		price:
			"Total: {amount: number style=currency currency=$currency minimumFractionDigits=2}",
		date: "Due {due: datetime skeleton=|yyyy MMM d| hour12=|a\\|b\\\\c\\}|}",
		count: "{count: number}",
	};
	const imported = await runImportFiles(files);
	expect(
		Object.fromEntries(
			imported.variants.map((variant) => [
				variant.messageBundleId,
				variant.pattern,
			])
		)
	).toStrictEqual({
		price: [
			{ type: "text", value: "Total: " },
			{
				type: "expression",
				arg: { type: "variable-reference", name: "amount" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{ name: "style", value: { type: "literal", value: "currency" } },
						{
							name: "currency",
							value: { type: "variable-reference", name: "currency" },
						},
						{
							name: "minimumFractionDigits",
							value: { type: "literal", value: "2" },
						},
					],
				},
			},
		],
		date: [
			{ type: "text", value: "Due " },
			{
				type: "expression",
				arg: { type: "variable-reference", name: "due" },
				annotation: {
					type: "function-reference",
					name: "datetime",
					options: [
						{
							name: "skeleton",
							value: { type: "literal", value: "yyyy MMM d" },
						},
						{ name: "hour12", value: { type: "literal", value: "a|b\\c}" } },
					],
				},
			},
		],
		count: [
			{
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: { type: "function-reference", name: "number", options: [] },
			},
		],
	} satisfies Record<string, Pattern>);
	expect(
		imported.bundles.find((bundle) => bundle.id === "price")?.declarations
	).toStrictEqual([
		{ type: "input-variable", name: "amount" },
		{ type: "input-variable", name: "currency" },
	]);

	// byte-stable
	expect(await runExportFilesText(imported)).toBe(
		JSON.stringify(
			{ $schema: "https://inlang.com/schema/inlang-message-format", ...files },
			undefined,
			"\t"
		)
	);
});

test("quotes literal option values that would not parse back", async () => {
	const exported = await exportPattern([
		{
			type: "expression",
			arg: { type: "variable-reference", name: "x" },
			annotation: {
				type: "function-reference",
				name: "f",
				options: [
					{ name: "a", value: { type: "literal", value: "$notAVariable" } },
					{ name: "b", value: { type: "literal", value: "" } },
					{ name: "c", value: { type: "literal", value: "::currency/EUR" } },
					{ name: "d", value: { type: "literal", value: "{x}" } },
				],
			},
		},
	]);
	expect(exported).toBe(
		"{x: f a=|$notAVariable| b=|| c=::currency/EUR d=|{x\\}|}"
	);
	const imported = await runImportFiles({ key: exported });
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "expression",
			arg: { type: "variable-reference", name: "x" },
			annotation: {
				type: "function-reference",
				name: "f",
				options: [
					{ name: "a", value: { type: "literal", value: "$notAVariable" } },
					{ name: "b", value: { type: "literal", value: "" } },
					{ name: "c", value: { type: "literal", value: "::currency/EUR" } },
					{ name: "d", value: { type: "literal", value: "{x}" } },
				],
			},
		},
	] satisfies Pattern);
});

test("placeholders that are not annotated expressions stay byte-stable", async () => {
	const files = {
		spaced: "Hi { name }!",
		colonOnly: "{a:b c}",
		colonWithoutSpace: "Hi {user:name}, {t:count}",
		trailingColon: "{a:}",
		dangling: "{x: f opt=}",
		plain: "Hello {name}",
	};
	const imported = await runImportFiles(files);
	for (const variant of imported.variants) {
		for (const part of variant.pattern ?? []) {
			if (part.type === "expression") expect(part.annotation).toBeUndefined();
		}
	}
	expect(await runExportFilesText(imported)).toBe(
		JSON.stringify(
			{ $schema: "https://inlang.com/schema/inlang-message-format", ...files },
			undefined,
			"\t"
		)
	);
});

test("refuses names that an annotated placeholder can't represent", async () => {
	await expect(
		exportPattern([
			{
				type: "expression",
				arg: { type: "variable-reference", name: "x" },
				annotation: {
					type: "function-reference",
					name: "my function",
					options: [],
				},
			},
		])
	).rejects.toThrow('Cannot serialize the function "my function" on "x"');
});

function runImportFiles(json: Record<string, unknown>) {
	return importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(JSON.stringify(json)),
			},
		],
	});
}

async function runExportFilesText(
	imported: Awaited<ReturnType<typeof importFiles>>
): Promise<string> {
	const messages = imported.messages.map((message) => ({
		...message,
		id: `${message.bundleId}-${message.locale}`,
	})) as Message[];
	const variants = imported.variants.map((variant, index) => ({
		...variant,
		id: `variant-${index}`,
		messageId: `${variant.messageBundleId}-${variant.messageLocale}`,
	})) as Variant[];
	const exported = await exportFiles({
		settings: {} as any,
		bundles: imported.bundles as Bundle[],
		messages,
		variants,
	});
	return new TextDecoder().decode(exported[0]!.content);
}

async function exportPattern(pattern: Pattern): Promise<string> {
	const exported = await exportFiles({
		settings: {} as any,
		bundles: [{ id: "key", declarations: [] }],
		messages: [{ id: "m", bundleId: "key", locale: "en", selectors: [] }],
		variants: [{ id: "v", messageId: "m", matches: [], pattern }],
	});
	return JSON.parse(new TextDecoder().decode(exported[0]!.content)).key;
}
