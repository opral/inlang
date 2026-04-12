import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";
import type {
	Bundle,
	Declaration,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { exportFiles } from "./exportFiles.js";

test("it handles simple key-value pairs without variables", async () => {
	const imported = await runImportFiles(
		"greeting = Hello World\nfarewell = Goodbye"
	);

	expect(imported.bundles).lengthOf(2);
	expect(imported.messages).lengthOf(2);
	expect(imported.variants).lengthOf(2);

	expect(imported.bundles[0]?.id).toStrictEqual("greeting");
	expect(imported.bundles[0]?.declarations).toStrictEqual([]);
	expect(imported.bundles[1]?.id).toStrictEqual("farewell");

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello World" },
	]);
	expect(imported.variants[1]?.pattern).toStrictEqual([
		{ type: "text", value: "Goodbye" },
	]);
});

test("it handles values with variable expressions", async () => {
	const imported = await runImportFiles(
		"greeting = Hello {name}!\nitems.count = You have {count} items"
	);

	expect(imported.bundles).lengthOf(2);
	expect(imported.messages).lengthOf(2);
	expect(imported.variants).lengthOf(2);

	expect(imported.bundles[0]?.id).toStrictEqual("greeting");
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "name" },
	] satisfies Declaration[]);

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "name" },
		},
		{ type: "text", value: "!" },
	] satisfies Pattern);

	expect(imported.bundles[1]?.id).toStrictEqual("items.count");
	expect(imported.bundles[1]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "count" },
	] satisfies Declaration[]);

	expect(imported.variants[1]?.pattern).toStrictEqual([
		{ type: "text", value: "You have " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
		{ type: "text", value: " items" },
	] satisfies Pattern);
});

test("it handles multiple variables in a single value", async () => {
	const imported = await runImportFiles(
		"message = {user} sent {count} messages to {recipient}"
	);

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "user" },
		{ type: "input-variable", name: "count" },
		{ type: "input-variable", name: "recipient" },
	] satisfies Declaration[]);

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{
			type: "expression",
			arg: { type: "variable-reference", name: "user" },
		},
		{ type: "text", value: " sent " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "count" },
		},
		{ type: "text", value: " messages to " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "recipient" },
		},
	] satisfies Pattern);
});

test("it handles empty values", async () => {
	const imported = await runImportFiles("empty.key = ");

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("empty.key");
	expect(imported.variants[0]?.pattern).toStrictEqual([]);
});

test("it handles comments (they are ignored during import)", async () => {
	const imported = await runImportFiles(
		"# This is a greeting\ngreeting = Hello"
	);

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("greeting");
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello" },
	]);
});

test("it handles dot-separated keys", async () => {
	const imported = await runImportFiles(
		"section.subsection.key = Deep value\nsection.other = Other value"
	);

	expect(imported.bundles).lengthOf(2);
	expect(imported.bundles[0]?.id).toStrictEqual("section.subsection.key");
	expect(imported.bundles[1]?.id).toStrictEqual("section.other");
});

test("it handles multiple locales", async () => {
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					"greeting = Hello {name}!\nfarewell = Goodbye"
				),
			},
			{
				locale: "fr",
				content: new TextEncoder().encode(
					"greeting = Bonjour {name} !\nfarewell = Au revoir"
				),
			},
		],
	});

	expect(imported.bundles).lengthOf(2);
	expect(imported.messages).lengthOf(4);
	expect(imported.variants).lengthOf(4);

	// Bundle declarations should be merged from all locales
	expect(imported.bundles[0]?.id).toStrictEqual("greeting");
	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "name" },
	]);

	const exported = await runExportFiles(imported);
	expect(exported).lengthOf(2);

	const enContent = new TextDecoder().decode(
		exported.find((e: any) => e.locale === "en")?.content
	);
	const frContent = new TextDecoder().decode(
		exported.find((e: any) => e.locale === "fr")?.content
	);

	expect(enContent).toContain("greeting = Hello {name}!");
	expect(enContent).toContain("farewell = Goodbye");
	expect(frContent).toContain("greeting = Bonjour {name} !");
	expect(frContent).toContain("farewell = Au revoir");
});

