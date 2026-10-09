import { describe, expect, test, vi } from "vitest";
import {
	loadProjectInMemory,
	newProject,
	saveProjectToDirectory,
	loadProjectFromDirectory,
	type InlangPlugin,
	type InlangProject,
} from "@inlang/sdk";
import { Volume } from "memfs";
import { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";
import { exportWholeFiles } from "./exportFiles.js";

// loading and saving projects with the SDK is slow on CI
vi.setConfig({ testTimeout: 30_000 });

/**
 * With the previous files, an export only changes the bytes of the messages
 * that changed. Projects are loaded with the SDK, like apps do.
 */

const encode = (text: string) => new TextEncoder().encode(text);
// keeps a byte order mark
const decode = (content: Uint8Array) =>
	new TextDecoder("utf-8", { ignoreBOM: true }).decode(content);

async function load(
	files: Record<string, string>,
	pluginSettings: Record<string, unknown> = {}
) {
	const locales = Object.keys(files);
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: locales[0]!,
				locales,
				modules: [],
				[PLUGIN_KEY]: {
					pathPattern: "./messages/{locale}.json",
					...pluginSettings,
				},
			},
		}),
		providePlugins: [plugin as InlangPlugin],
	});
	await project.importFiles({
		pluginKey: PLUGIN_KEY,
		files: Object.entries(files).map(([locale, text]) => ({
			locale,
			content: encode(text),
		})),
	});
	return project;
}

/** Exports with the previous files and returns the files by locale. */
async function exportWith(
	project: InlangProject,
	previous: Record<string, string>
) {
	const files = await project.exportFiles({
		pluginKey: PLUGIN_KEY,
		files: Object.entries(previous).map(([locale, text]) => ({
			path: `./messages/${locale}.json`,
			locale,
			content: encode(text),
		})),
	});
	return Object.fromEntries(
		files.map((file) => [file.locale, decode(file.content)])
	);
}

/** The full export, as without previous files. */
async function exportWhole(project: InlangProject) {
	const files = await project.exportFiles({ pluginKey: PLUGIN_KEY });
	return Object.fromEntries(
		files.map((file) => [file.locale, decode(file.content)])
	);
}

async function variantOf(
	project: InlangProject,
	bundleId: string,
	locale: string,
	matches?: Record<string, string>
) {
	const message = await project.db
		.selectFrom("inlang_message")
		.where("bundle_id", "=", bundleId)
		.where("locale", "=", locale)
		.selectAll()
		.executeTakeFirstOrThrow();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.where("message_id", "=", message.id)
		.selectAll()
		.execute();
	const variant = variants.find(
		(candidate) =>
			matches === undefined ||
			Object.entries(matches).every(([key, value]) =>
				candidate.matches.some(
					(match) =>
						match.key === key &&
						(value === "*"
							? match.type === "catchall-match"
							: match.type === "literal-match" && match.value === value)
				)
			)
	);
	if (variant === undefined) throw new Error("no such variant");
	return { message, variant };
}

async function setText(
	project: InlangProject,
	bundleId: string,
	locale: string,
	text: string,
	matches?: Record<string, string>
) {
	const { variant } = await variantOf(project, bundleId, locale, matches);
	await project.db
		.updateTable("inlang_variant")
		.set({ pattern: [{ type: "text", value: text }] })
		.where("id", "=", variant.id)
		.execute();
}

// hand-written: no `$schema` in de, inline arrays, `other` instead of `*`,
// escapes, odd whitespace, keys in no particular order
const handWritten = {
	en: `{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "zebra": "Zebra",
  "greeting":   "Hello {name}!",
  "caf\\u00e9": "Caf\\u00e9 \\u2014 \\"quoted\\" \\/ slash",
  "navigation": { "home": "Home", "contact": {
      "email": "Email us at {email}" } },
  "items": [
    {
      "declarations": ["input count", "local countPlural = count: plural"],
      "selectors": ["countPlural"],
      "match": { "countPlural=one": "One item", "countPlural=other": "{count} items" }
    }
  ],
  "legacy": [{ "selectors": [], "match": ["Legacy text"] }]
}
`,
	de: `{
\t"greeting": "Hallo {name}!",
\t"zebra": "Zebra",
\t"items": [{"declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"], "match": {"countPlural=one": "Ein Artikel", "countPlural=other": "{count} Artikel"}}],
\t"navigation": {
\t\t"home": "Startseite"
\t}
}`,
};

