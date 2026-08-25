import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";
import {
	Declaration,
	type Bundle,
	type Match,
	type Message,
	type Pattern,
	type Variant,
} from "@inlang/sdk";
import { exportFiles } from "./exportFiles.js";

test("it handles single variants without expressions", async () => {
	const imported = await runImportFiles({
		some_happy_cat: "Read more about Lix",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: "Read more about Lix",
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(1);

	expect(imported.bundles[0]?.id).toStrictEqual("some_happy_cat");
	expect(imported.bundles[0]?.declarations).toStrictEqual([]);

	expect(imported.messages[0]?.selectors).toStrictEqual([]);

	expect(imported.variants[0]?.matches).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Read more about Lix" },
	]);
});

// https://github.com/opral/paraglide-js/issues/571
test("it preserves json strings as plain text", async () => {
	const imported = await runImportFiles({
		example_msg: '["a","b","c"]',
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		example_msg: '["a","b","c"]',
	});

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: '["a","b","c"]' },
	]);
});

test("it supports escaped braces in patterns", async () => {
	const imported = await runImportFiles({
		json_object: '\\{"a": "b", "c": "d"\\}',
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		json_object: '\\{"a": "b", "c": "d"\\}',
	});

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: '{"a": "b", "c": "d"}' },
	]);
});

test("it handles variable expressions in patterns", async () => {
	const imported = await runImportFiles({
		some_happy_cat:
			"Used by {count} devs, {numDesigners} designers and translators",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat:
			"Used by {count} devs, {numDesigners} designers and translators",
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(1);

	expect(imported.bundles[0]?.id).toStrictEqual("some_happy_cat");
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "count" },
		{ type: "input-variable", name: "numDesigners" },
	] satisfies Declaration[]);

	expect(imported.messages[0]?.selectors).toStrictEqual([]);

	expect(imported.variants[0]?.matches).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Used by " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
		{
			type: "text",
			value: " devs, ",
		},
		{
			type: "expression",
			arg: { type: "variable-reference", name: "numDesigners" },
		},
		{
			type: "text",
			value: " designers and translators",
		},
	] satisfies Pattern);
});

test("it handles markup placeholders in patterns", async () => {
	const imported = await runImportFiles({
		contact: "Send {#link}an email{/link}.",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		contact: "Send {#link}an email{/link}.",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Send " },
		{ type: "markup-start", name: "link" },
		{ type: "text", value: "an email" },
		{ type: "markup-end", name: "link" },
		{ type: "text", value: "." },
	] satisfies Pattern);
});

test("it handles markup placeholders mixed with expressions", async () => {
	const imported = await runImportFiles({
		welcome: "{#b}Hi {name}{/b}{#icon/}",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		welcome: "{#b}Hi {name}{/b}{#icon/}",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "name" },
	] satisfies Declaration[]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "markup-start", name: "b" },
		{ type: "text", value: "Hi " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "name" },
		},
		{ type: "markup-end", name: "b" },
		{ type: "markup-standalone", name: "icon" },
	] satisfies Pattern);
});

test("it handles markup options and attributes", async () => {
	const imported = await runImportFiles({
		cta: "{#link to=|/docs| rel=$relationship @track @variant=|hero|}Read docs{/link}",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		cta: "{#link to=|/docs| rel=$relationship @track @variant=|hero|}Read docs{/link}",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "relationship" },
	] satisfies Declaration[]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "markup-start",
			name: "link",
			options: [
				{ name: "to", value: { type: "literal", value: "/docs" } },
				{
					name: "rel",
					value: { type: "variable-reference", name: "relationship" },
				},
			],
			attributes: [
				{ name: "track", value: true },
				{ name: "variant", value: { type: "literal", value: "hero" } },
			],
		},
		{ type: "text", value: "Read docs" },
		{ type: "markup-end", name: "link" },
	] satisfies Pattern);
});