test("roundtrip: import then export then import produces same data", async () => {
	const original =
		"greeting = Hello {name}!\nitems.count = You have {count} items\nsimple = Just text\n";
	const imported1 = await runImportFiles(original);
	const exported = await runExportFiles(imported1);
	const imported2 = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: exported[0]!.content,
			},
		],
	});

	expect(imported2.bundles.length).toStrictEqual(imported1.bundles.length);
	expect(imported2.messages.length).toStrictEqual(imported1.messages.length);
	expect(imported2.variants.length).toStrictEqual(imported1.variants.length);

	for (let i = 0; i < imported1.bundles.length; i++) {
		expect(imported2.bundles[i]?.id).toStrictEqual(imported1.bundles[i]?.id);
		expect(imported2.bundles[i]?.declarations).toStrictEqual(
			imported1.bundles[i]?.declarations
		);
	}

	for (let i = 0; i < imported1.variants.length; i++) {
		expect(imported2.variants[i]?.pattern).toStrictEqual(
			imported1.variants[i]?.pattern
		);
	}
});

test("export sorts keys ascending when configured", async () => {
	const imported = await runImportFiles(
		"c.key = three\na.key = one\nb.key = two"
	);

	const settingsAsc = {
		"plugin.inlang.propertiesFile": {
			sort: "asc",
		},
	};
	const exported = await runExportFiles(imported, settingsAsc);
	const content = new TextDecoder().decode(exported[0]?.content);
	const lines = content.split("\n").filter((l: string) => l.length > 0);

	expect(lines[0]).toStrictEqual("a.key = one");
	expect(lines[1]).toStrictEqual("b.key = two");
	expect(lines[2]).toStrictEqual("c.key = three");
});

test("export sorts keys descending when configured", async () => {
	const imported = await runImportFiles(
		"a.key = one\nc.key = three\nb.key = two"
	);

	const settingsDesc = {
		"plugin.inlang.propertiesFile": {
			sort: "desc",
		},
	};
	const exported = await runExportFiles(imported, settingsDesc);
	const content = new TextDecoder().decode(exported[0]?.content);
	const lines = content.split("\n").filter((l: string) => l.length > 0);

	expect(lines[0]).toStrictEqual("c.key = three");
	expect(lines[1]).toStrictEqual("b.key = two");
	expect(lines[2]).toStrictEqual("a.key = one");
});

test("it handles the same variable used multiple times", async () => {
	const imported = await runImportFiles(
		"repeat = The value {value} appears twice: {value}"
	);

	expect(imported.bundles[0]?.declarations).toHaveLength(1);
	expect(imported.bundles[0]?.declarations?.[0]).toMatchObject({
		type: "input-variable",
		name: "value",
	});

	expect(imported.variants[0]?.pattern).toEqual([
		{ type: "text", value: "The value " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "value" },
		},
		{ type: "text", value: " appears twice: " },
		{
			type: "expression",
			arg: { type: "variable-reference", name: "value" },
		},
	]);
});

test("it handles special characters in values", async () => {
	const imported = await runImportFiles(
		"special = Value with \\= equals and \\: colon"
	);

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("special");
	// properties-file unescapes the value
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Value with = equals and : colon" },
	]);
});

test("it handles unicode escape sequences", async () => {
	const imported = await runImportFiles("unicode = Hello \\u0057orld");

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello World" },
	]);
});

test("it handles colon as separator", async () => {
	const imported = await runImportFiles("key : value with colon separator");

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("key");
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "value with colon separator" },
	]);
});

test("it handles values without any separator space", async () => {
	const imported = await runImportFiles("key=value");

	expect(imported.bundles).lengthOf(1);
	expect(imported.bundles[0]?.id).toStrictEqual("key");
	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "value" },
	]);
});

test("it handles unclosed braces as literal text", async () => {
	const imported = await runImportFiles("broken = Hello {world");

	expect(imported.variants[0]?.pattern).toStrictEqual([
		{ type: "text", value: "Hello {world" },
	]);
});