describe("no edits", () => {
	test("hand-written files stay byte-identical", async () => {
		const project = await load(handWritten);
		// the full export would change them
		const whole = await exportWhole(project);
		expect(whole.en).not.toBe(handWritten.en);
		expect(whole.de).not.toBe(handWritten.de);

		const files = await project.exportFiles({
			pluginKey: PLUGIN_KEY,
			files: Object.entries(handWritten).map(([locale, text]) => ({
				path: `./messages/${locale}.json`,
				locale,
				content: encode(text),
			})),
		});
		for (const file of files) {
			expect(decode(file.content)).toBe(
				handWritten[file.locale as keyof typeof handWritten]
			);
			expect(file.verbatim).toBe(true);
		}
	});

	test("CRLF, a byte order mark, 4 spaces and no final newline stay byte-identical", async () => {
		const en = '﻿{\r\n    "b": "B",\r\n    "a": [\r\n        "A"\r\n    ]\r\n}';
		const project = await load({ en });
		expect(await exportWith(project, { en })).toEqual({
			en,
		});
	});

	test("the complex form that the published plugin wrote for a plain string next to a plural stays as it is", async () => {
		const files = {
			en: `{
\t"files_deleted": [
\t\t{
\t\t\t"declarations": ["input count", "local countPlural = count: plural"],
\t\t\t"selectors": ["countPlural"],
\t\t\t"match": {
\t\t\t\t"countPlural=one": "One file deleted",
\t\t\t\t"countPlural=*": "{count} files deleted"
\t\t\t}
\t\t}
\t]
}`,
			ja: `{
\t"files_deleted": [
\t\t{
\t\t\t"declarations": ["input count", "local countPlural = count: plural"],
\t\t\t"selectors": [],
\t\t\t"match": ["ファイルを削除しました"]
\t\t}
\t]
}`,
		};
		const project = await load(files);
		expect((await exportWhole(project)).ja).toContain(
			'"files_deleted": "ファイルを削除しました"'
		);
		expect(await exportWith(project, files)).toEqual(files);
	});

	test("declarations that another locale lists differently don't count as a change", async () => {
		const files = {
			en: `{
\t"invite": [{
\t\t"declarations": ["input count", "input gender", "local countPlural = count: plural"],
\t\t"selectors": ["countPlural", "gender"],
\t\t"match": {"countPlural=one, gender=*": "One guest", "countPlural=*, gender=*": "{count} guests"}
\t}]
}`,
			de: `{
\t"invite": [{
\t\t"declarations": ["input count", "local countPlural = count: plural"],
\t\t"selectors": ["countPlural"],
\t\t"match": {"countPlural=one": "Ein Gast", "countPlural=*": "{count} Gäste"}
\t}]
}`,
		};
		const project = await load(files);
		expect(await exportWith(project, files)).toEqual(files);
	});
});

/**
 * What a project reads from `texts`, without ids, to compare the result of
 * an export with the files with the full export.
 */
async function contentOf(texts: Record<string, string>) {
	const project = await load(texts);
	const bundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();
	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();
	const messageKey = new Map(
		messages.map((m) => [m.id, `${m.bundle_id}/${m.locale}`])
	);
	const sort = <T>(items: T[]) =>
		items
			.map((item) => JSON.stringify(item))
			.sort()
			.map((item) => JSON.parse(item));
	await project.close();
	return {
		bundles: sort(bundles.map((b) => [b.id, b.declarations])),
		messages: sort(messages.map((m) => [m.bundle_id, m.locale, m.selectors])),
		variants: sort(
			variants.map((v) => [messageKey.get(v.message_id), v.matches, v.pattern])
		),
	};
}