test("it handles standalone markup options and escaped literals", async () => {
	const imported = await runImportFiles({
		icon: "{#icon name=|pipe\\|value| path=|C:\\\\icons\\\\ok| @decorative/}",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		icon: "{#icon name=|pipe\\|value| path=|C:\\\\icons\\\\ok| @decorative/}",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "markup-standalone",
			name: "icon",
			options: [
				{ name: "name", value: { type: "literal", value: "pipe|value" } },
				{ name: "path", value: { type: "literal", value: "C:\\icons\\ok" } },
			],
			attributes: [{ name: "decorative", value: true }],
		},
	] satisfies Pattern);
});

test("it handles closing braces inside markup quoted literals", async () => {
	const imported = await runImportFiles({
		cta: "{#link to=|/docs}v2| @variant=|hero}banner|}Read docs{/link}",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		cta: "{#link to=|/docs\\}v2| @variant=|hero\\}banner|}Read docs{/link}",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "markup-start",
			name: "link",
			options: [{ name: "to", value: { type: "literal", value: "/docs}v2" } }],
			attributes: [
				{ name: "variant", value: { type: "literal", value: "hero}banner" } },
			],
		},
		{ type: "text", value: "Read docs" },
		{ type: "markup-end", name: "link" },
	] satisfies Pattern);
});

test("it unescapes escaped closing braces in markup quoted literals", async () => {
	const imported = await runImportFiles({
		cta: "{#link to=|/docs\\}v2|}Read docs{/link}",
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		cta: "{#link to=|/docs\\}v2|}Read docs{/link}",
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "markup-start",
			name: "link",
			options: [{ name: "to", value: { type: "literal", value: "/docs}v2" } }],
		},
		{ type: "text", value: "Read docs" },
		{ type: "markup-end", name: "link" },
	] satisfies Pattern);
});

test("it adds the $schema property", async () => {
	const imported = await runImportFiles({
		key: "value",
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual({
		$schema: "https://inlang.com/schema/inlang-message-format",
		key: "value",
	});
});

test("it handles detecting and adding selectors and declarations for complex messages", async () => {
	const imported = await runImportFiles({
		some_happy_cat: [
			{
				match: {
					"platform=android, userGender=male":
						"{username} has to download the app on his phone from the Google Play Store.",
					"platform=ios, userGender=female":
						"{username} has to download the app on her iPhone from the App Store.",
					"platform=*, userGender=*": "The person has to download the app.",
				},
			},
		],
	});
	expect(await runExportFilesParsed(imported)).toStrictEqual(
		expect.objectContaining({
			some_happy_cat: [
				{
					declarations: [
						"input platform",
						"input userGender",
						"input username",
					],
					selectors: ["platform", "userGender"],
					match: {
						"platform=android, userGender=male":
							"{username} has to download the app on his phone from the Google Play Store.",
						"platform=ios, userGender=female":
							"{username} has to download the app on her iPhone from the App Store.",
						"platform=*, userGender=*": "The person has to download the app.",
					},
				},
			],
		})
	);

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(3);

	expect(imported.bundles[0]?.id).toStrictEqual("some_happy_cat");
	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "username" },
			{ type: "input-variable", name: "platform" },
			{ type: "input-variable", name: "userGender" },
		] satisfies Declaration[])
	);

	expect(imported.messages[0]?.selectors).toStrictEqual(
		expect.arrayContaining([
			{ type: "variable-reference", name: "platform" },
			{ type: "variable-reference", name: "userGender" },
		] satisfies Message["selectors"])
	);
	expect(imported.messages[0]?.bundleId).toStrictEqual("some_happy_cat");

	expect(imported.variants[0]).toStrictEqual(
		expect.objectContaining({
			matches: [
				{ type: "literal-match", key: "platform", value: "android" },
				{ type: "literal-match", key: "userGender", value: "male" },
			],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "username" },
				},
				{
					type: "text",
					value:
						" has to download the app on his phone from the Google Play Store.",
				},
			],
		} satisfies Partial<Variant>)
	);
	expect(imported.variants[1]).toStrictEqual(
		expect.objectContaining({
			matches: [
				{ type: "literal-match", key: "platform", value: "ios" },
				{ type: "literal-match", key: "userGender", value: "female" },
			],
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "username" },
				},
				{
					type: "text",
					value: " has to download the app on her iPhone from the App Store.",
				},
			],
		} satisfies Partial<Variant>)
	);
	expect(imported.variants[2]).toStrictEqual(
		expect.objectContaining({
			matches: [
				{ type: "catchall-match", key: "platform" },
				{ type: "catchall-match", key: "userGender" },
			],
			pattern: [{ type: "text", value: "The person has to download the app." }],
		} satisfies Partial<Variant>)
	);
});