test("handles inputs of a bundle even if one locale doesn't use all inputs", async () => {
	const imported = await importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(
					"message = Hello {username}! Welcome to {place}."
				),
			},
			{
				locale: "de",
				content: new TextEncoder().encode(
					"message = Willkommen {username}!"
				),
			},
		],
	});

	expect(imported.bundles).lengthOf(1);
	expect(imported.messages).lengthOf(2);
	expect(imported.variants).lengthOf(2);

	expect(imported.bundles[0]?.declarations).toStrictEqual([
		{ type: "input-variable", name: "username" },
		{ type: "input-variable", name: "place" },
	]);

	const exported = await runExportFiles(imported);

	const enContent = new TextDecoder().decode(
		exported.find((e: any) => e.locale === "en")?.content
	);
	const deContent = new TextDecoder().decode(
		exported.find((e: any) => e.locale === "de")?.content
	);

	expect(enContent).toContain(
		"message = Hello {username}! Welcome to {place}."
	);
	expect(deContent).toContain("message = Willkommen {username}!");
});

test("export file ends with a newline", async () => {
	const imported = await runImportFiles("key = value");
	const exported = await runExportFiles(imported);
	const content = new TextDecoder().decode(exported[0]?.content);

	expect(content.endsWith("\n")).toBe(true);
});

test("export file name uses locale and .properties extension", async () => {
	const imported = await runImportFiles("key = value");
	const exported = await runExportFiles(imported);

	expect(exported[0]?.name).toStrictEqual("en.properties");
});

test("it escapes control characters in exported values", async () => {
	const imported = await runImportFiles(
		"multiline = line1\\nline2\\nline3\ntabbed = col1\\tcol2\nbackslash = path\\\\to\\\\file"
	);

	const exported = await runExportFiles(imported);
	const content = new TextDecoder().decode(exported[0]?.content);

	// The exported content should have escaped control characters
	expect(content).toContain("multiline = line1\\nline2\\nline3");
	expect(content).toContain("tabbed = col1\\tcol2");
	expect(content).toContain("backslash = path\\\\to\\\\file");
});

test("it throws on multi-variant messages", async () => {
	// Construct a message with multiple variants (simulating a plural)
	const bundles: Bundle[] = [{ id: "item_count", declarations: [] }];
	const messages: Message[] = [
		{
			id: "item_count_en",
			bundleId: "item_count",
			locale: "en",
			selectors: [],
		},
	];
	const variants: Variant[] = [
		{
			id: "v1",
			messageId: "item_count_en",
			matches: [{ type: "literal-match", key: "count", value: "one" }],
			pattern: [{ type: "text", value: "1 item" }],
		},
		{
			id: "v2",
			messageId: "item_count_en",
			matches: [{ type: "literal-match", key: "count", value: "other" }],
			pattern: [{ type: "text", value: "{count} items" }],
		},
	];

	await expect(
		exportFiles({
			bundles,
			messages,
			variants,
			settings: {
				baseLocale: "en",
				locales: ["en"],
				"plugin.inlang.propertiesFile": {
					pathPattern: "./messages/{locale}.properties",
				},
			} as any,
		})
	).rejects.toThrow(/does not support multiple variants/);
});

// convenience wrapper for less testing code
function runImportFiles(propertiesContent: string) {
	return importFiles({
		settings: {} as any,
		files: [
			{
				locale: "en",
				content: new TextEncoder().encode(propertiesContent),
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
					(m: any) =>
						m.bundleId === message.bundleId && m.locale === message.locale
				)?.id ?? `${Math.random() * 1000}`;
		}
	}
	for (const variant of imported.variants) {
		if (variant.id === undefined) {
			(variant as any).id = `${Math.random() * 1000}`;
		}
		if (variant.messageId === undefined) {
			(variant as any).messageId = imported.messages.find(
				(m: any) =>
					m.bundleId === (variant as any).messageBundleId &&
					m.locale === (variant as any).messageLocale
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