describe("edits", () => {
	test("only the edited entry changes", async () => {
		const project = await load(handWritten);
		await setText(project, "greeting", "de", "Guten Tag!");
		await setText(project, "legacy", "en", "New legacy text");
		const files = await exportWith(project, handWritten);
		expect(files.de).toBe(
			handWritten.de.replace(
				'"greeting": "Hallo {name}!"',
				'"greeting": "Guten Tag!"'
			)
		);
		// the edited legacy entry is written in the current form
		expect(files.en).toBe(
			handWritten.en.replace(
				'"legacy": [{ "selectors": [], "match": ["Legacy text"] }]',
				'"legacy": "New legacy text"'
			)
		);
	});

	test("an edited variant rewrites only its message", async () => {
		const project = await load(handWritten);
		await setText(project, "items", "de", "Ein Ding", { countPlural: "one" });
		const files = await exportWith(project, handWritten);
		expect(files.en).toBe(handWritten.en);
		expect(files.de).toBe(`{
\t"greeting": "Hallo {name}!",
\t"zebra": "Zebra",
\t"items": [
\t\t{
\t\t\t"declarations": [
\t\t\t\t"input count",
\t\t\t\t"local countPlural = count: plural"
\t\t\t],
\t\t\t"selectors": [
\t\t\t\t"countPlural"
\t\t\t],
\t\t\t"match": {
\t\t\t\t"countPlural=one": "Ein Ding",
\t\t\t\t"countPlural=other": "{count} Artikel"
\t\t\t}
\t\t}
\t],
\t"navigation": {
\t\t"home": "Startseite"
\t}
}`);
	});

	test("only the match of a variant changed", async () => {
		const project = await load(handWritten);
		const { variant } = await variantOf(project, "items", "en", {
			countPlural: "one",
		});
		await project.db
			.updateTable("inlang_variant")
			.set({
				matches: [{ type: "literal-match", key: "countPlural", value: "few" }],
			})
			.where("id", "=", variant.id)
			.execute();
		const files = await exportWith(project, handWritten);
		expect(files.de).toBe(handWritten.de);
		expect(files.en).toContain('"countPlural=few": "One item"');
		expect(files.en).not.toContain('"countPlural=one"');
		// nothing else of the file changed
		expect(files.en!.replace(/ {2}"items": \[[\s\S]*?\n {2}\],\n/, "")).toBe(
			handWritten.en.replace(/ {2}"items": \[[\s\S]*?\n {2}\],\n/, "")
		);
	});

	test("only a declaration changed: complex entries that write it change, plain strings don't", async () => {
		const files = {
			en: `{
\t"items": [{"declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"], "match": {"countPlural=one": "One", "countPlural=*": "{count}"}}]
}`,
			de: `{
\t"items": "{count} Artikel"
}`,
		};
		const project = await load(files);
		const bundle = await project.db
			.selectFrom("inlang_bundle")
			.where("id", "=", "items")
			.selectAll()
			.executeTakeFirstOrThrow();
		await project.db
			.updateTable("inlang_bundle")
			.set({
				declarations: bundle.declarations.map((declaration) =>
					declaration.type === "local-variable"
						? {
								...declaration,
								value: {
									...declaration.value,
									annotation: {
										type: "function-reference",
										name: "plural",
										options: [
											{
												name: "type",
												value: { type: "literal", value: "ordinal" },
											},
										],
									},
								},
							}
						: declaration
				) as typeof bundle.declarations,
			})
			.where("id", "=", "items")
			.execute();
		const result = await exportWith(project, files);
		expect(result.de).toBe(files.de);
		expect(result.en).toContain(
			'"local countPlural = count: plural type=ordinal"'
		);
	});

	test("an edited declaration is not brought back by a legacy entry of another locale", async () => {
		// The complex form that the published plugin wrote for a plain string
		// next to a plural carries the bundle's declarations. It is written as
		// the plain string, so it compares as unchanged, but its declarations
		// would bring back the old ones when the files are read again.
		const files = {
			en: `{
\t"invite": [
\t\t{
\t\t\t"declarations": ["input count", "input gender", "local countPlural = count: plural"],
\t\t\t"selectors": ["countPlural", "gender"],
\t\t\t"match": {
\t\t\t\t"countPlural=one, gender=*": "One guest",
\t\t\t\t"countPlural=*, gender=*": "{count} guests"
\t\t\t}
\t\t}
\t],
\t"other": "Other"
}`,
			ja: `{
\t"invite": [{"declarations": ["input count", "input gender", "local countPlural = count: plural"], "selectors": [], "match": ["{count} 人のゲスト"]}],
\t"other": "その他"
}`,
		};
		const project = await load(files);
		const bundle = await project.db
			.selectFrom("inlang_bundle")
			.where("id", "=", "invite")
			.selectAll()
			.executeTakeFirstOrThrow();
		await project.db
			.updateTable("inlang_bundle")
			.set({
				declarations: bundle.declarations.map((declaration) =>
					declaration.type === "local-variable"
						? {
								...declaration,
								value: {
									...declaration.value,
									annotation: {
										type: "function-reference",
										name: "plural",
										options: [
											{
												name: "type",
												value: { type: "literal", value: "ordinal" },
											},
										],
									},
								},
							}
						: declaration
				) as typeof bundle.declarations,
			})
			.where("id", "=", "invite")
			.execute();
		const result = await exportWith(project, files);
		expect(await contentOf(result as Record<string, string>)).toEqual(
			await contentOf((await exportWhole(project)) as Record<string, string>)
		);
		expect(result.en).toContain(
			"local countPlural = count: plural type=ordinal"
		);
	});

	test("only whitespace inside a pattern changed", async () => {
		const project = await load(handWritten);
		await setText(project, "zebra", "en", "Zebra ");
		const files = await exportWith(project, handWritten);
		expect(files.en).toBe(
			handWritten.en.replace('"zebra": "Zebra"', '"zebra": "Zebra "')
		);
	});

	test("the order of two variants that can both be selected changed", async () => {
		const en = `{
\t"shared": [{"declarations": ["input count", "input gender", "local countPlural = count: plural"], "selectors": ["countPlural", "gender"], "match": {"countPlural=*, gender=female": "She shared {count} files", "countPlural=one, gender=*": "They shared one file", "countPlural=*, gender=*": "They shared {count} files"}}]
}`;
		const project = await load({ en });
		// re-create the first variant, so that it comes after the second
		const { variant } = await variantOf(project, "shared", "en", {
			countPlural: "*",
			gender: "female",
		});
		await project.db
			.deleteFrom("inlang_variant")
			.where("id", "=", variant.id)
			.execute();
		await project.db
			.insertInto("inlang_variant")
			.values({
				id: "recreated",
				message_id: variant.message_id,
				matches: variant.matches,
				pattern: variant.pattern,
			})
			.execute();
		const whole = (await exportWhole(project)).en!;
		expect(whole.indexOf("countPlural=one, gender=*")).toBeLessThan(
			whole.indexOf("countPlural=*, gender=female")
		);
		const files = await exportWith(project, { en });
		expect(files.en).not.toBe(en);
		expect(files.en!.indexOf("countPlural=one, gender=*")).toBeLessThan(
			files.en!.indexOf("countPlural=*, gender=female")
		);
	});

	test("an added message goes after the message before it, a removed one is dropped", async () => {
		const project = await load(handWritten);
		await project.db
			.insertInto("inlang_bundle")
			.values({ id: "new_message", declarations: [] })
			.execute();
		await project.db
			.insertInto("inlang_message")
			.values({ id: "new_de", bundle_id: "new_message", locale: "de" })
			.execute();
		await project.db
			.insertInto("inlang_variant")
			.values({
				message_id: "new_de",
				pattern: [{ type: "text", value: "Neu" }],
			})
			.execute();
		const { message } = await variantOf(project, "zebra", "de");
		await project.db
			.deleteFrom("inlang_variant")
			.where("message_id", "=", message.id)
			.execute();
		await project.db
			.deleteFrom("inlang_message")
			.where("id", "=", message.id)
			.execute();
		const files = await exportWith(project, handWritten);
		expect(files.en).toBe(handWritten.en);
		expect(files.de).toBe(
			handWritten.de
				.replace('\t"zebra": "Zebra",\n', "")
				.replace(
					'\t"navigation": {\n\t\t"home": "Startseite"\n\t}\n',
					'\t"navigation": {\n\t\t"home": "Startseite"\n\t},\n\t"new_message": "Neu"\n'
				)
		);
	});

	test("with sort, a new message is inserted in sorted position", async () => {
		const en = '{\n\t"a": "A",\n\t"c": "C"\n}\n';
		const project = await load({ en }, { sort: "asc" });
		await project.db
			.insertInto("inlang_bundle")
			.values({ id: "b", declarations: [] })
			.execute();
		await project.db
			.insertInto("inlang_message")
			.values({ id: "b_en", bundle_id: "b", locale: "en" })
			.execute();
		await project.db
			.insertInto("inlang_variant")
			.values({ message_id: "b_en", pattern: [{ type: "text", value: "B" }] })
			.execute();
		expect((await exportWith(project, { en })).en).toBe(
			'{\n\t"a": "A",\n\t"b": "B",\n\t"c": "C"\n}\n'
		);
	});
	test("with sort, an edited message keeps the order of its variants", async () => {
		const en = `{
\t"b": [
\t\t{
\t\t\t"declarations": ["input gender"],
\t\t\t"selectors": ["gender"],
\t\t\t"match": {
\t\t\t\t"gender=male": "He",
\t\t\t\t"gender=female": "She",
\t\t\t\t"gender=*": "They"
\t\t\t}
\t\t}
\t],
\t"a": "A"
}
`;
		for (const sort of ["asc", "desc"]) {
			const project = await load({ en }, { sort });
			await setText(project, "b", "en", "Someone", { gender: "*" });
			const files = await exportWith(project, { en });
			// the edited message is written in full, its variants as they were
			expect(files.en, sort).toBe(
				en
					.replace(
						`"declarations": ["input gender"],
\t\t\t"selectors": ["gender"],`,
						`"declarations": [
\t\t\t\t"input gender"
\t\t\t],
\t\t\t"selectors": [
\t\t\t\t"gender"
\t\t\t],`
					)
					.replace('"They"', '"Someone"')
			);
			const whole = JSON.parse((await exportWhole(project)).en!);
			expect(Object.keys(whole.b[0].match), sort).toEqual([
				"gender=male",
				"gender=female",
				"gender=*",
			]);
			await project.close();
		}
	});
});