test("it preserves three selector names across export and reimport", async () => {
	const imported = await runImportFiles({
		journal_write: [
			{
				declarations: ["input duration", "input every", "input type"],
				selectors: ["duration", "every", "type"],
				match: {
					"duration=1,every=week,type=custom": "Write a custom entry",
					"duration=*,every=*,type=*": "Write an entry",
				},
			},
		],
	});

	const exported = await runExportFilesParsed(imported);
	expect(exported.journal_write[0].match).toHaveProperty(
		"duration=1, every=week, type=custom",
		"Write a custom entry"
	);

	const reimported = await runImportFiles(exported);
	expect(reimported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "duration" },
		{ type: "input-variable", name: "every" },
		{ type: "input-variable", name: "type" },
	] satisfies Declaration[]);
	expect(reimported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "duration" },
		{ type: "variable-reference", name: "every" },
		{ type: "variable-reference", name: "type" },
	] satisfies Message["selectors"]);
	expect(reimported.variants[0]?.matches).toStrictEqual([
		{ type: "literal-match", key: "duration", value: "1" },
		{ type: "literal-match", key: "every", value: "week" },
		{ type: "literal-match", key: "type", value: "custom" },
	] satisfies Match[]);
});

test("it trims whitespace around every selector name and match value", async () => {
	const imported = await runImportFiles({
		journal_write: [
			{
				match: {
					" duration = 1 , every = week , type = custom ": "Write an entry",
					" duration = * , every = * , type = * ": "Write anything",
				},
			},
		],
	});

	expect(imported.messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "duration" },
		{ type: "variable-reference", name: "every" },
		{ type: "variable-reference", name: "type" },
	] satisfies Message["selectors"]);
	expect(imported.variants[0]?.matches).toStrictEqual([
		{ type: "literal-match", key: "duration", value: "1" },
		{ type: "literal-match", key: "every", value: "week" },
		{ type: "literal-match", key: "type", value: "custom" },
	] satisfies Match[]);
	expect(imported.variants[1]?.matches).toStrictEqual([
		{ type: "catchall-match", key: "duration" },
		{ type: "catchall-match", key: "every" },
		{ type: "catchall-match", key: "type" },
	] satisfies Match[]);
});

test("it detects later placeholders after an already declared input", async () => {
	const imported = await runImportFiles({
		complex_message: [
			{
				declarations: ["input known"],
				match: {
					"kind=yes": "{known} {newInput} {anotherInput}",
				},
			},
		],
	});

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "known" },
		{ type: "input-variable", name: "newInput" },
		{ type: "input-variable", name: "anotherInput" },
		{ type: "input-variable", name: "kind" },
	] satisfies Declaration[]);
});

test("variants with a plural function are parsed correctly", async () => {
	const imported = await runImportFiles({
		some_happy_cat: [
			{
				declarations: ["input count", "local countPlural = count: plural"],
				selectors: ["countPlural"],
				match: {
					"countPlural=one": "There is one cat.",
					"countPlural=other": "There are many cats.",
				},
			},
		],
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: [
			{
				declarations: ["input count", "local countPlural = count: plural"],
				selectors: ["countPlural"],
				match: {
					"countPlural=one": "There is one cat.",
					"countPlural=other": "There are many cats.",
				},
			},
		],
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(1);
	expect(imported.variants).lengthOf(2);

	expect(imported.bundles[0]?.id).toStrictEqual("some_happy_cat");
	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "count" },
			{
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: {
						name: "count",
						type: "variable-reference",
					},
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [],
					},
				},
			},
		] satisfies Declaration[])
	);

	expect(imported.messages[0]?.selectors).toStrictEqual(
		expect.arrayContaining([
			{ type: "variable-reference", name: "countPlural" },
		] satisfies Message["selectors"])
	);
	expect(imported.messages[0]?.bundleId).toStrictEqual("some_happy_cat");

	expect(imported.variants[0]).toStrictEqual(
		expect.objectContaining({
			matches: [{ type: "literal-match", key: "countPlural", value: "one" }],
			pattern: [{ type: "text", value: "There is one cat." }],
		} satisfies Partial<Variant>)
	);
	expect(imported.variants[1]).toStrictEqual(
		expect.objectContaining({
			matches: [{ type: "literal-match", key: "countPlural", value: "other" }],
			pattern: [{ type: "text", value: "There are many cats." }],
		} satisfies Partial<Variant>)
	);
});