describe("without a usable previous file", () => {
	test("a pathPattern array keeps the formatting of each file as before", async () => {
		const a = '{\n\t"greeting": "Hello"\n}';
		const b = '{\n    "greeting": "Hello"\n}\n';
		const volume = Volume.fromJSON({
			"/repo/project.inlang/settings.json": JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				[PLUGIN_KEY]: {
					pathPattern: ["./a/{locale}.json", "./b/{locale}.json"],
				},
			}),
			"/repo/a/en.json": a,
			"/repo/b/en.json": b,
		});
		const project = await loadProjectFromDirectory({
			path: "/repo/project.inlang",
			fs: volume as any,
			providePlugins: [plugin as InlangPlugin],
		});
		await saveProjectToDirectory({
			path: "/repo/project.inlang",
			fs: volume.promises as any,
			project,
		});
		// the full export, indented like each file (not one file's bytes in both)
		expect(volume.readFileSync("/repo/b/en.json", "utf-8")).toBe(
			'{\n    "$schema": "https://inlang.com/schema/inlang-message-format",\n    "greeting": "Hello"\n}\n'
		);
		expect(volume.readFileSync("/repo/a/en.json", "utf-8")).toBe(
			'{\n\t"$schema": "https://inlang.com/schema/inlang-message-format",\n\t"greeting": "Hello"\n}'
		);
	});

	test("a new locale is written like the full export", async () => {
		const project = await load(handWritten);
		const files = await exportWith(project, { en: handWritten.en });
		expect(files.de).toBe((await exportWhole(project)).de);
		expect(files.en).toBe(handWritten.en);
	});

	test("an invalid previous file is replaced by the full export", async () => {
		const project = await load(handWritten);
		const files = await project.exportFiles({
			pluginKey: PLUGIN_KEY,
			files: [
				{
					path: "./messages/de.json",
					locale: "de",
					content: encode('<<<<<<< HEAD\n{"greeting": "x"}'),
				},
			],
		});
		const de = files.find((file) => file.locale === "de")!;
		expect(decode(de.content)).toBe((await exportWhole(project)).de);
		expect(de.verbatim).toBeUndefined();
	});

	test("without files the export is the whole-file export", async () => {
		const project = await load(handWritten);
		const { bundles, messages, variants } = await rows(project);
		const settings = await project.settings.get();
		expect(
			(
				await plugin.exportFiles!({ bundles, messages, variants, settings })
			).map((file) => decode(file.content))
		).toEqual(
			(await exportWholeFiles({ bundles, messages, variants, settings })).map(
				(file) => decode(file.content)
			)
		);
	});
});