test("ordinal plural options survive import/export", async () => {
	const imported = await runImportFiles({
		finished_readout: [
			{
				declarations: [
					"input placeNumber",
					"local ordinalCategory = placeNumber: plural type=ordinal",
				],
				selectors: ["ordinalCategory"],
				match: {
					"ordinalCategory=one": "You finished in {placeNumber}st place",
					"ordinalCategory=two": "You finished in {placeNumber}nd place",
					"ordinalCategory=few": "You finished in {placeNumber}rd place",
					"ordinalCategory=*": "You finished in {placeNumber}th place",
				},
			},
		],
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		finished_readout: [
			{
				declarations: [
					"input placeNumber",
					"local ordinalCategory = placeNumber: plural type=ordinal",
				],
				selectors: ["ordinalCategory"],
				match: {
					"ordinalCategory=one": "You finished in {placeNumber}st place",
					"ordinalCategory=two": "You finished in {placeNumber}nd place",
					"ordinalCategory=few": "You finished in {placeNumber}rd place",
					"ordinalCategory=*": "You finished in {placeNumber}th place",
				},
			},
		],
	});

	expect(imported.bundles[0]?.declarations).toContainEqual({
		type: "local-variable",
		name: "ordinalCategory",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "placeNumber" },
			annotation: {
				type: "function-reference",
				name: "plural",
				options: [
					{ name: "type", value: { type: "literal", value: "ordinal" } },
				],
			},
		},
	});

	expect(imported.messages[0]?.selectors).toContainEqual({
		type: "variable-reference",
		name: "ordinalCategory",
	});

	const catchallVariant = imported.variants.find((variant) =>
		variant.matches?.some(
			(match) =>
				match.type === "catchall-match" && match.key === "ordinalCategory"
		)
	);

	expect(catchallVariant).toMatchObject({
		pattern: [
			{ type: "text", value: "You finished in " },
			{
				type: "expression",
				arg: { type: "variable-reference", name: "placeNumber" },
			},
			{ type: "text", value: "th place" },
		],
	});
});

test("doesn't use string as value if declarations, selectors, or multiple matches exist ", async () => {
	const imported = await runImportFiles({
		some_happy_cat: "Today is {date}.",
	});

	imported.messages[0]!.selectors!.push({
		name: "date",
		type: "variable-reference",
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: [
			{
				declarations: ["input date"],
				selectors: ["date"],
				match: {
					"date=*": "Today is {date}.",
				},
			},
		],
	});
});