test("saveProjectToDirectory leaves unchanged files untouched and changes only the edited line", async () => {
	const volume = Volume.fromJSON({
		"/repo/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [],
			[PLUGIN_KEY]: { pathPattern: "./messages/{locale}.json" },
		}),
		"/repo/messages/en.json": handWritten.en,
		"/repo/messages/de.json": handWritten.de,
	});
	const project = await loadProjectFromDirectory({
		path: "/repo/project.inlang",
		fs: volume as any,
		providePlugins: [plugin as InlangPlugin],
	});
	await saveProjectToDirectory({
		path: "/repo/project.inlang",
		fs: volume.promises as any,
		project,
	});
	expect(volume.readFileSync("/repo/messages/en.json", "utf-8")).toBe(
		handWritten.en
	);
	expect(volume.readFileSync("/repo/messages/de.json", "utf-8")).toBe(
		handWritten.de
	);

	await setText(project, "greeting", "en", "Hi!");
	await saveProjectToDirectory({
		path: "/repo/project.inlang",
		fs: volume.promises as any,
		project,
	});
	expect(volume.readFileSync("/repo/messages/en.json", "utf-8")).toBe(
		handWritten.en.replace(
			'"greeting":   "Hello {name}!"',
			'"greeting":   "Hi!"'
		)
	);
	expect(volume.readFileSync("/repo/messages/de.json", "utf-8")).toBe(
		handWritten.de
	);
});

async function rows(project: InlangProject) {
	const [bundles, messages, variants] = await Promise.all([
		project.db.selectFrom("inlang_bundle").selectAll().execute(),
		project.db.selectFrom("inlang_message").selectAll().execute(),
		project.db.selectFrom("inlang_variant").selectAll().execute(),
	]);
	return {
		bundles,
		messages: messages.map(({ bundle_id, ...message }) => ({
			...message,
			bundleId: bundle_id,
		})),
		variants: variants.map(({ message_id, ...variant }) => ({
			...variant,
			messageId: message_id,
		})),
	};
}