test("local variables with function declarations and options", async () => {
	const imported = await runImportFiles({
		some_happy_cat: [
			{
				declarations: [
					"input date",
					"local formattedDate = date: datetime month=long day=numeric",
				],
				selectors: [],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: [
			{
				declarations: [
					"input date",
					"local formattedDate = date: datetime month=long day=numeric",
				],
				selectors: ["formattedDate"],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});
});

test("adds undeclared inputs referenced by local declarations", async () => {
	const imported = await runImportFiles({
		with_number: [
			{
				declarations: [
					"local formatted = count: number style=unit unit=minute unitDisplay=long",
				],
				selectors: [],
				match: { "*": "{formatted}" },
			},
		],
	});

	expect(imported.bundles[0]?.declarations).toContainEqual({
		type: "input-variable",
		name: "count",
	});
});

test("infers inputs referenced by formatter options", async () => {
	const imported = await runImportFiles({
		relative_time: [
			{
				declarations: ["local formatted = duration: relativetime unit=$unit"],
				selectors: [],
				match: { "*": "{formatted}" },
			},
		],
	});

	const declarations = imported.bundles[0]?.declarations ?? [];
	expect(declarations).toContainEqual({
		type: "input-variable",
		name: "duration",
	});
	expect(declarations).toContainEqual({
		type: "input-variable",
		name: "unit",
	});
});

test("infers free inputs from local declarations without shadowing locals", async () => {
	const imported = await runImportFiles({
		formatted: [
			{
				declarations: [
					"local base = count: number",
					"local formatted = base: number",
				],
				selectors: [],
				match: { "*": "{formatted}" },
			},
		],
	});

	const declarations = imported.bundles[0]?.declarations ?? [];
	expect(declarations).toContainEqual({
		type: "input-variable",
		name: "count",
	});
	expect(declarations).not.toContainEqual({
		type: "input-variable",
		name: "base",
	});
});

test("local variables support whitespace around literal formatter options", async () => {
	const imported = await runImportFiles({
		some_happy_cat: [
			{
				declarations: [
					"input date",
					"local formattedDate = date: datetime month = long day = numeric",
				],
				selectors: [],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: [
			{
				declarations: [
					"input date",
					"local formattedDate = date: datetime month=long day=numeric",
				],
				selectors: ["formattedDate"],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});

	expect(imported.bundles[0]?.declarations).toContainEqual({
		type: "local-variable",
		name: "formattedDate",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "date" },
			annotation: {
				type: "function-reference",
				name: "datetime",
				options: [
					{ name: "month", value: { type: "literal", value: "long" } },
					{ name: "day", value: { type: "literal", value: "numeric" } },
				],
			},
		},
	});
});

test("local variables support variable references in formatter options", async () => {
	const imported = await runImportFiles({
		pricing_card_price_display: [
			{
				declarations: [
					"input amount",
					"input priceCurrency",
					"local formattedAmount = amount: number style = currency currency = $priceCurrency notation = compact",
				],
				selectors: [],
				match: {
					"formattedAmount=*": "{formattedAmount}",
				},
			},
		],
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		pricing_card_price_display: [
			{
				declarations: [
					"input amount",
					"input priceCurrency",
					"local formattedAmount = amount: number style=currency currency=$priceCurrency notation=compact",
				],
				selectors: ["formattedAmount"],
				match: {
					"formattedAmount=*": "{formattedAmount}",
				},
			},
		],
	});

	expect(imported.bundles[0]?.declarations).toContainEqual({
		type: "local-variable",
		name: "formattedAmount",
		value: {
			type: "expression",
			arg: { type: "variable-reference", name: "amount" },
			annotation: {
				type: "function-reference",
				name: "number",
				options: [
					{ name: "style", value: { type: "literal", value: "currency" } },
					{
						name: "currency",
						value: {
							type: "variable-reference",
							name: "priceCurrency",
						},
					},
					{ name: "notation", value: { type: "literal", value: "compact" } },
				],
			},
		},
	});
});

test("turns string syntax into ", async () => {
	const imported = await runImportFiles({
		some_happy_cat: [
			{
				declarations: ["input date", "local formattedDate = date: datetime"],
				selectors: [],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: [
			{
				declarations: ["input date", "local formattedDate = date: datetime"],
				selectors: ["formattedDate"],
				match: {
					"formattedDate=*": "Today is {formattedDate}.",
				},
			},
		],
	});
});

test("roundtrip with new variants that have been created by apps", async () => {
	const imported1 = await runImportFiles({
		some_happy_cat: "Read more about Lix",
	});

	// simulating adding a new bundle, message, and variant
	imported1.bundles.push({
		id: "green_box_atari",
		declarations: [],
	});

	imported1.messages.push({
		id: "0j299j-3si02j0j4=s02-3js2",
		bundleId: "green_box_atari",
		selectors: [],
		locale: "en",
	});

	imported1.variants.push({
		id: "929s",
		matches: [],
		messageId: "0j299j-3si02j0j4=s02-3js2",
		pattern: [{ type: "text", value: "New variant" }],
	});

	// export after adding the bundle, messages, variants
	const exported1 = await runExportFiles(imported1);

	const imported2 = await runImportFiles(
		JSON.parse(new TextDecoder().decode(exported1[0]?.content))
	);

	const exported2 = await runExportFiles(imported2);

	// Check bundles by ID rather than position
	expect(imported2.bundles.map((b) => b.id).sort()).toEqual(
		["some_happy_cat", "green_box_atari"].sort()
	);

	expect(exported2).toStrictEqual(exported1);
});

test("handles inputs of a bundle even if one message doesn't use all inputs", async () => {
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({
						blue_horse_shoe: "Hello {username}! Welcome in {placename}.",
					})
				),
			},
			{
				locale: "de",
				content: new TextEncoder().encode(
					JSON.stringify({
						blue_horse_shoe: "Willkommen {username}!.",
					})
				),
			},
		],
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(2);
	expect(imported.variants).lengthOf(2);

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "username" },
		{ type: "input-variable", name: "placename" },
	]);

	const exported = await runExportFiles(imported);

	expect(
		JSON.parse(new TextDecoder().decode(exported[0]?.content))
	).toMatchObject({
		blue_horse_shoe: "Hello {username}! Welcome in {placename}.",
	});

	expect(
		JSON.parse(new TextDecoder().decode(exported[1]?.content))
	).toMatchObject({
		blue_horse_shoe: "Willkommen {username}!.",
	});
});

test("it handles multiple files for the same locale", async () => {
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({
						some_happy_cat: "Read more about Lix",
						one_happy_dog: "This explains itself",
					})
				),
			},
			{
				locale: "en",
				content: new TextEncoder().encode(
					JSON.stringify({
						some_happy_cat: "Read more about Lix",
						one_happy_dog: "Read more about Inlang",
					})
				),
			},
		],
	});
	expect(await runExportFilesParsed(imported)).toMatchObject({
		some_happy_cat: "Read more about Lix",
		one_happy_dog: "Read more about Inlang",
	});

	expect(imported.bundles).lengthOf(2);
	expect(imported.messages).lengthOf(4);
	expect(imported.variants).lengthOf(4);

	expect(imported.bundles[0]?.id).toStrictEqual("some_happy_cat");
	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.bundles[1]?.id).toStrictEqual("one_happy_dog");
	expect(imported.bundles[1]?.declarations).toStrictEqual([]);

	expect(imported.messages[0]?.selectors).toStrictEqual([]);
	expect(imported.messages[1]?.selectors).toStrictEqual([]);
	expect(imported.messages[2]?.selectors).toStrictEqual([]);
	expect(imported.messages[3]?.selectors).toStrictEqual([]);

	expect(imported.variants[0]?.matches).toStrictEqual([]);
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Read more about Lix" },
	]);
	expect(imported.variants[1]?.matches).toStrictEqual([]);
	expect(imported.variants[1]?.pattern).toStrictEqual([
		{ type: "text", value: "This explains itself" },
	]);
	expect(imported.variants[2]?.matches).toStrictEqual([]);
	expect(imported.variants[2]?.pattern).toStrictEqual([
		{ type: "text", value: "Read more about Lix" },
	]);
	expect(imported.variants[3]?.matches).toStrictEqual([]);
	expect(imported.variants[3]?.pattern).toStrictEqual([
		{ type: "text", value: "Read more about Inlang" },
	]);
});

test("it handles nested simple messages", async () => {
	const imported = await runImportFiles({
		navigation: {
			home: "Home",
			about: "About",
			contact: {
				email: "Email",
				phone: "Phone",
			},
		},
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		navigation: {
			home: "Home",
			about: "About",
			contact: {
				email: "Email",
				phone: "Phone",
			},
		},
	});

	expect(imported.bundles).toHaveLength(4);
	expect(imported.messages).toHaveLength(4);
	expect(imported.variants).toHaveLength(4);

	// Check that bundle IDs use dot notation
	expect(imported.bundles.map((b) => b.id)).toContain("navigation.home");
	expect(imported.bundles.map((b) => b.id)).toContain("navigation.about");
	expect(imported.bundles.map((b) => b.id)).toContain(
		"navigation.contact.email"
	);
	expect(imported.bundles.map((b) => b.id)).toContain(
		"navigation.contact.phone"
	);
});

test("it handles nested complex messages with array wrapper", async () => {
	const imported = await runImportFiles({
		navigation: {
			items: {
				count: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "There is one item",
							"countPlural=other": "There are {count} items",
						},
					},
				],
			},
		},
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		navigation: {
			items: {
				count: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "There is one item",
							"countPlural=other": "There are {count} items",
						},
					},
				],
			},
		},
	});

	expect(imported.bundles).toHaveLength(1);
	expect(imported.messages).toHaveLength(1);
	expect(imported.variants).toHaveLength(2);

	// Check that bundle ID uses dot notation
	expect(imported.bundles[0]?.id).toEqual("navigation.items.count");

	expect(imported.bundles[0]?.declarations).toStrictEqual(
		expect.arrayContaining([
			{ type: "input-variable", name: "count" },
			{
				type: "local-variable",
				name: "countPlural",
				value: {
					type: "expression",
					arg: {
						name: "count",
						type: "variable-reference",
					},
					annotation: {
						type: "function-reference",
						name: "plural",
						options: [],
					},
				},
			},
		])
	);

	expect(imported.messages[0]?.selectors).toStrictEqual(
		expect.arrayContaining([
			{ type: "variable-reference", name: "countPlural" },
		])
	);
});

test("it handles mixed nested simple and complex messages", async () => {
	const imported = await runImportFiles({
		navigation: {
			home: "Home", // simple
			items: {
				count: [
					{
						// complex wrapped in array
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "There is one item",
							"countPlural=other": "There are {count} items",
						},
					},
				],
				latest: "Latest items", // simple again
			},
		},
	});

	expect(await runExportFilesParsed(imported)).toMatchObject({
		navigation: {
			home: "Home",
			items: {
				count: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "There is one item",
							"countPlural=other": "There are {count} items",
						},
					},
				],
				latest: "Latest items",
			},
		},
	});

	expect(imported.bundles).toHaveLength(3);
	expect(imported.messages).toHaveLength(3);

	// Check bundle IDs
	expect(imported.bundles.map((b) => b.id)).toContain("navigation.home");
	expect(imported.bundles.map((b) => b.id)).toContain("navigation.items.count");
	expect(imported.bundles.map((b) => b.id)).toContain(
		"navigation.items.latest"
	);
});

/**
 * This test reproduces https://github.com/opral/inlang-paraglide-js/issues/479
 * generate incorrect JSDoc with duplicate parameter names.
 *
 * Example:
 * @param {{ days: NonNullable<unknown>, days: NonNullable<unknown> }} inputs
 *
 * This is a TS error because the property "days" is duplicated in the type.
 */
test("it correctly handles messages with duplicate placeholders", async () => {
	// Test with messages having the same placeholder multiple times as in issue #479
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en-us",
				content: new TextEncoder().encode(
					JSON.stringify({
						date_last_days: "Last {days} days",
					})
				),
			},
			{
				locale: "de-de",
				content: new TextEncoder().encode(
					JSON.stringify({
						date_last_days: "Letzte {days} Tage",
					})
				),
			},
		],
	});

	// Verify the message structure
	expect(imported.bundles).toHaveLength(1);
	expect(imported.messages).toHaveLength(2); // One for each locale
	expect(imported.variants).toHaveLength(2);

	// Check that the bundle has the right declaration
	expect(imported.bundles[0]?.id).toBe("date_last_days");
	expect(imported.bundles[0]?.declarations).toHaveLength(1);
	expect(imported.bundles[0]?.declarations?.[0]).toMatchObject({
		type: "input-variable",
		name: "days",
	});

	// Verify the export works correctly
	const exported = await runExportFiles(imported);
	const enExport = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.locale === "en-us")?.content || new Uint8Array()
		)
	);
	const deExport = JSON.parse(
		new TextDecoder().decode(
			exported.find((e) => e.locale === "de-de")?.content || new Uint8Array()
		)
	);

	expect(enExport).toMatchObject({
		date_last_days: "Last {days} days",
	});
	expect(deExport).toMatchObject({
		date_last_days: "Letzte {days} Tage",
	});
});

/**
 * Test for a more complex case with the same placeholder used multiple times in a single string
 */
test("it correctly handles messages with the same placeholder used multiple times in a string", async () => {
	const imported = await runImportFiles({
		repeat_value: "The value {value} appears twice: {value}",
	});

	// Verify the message structure
	expect(imported.bundles).toHaveLength(1);
	expect(imported.messages).toHaveLength(1);
	expect(imported.variants).toHaveLength(1);

	// Check that the bundle only has a single declaration for "value"
	expect(imported.bundles[0]?.declarations).toHaveLength(1);
	expect(imported.bundles[0]?.declarations?.[0]).toMatchObject({
		type: "input-variable",
		name: "value",
	});

	// Check pattern has two references to the same variable
	expect(imported.variants[0]?.pattern).toEqual([
		{ type: "text", value: "The value " },
		{ type: "expression", arg: { type: "variable-reference", name: "value" } },
		{ type: "text", value: " appears twice: " },
		{ type: "expression", arg: { type: "variable-reference", name: "value" } },
	]);

	// Ensure there are exactly two expressions using the "value" variable reference
	const valueReferences = imported.variants[0]?.pattern?.filter(
		(item) =>
			item.type === "expression" &&
			item.arg.type === "variable-reference" &&
			item.arg.name === "value"
	);
	expect(valueReferences).toHaveLength(2);

	// Verify the export works correctly
	const exported = await runExportFilesParsed(imported);
	expect(exported).toMatchObject({
		repeat_value: "The value {value} appears twice: {value}",
	});
});

// convenience wrapper for less testing code
function runImportFiles(json: Record<string, any>) {
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

// convenience wrapper for less testing code
async function runExportFiles(
	imported: Awaited<ReturnType<typeof importFiles>>,
	settings: Record<string, unknown> = {}
) {
	// add ids which are undefined from the import
	for (const message of imported.messages) {
		if (message.id === undefined) {
			message.id =
				imported.messages.find(
					(m) => m.bundleId === message.bundleId && m.locale === message.locale
				)?.id ?? `${Math.random() * 1000}`;
		}
	}
	for (const variant of imported.variants) {
		if (variant.id === undefined) {
			// @ts-expect-error - variant is an VariantImport
			variant.id = `${Math.random() * 1000}`;
		}
		if (variant.messageId === undefined) {
			// @ts-expect-error - variant is an VariantImport
			variant.messageId = imported.messages.find(
				(m: any) =>
					m.bundleId === variant.messageBundleId &&
					m.locale === variant.messageLocale
			)?.id;
		}
	}

	const exported = await exportFiles({
		settings: settings as any,
		bundles: imported.bundles as Bundle[],
		messages: imported.messages as Message[],
		variants: imported.variants as Variant[],
	});
	return exported;
}

// convenience wrapper for less testing code
async function runExportFilesParsed(
	imported: any,
	settings: Record<string, unknown> = {}
) {
	const exported = await runExportFiles(imported, settings);
	return JSON.parse(new TextDecoder().decode(exported[0]?.content));
}

test("export sorts keys ascending when configured", async () => {
	const imported = await runImportFiles({
		b: "two",
		a: "one",
		nested: {
			z: "last",
			y: "first",
		},
	});

	const settingsAsc = {
		"plugin.inlang.messageFormat": {
			sort: "asc",
		},
	};
	const exportedAsc = await runExportFilesParsed(imported, settingsAsc);
	expect(Object.keys(exportedAsc)).toEqual(["$schema", "a", "b", "nested"]);
	expect(Object.keys(exportedAsc.nested)).toEqual(["y", "z"]);
});

test("export sorts keys descending when configured", async () => {
	const imported = await runImportFiles({
		b: "two",
		a: "one",
		nested: {
			z: "last",
			y: "first",
		},
	});

	const settingsDesc = {
		"plugin.inlang.messageFormat": {
			sort: "desc",
		},
	};
	const exportedDesc = await runExportFilesParsed(imported, settingsDesc);
	expect(Object.keys(exportedDesc)).toEqual(["$schema", "nested", "b", "a"]);
	expect(Object.keys(exportedDesc.nested)).toEqual(["z", "y"]);
});
