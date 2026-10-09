import { afterAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type Project,
	type Version,
	contentOf,
	decode,
	encode,
	importPlugin,
	insertRows,
	loadFromDirectory,
	plugins,
	saveToDirectory,
	selectRows,
	servePlugins,
	tables,
} from "./harness.js";
import { editorSpecs, rowsFromSpecs } from "./editorRows.js";
import {
	type Fixture,
	exportFixtureFiles,
	fixtures,
	fixturesDir,
	openFixtureProject,
	readSourceFiles,
	settingsFor,
	upgrades,
} from "./fixtures.js";

/**
 * With SDK 4, `exportFiles` gets the files it overwrites. The current
 * plugins then keep the text of every message that didn't change, so that
 * saving a project changes no bytes beyond the edits, whatever wrote the
 * files: a person, the published plugin or another tool.
 */

type Texts = Record<string, string>;

/**
 * The files as `toBeImportedFiles` of the current plugin lists them, with
 * the content of `texts` by locale.
 */
async function existingFiles(fixture: Fixture, texts: Texts) {
	const plugin = await importPlugin(fixture.key, "current");
	const plans: Array<{
		path: string;
		locale: string;
		metadata?: Record<string, unknown>;
	}> = await plugin.toBeImportedFiles({ settings: settingsFor(fixture) });
	return plans
		.filter((plan) => texts[plan.locale] !== undefined)
		.map((plan) => ({ ...plan, content: encode(texts[plan.locale]!) }));
}

/** A current project with `texts` imported, by locale. */
async function load(fixture: Fixture, texts: Texts): Promise<Project> {
	const project = await openFixtureProject(fixture, "current", "current");
	await project.importFiles({
		pluginKey: fixture.key,
		files: Object.entries(texts).map(([locale, text]) => ({
			locale,
			content: encode(text),
		})),
	});
	return project;
}

/** Exports with `previous` as the existing files; texts by locale. */
async function exportWith(
	project: Project,
	fixture: Fixture,
	previous: Texts
): Promise<Texts> {
	const files = await (project.exportFiles as any)({
		pluginKey: fixture.key,
		files: await existingFiles(fixture, previous),
	});
	return Object.fromEntries(
		files.map((file: { locale: string; content: Uint8Array }) => [
			file.locale,
			decode(file.content),
		])
	);
}

const sourceTexts = (fixture: Fixture): Texts =>
	Object.fromEntries(
		readSourceFiles(fixture).map((file) => [file.locale, decode(file.content)])
	);

/** The files the published SDK and plugin write for the source files. */
async function publishedTexts(fixture: Fixture): Promise<Texts> {
	const project = await openFixtureProject(fixture, "published", "published");
	await project.importFiles({
		pluginKey: fixture.key,
		files: readSourceFiles(fixture),
	});
	const files = await exportFixtureFiles(project, fixture);
	await project.close();
	return Object.fromEntries(files.map((file) => [file.locale, file.content]));
}

/**
 * A message of `locale` with a single variant without matches, the kind
 * every plugin writes as one entry; one that is only text if there is one.
 * `text` is the text it starts with.
 */
async function plainMessage(project: Project, locale: string) {
	const t = tables(project.version);
	const messages = await project.db
		.selectFrom(t.message)
		.where("locale", "=", locale)
		.selectAll()
		.execute();
	const candidates = [];
	for (const message of messages) {
		const variants = await project.db
			.selectFrom(t.variant)
			.where(t.messageId, "=", message.id)
			.selectAll()
			.execute();
		const [variant] = variants;
		if (
			variants.length === 1 &&
			message.selectors.length === 0 &&
			variant.matches.length === 0 &&
			variant.pattern[0]?.type === "text" &&
			/^[\w !.,]+$/.test(variant.pattern[0].value)
		) {
			candidates.push({
				message,
				variant,
				bundleId: message[t.bundleId] as string,
				text: (variant.pattern[0].value as string).trim(),
				onlyText: variant.pattern.length === 1,
			});
		}
	}
	const result =
		candidates.find((candidate) => candidate.onlyText) ?? candidates[0];
	if (result === undefined) throw new Error(`No plain message in ${locale}`);
	return result;
}

/**
 * The lines in which `after` differs from `before`, after removing the
 * lines both have at the start and at the end.
 */
function changedLines(before: string, after: string) {
	const a = before.split("\n");
	const b = after.split("\n");
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) {
		start++;
	}
	let end = 0;
	while (
		end < a.length - start &&
		end < b.length - start &&
		a[a.length - 1 - end] === b[b.length - 1 - end]
	) {
		end++;
	}
	return {
		before: a.slice(start, a.length - end),
		after: b.slice(start, b.length - end),
	};
}

describe.each(fixtures)("$dir", (fixture) => {
	const baseLocale = settingsFor(fixture).baseLocale;

	test("hand-written files stay byte-identical when exported with them", async () => {
		const texts = sourceTexts(fixture);
		const project = await load(fixture, texts);
		expect(await exportWith(project, fixture, texts)).toEqual(texts);
		await project.close();
	});

	test("files written by the published plugin stay byte-identical when exported with them", async () => {
		const texts = await publishedTexts(fixture);
		const project = await load(fixture, texts);
		expect(await exportWith(project, fixture, texts)).toEqual(texts);
		await project.close();
	});

	test("upgrading changes no bytes: a database of the published SDK exported with the files the published plugin wrote", async () => {
		const project = await openFixtureProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		await insertRows(
			project,
			rowsFromSpecs(
				editorSpecs.filter((spec) => fixture.editorBundles.includes(spec.id)),
				fixture.dir,
				"editor_"
			)
		);
		const written = Object.fromEntries(
			(await exportFixtureFiles(project, fixture)).map((file) => [
				file.locale,
				file.content,
			])
		);
		const blob = await project.toBlob();
		await project.close();

		const upgraded = await openFixtureProject(
			fixture,
			"current",
			"current",
			blob
		);
		expect(await exportWith(upgraded, fixture, written)).toEqual(written);
		await upgraded.close();
	});

	test("an edited message changes only its entry", async () => {
		const texts = sourceTexts(fixture);
		const project = await load(fixture, texts);
		const { variant, text } = await plainMessage(project, baseLocale);
		const t = tables(project.version);
		await project.db
			.updateTable(t.variant)
			.set({ pattern: [{ type: "text", value: "EDITED VALUE" }] })
			.where("id", "=", variant.id)
			.execute();

		const result = await exportWith(project, fixture, texts);
		for (const [locale, before] of Object.entries(texts)) {
			// xcstrings has one file for all locales
			const after = result[locale];
			if (after === undefined) continue;
			if (after === before) continue;
			const changed = changedLines(before, after);
			expect(changed.before.length, locale).toBeLessThanOrEqual(1);
			expect(changed.after.length, locale).toBe(changed.before.length);
			expect(changed.before.join("\n")).toContain(text);
			expect(changed.after.join("\n")).toContain("EDITED VALUE");
		}
		expect(Object.values(result).join("\n")).toContain("EDITED VALUE");
		await project.close();
	});

	test("an added message is added, a removed message is removed, nothing else changes", async () => {
		const texts = sourceTexts(fixture);
		const project = await load(fixture, texts);
		const t = tables(project.version);
		const removed = await plainMessage(project, baseLocale);
		await project.db
			.deleteFrom(t.variant)
			.where(t.messageId, "=", removed.message.id)
			.execute();
		await project.db
			.deleteFrom(t.message)
			.where("id", "=", removed.message.id)
			.execute();
		await project.db
			.insertInto(t.bundle)
			.values({ id: "added_message", declarations: [] })
			.execute();
		await project.db
			.insertInto(t.message)
			.values({
				id: "added_message_en",
				[t.bundleId]: "added_message",
				locale: baseLocale,
				selectors: [],
			})
			.execute();
		await project.db
			.insertInto(t.variant)
			.values({
				id: "added_message_en_variant",
				[t.messageId]: "added_message_en",
				matches: [],
				pattern: [{ type: "text", value: "ADDED VALUE" }],
			})
			.execute();

		const result = await exportWith(project, fixture, texts);
		const before = Object.values(texts).join("\n");
		const after = Object.values(result).join("\n");
		expect(after).toContain("ADDED VALUE");
		// every line of the files is kept in order, except the removed message
		const beforeLines = before.split("\n");
		const afterLines = new Set(after.split("\n"));
		const missing = beforeLines.filter((line) => !afterLines.has(line));
		expect(missing.join("\n")).toContain(removed.text);
		// the entry, and the braces of a nested object that became empty
		expect(missing.length).toBeLessThanOrEqual(3);
		// and only the added lines are new
		const beforeSet = new Set(beforeLines);
		const added = after.split("\n").filter((line) => !beforeSet.has(line));
		expect(added.join("\n")).toContain("ADDED VALUE");
		expect(added.length).toBeLessThanOrEqual(
			fixture.dir === "android" ? 2 : 14
		);
		await project.close();
	});
});

/**
 * Files in shapes that the plugins read but don't write, and odd
 * formatting. Exported with them, they stay as they are.
 */
const legacy: Array<{ dir: string; texts: Texts; edit?: string }> = [
	{
		// the complex form without selectors that the published plugin wrote
		// for a plain string next to a plural, `selectors: []`, `other`
		// instead of `*`, inline arrays, no `$schema`, CRLF
		dir: "message-format",
		texts: {
			en: [
				"{",
				'  "zebra":"Z",',
				'  "files_deleted": [',
				"    {",
				'      "declarations": ["input count", "local countPlural = count: plural"],',
				'      "selectors": ["countPlural"],',
				'      "match": { "countPlural=one": "One file deleted", "countPlural=other": "{count} files deleted" }',
				"    }",
				"  ],",
				'  "apple" : "Apple \\u00e9"',
				"}",
				"",
			].join("\r\n"),
			de: [
				"{",
				'\t"files_deleted": [{"declarations": ["input count", "local countPlural = count: plural"], "selectors": [], "match": ["Dateien gelöscht"]}],',
				'\t"zebra": "Z"',
				"}",
			].join("\n"),
		},
	},
	{
		// `_zero` before, between and apart from its plural forms
		dir: "i18next",
		texts: {
			en: [
				"{",
				'    "item_zero": "No items",',
				'    "item_one": "{{count}} item",',
				'    "between": "Between",',
				'    "item_other": "{{count}} items",',
				'    "nested": {"b": "B", "a": "A"},',
				'    "box_one": "{{count}} box",',
				'    "box_other": "{{count}} boxes",',
				'    "box_zero": "No boxes"',
				"}",
			].join("\n"),
			de: '{"item_one":"{{count}} Ding","item_other":"{{count}} Dinge","item_zero":"Keine Dinge","between":"Dazwischen","nested":{"a":"A","b":"B"}}\n',
		},
	},
	{
		dir: "icu1",
		texts: {
			en: '{\n  "plain":  "Plain text",\n  "items": "{count,plural,one{# item}other{# items}}",\n  "apos": "Don\'t",\n  "a":"{ n , number }"\n}\n',
			de: '{\n\t"apos": "Geht nicht",\n\t"items": "{count, plural, one {# Ding} other {# Dinge}}"\n}',
		},
	},
];

describe.each(legacy)("legacy shapes: $dir", ({ dir, texts }) => {
	const fixture = fixtures.find((candidate) => candidate.dir === dir)!;

	test("stay byte-identical when exported with them", async () => {
		const project = await load(fixture, texts);
		// a full export would rewrite them
		const whole = await exportFixtureFiles(project, fixture);
		expect(
			Object.fromEntries(whole.map((file) => [file.locale, file.content]))
		).not.toEqual(texts);
		expect(await exportWith(project, fixture, texts)).toEqual(texts);
		await project.close();
	});

	test("an edit changes only the edited entry", async () => {
		const project = await load(fixture, texts);
		const locale = Object.keys(texts)[0]!;
		const { variant, text } = await plainMessage(project, locale);
		await project.db
			.updateTable("inlang_variant")
			.set({ pattern: [{ type: "text", value: "EDITED VALUE" }] })
			.where("id", "=", variant.id)
			.execute();
		const result = await exportWith(project, fixture, texts);
		for (const [other, before] of Object.entries(texts)) {
			if (other !== locale) expect(result[other]).toBe(before);
		}
		expect(result[locale]).toBe(
			texts[locale]!.replace(
				new RegExp(`"${text}"`),
				JSON.stringify("EDITED VALUE")
			)
		);
		await project.close();
	});
});

/**
 * Catalogs as Xcode writes them (`xcstringstool sync` writes them byte for
 * byte): strings extracted from code that nobody translated yet (`{ }` with
 * a blank line), only a `comment`, `shouldTranslate: false`, a manual string
 * with only a `comment`, a stale translated string, strings translated to
 * `de` only, a plural and a manual string with an `en` value. Version 1.1 is
 * what Xcode 26 writes as soon as a string has `isCommentAutoGenerated`.
 *
 * Not part of `fixtures`: the published plugin can't import strings without
 * localizations (nor version 1.1), so there are no files or databases it
 * wrote for them.
 */
/** The version of the published plugin that the compat tests compare with. */
const publishedXcstrings = JSON.parse(
	fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
).devDependencies["published-plugin-apple-xcstrings"] as string;

describe.each(["Localizable.xcstrings", "Localizable-1.1.xcstrings"])(
	"apple-xcstrings: a catalog as Xcode writes it (%s)",
	(name) => {
		const fixture = fixtures.find((f) => f.dir === "apple-xcstrings")!;
		const xcode = fs.readFileSync(
			path.join(fixturesDir, fixture.dir, "xcode", name),
			"utf-8"
		);
		const texts = { en: xcode };

		// Documents why the catalogs aren't in `fixtures`. A published release
		// with the fix can import them: then this test is skipped, and the
		// catalogs can become fixtures.
		test.runIf(publishedXcstrings.endsWith("@0.2.7"))(
			"the published plugin can't import it",
			async () => {
				const project = await openFixtureProject(
					fixture,
					"published",
					"published"
				);
				await expect(
					project.importFiles({
						pluginKey: fixture.key,
						files: [{ locale: "en", content: encode(xcode) }],
					})
				).rejects.toThrow();
				await project.close();
			}
		);

		test.each(upgrades)(
			"is imported by the $plugin plugin on the $sdk SDK, with the key as the source language value of strings without one",
			async ({ sdk, plugin }) => {
				const project = await openFixtureProject(fixture, sdk, plugin);
				await project.importFiles({
					pluginKey: fixture.key,
					files: [{ locale: "en", content: encode(xcode) }],
				});
				const rows = contentOf(await selectRows(project));
				const strings = Object.keys(JSON.parse(xcode).strings);
				expect(rows.bundles.map((bundle) => bundle.id).sort()).toEqual(
					[...strings].sort()
				);
				// every string has a source language message
				for (const id of strings) {
					expect(
						rows.messages.some((message) => message.key === `${id}/en`),
						id
					).toBe(true);
				}
				await project.close();
			}
		);

		test("stays byte-identical when exported with it", async () => {
			const project = await load(fixture, texts);
			expect(await exportWith(project, fixture, texts)).toEqual(texts);
			await project.close();
		});

		test("an edited translation changes only its line", async () => {
			const project = await load(fixture, texts);
			await setPattern(project, "settings.title", "de", "EDITED VALUE");
			const result = await exportWith(project, fixture, texts);
			expect(changedLines(xcode, result.en!)).toEqual({
				before: ['            "value" : "Einstellungen"'],
				after: ['            "value" : "EDITED VALUE"'],
			});
			await project.close();
		});

		test("translating a string without localizations adds only its translation", async () => {
			const project = await load(fixture, texts);
			const t = tables(project.version);
			await project.db
				.insertInto(t.message)
				.values({
					id: "not_yet_translated_de",
					[t.bundleId]: "Not yet translated",
					locale: "de",
					selectors: [],
				})
				.execute();
			await project.db
				.insertInto(t.variant)
				.values({
					id: "not_yet_translated_de_variant",
					[t.messageId]: "not_yet_translated_de",
					matches: [],
					pattern: [{ type: "text", value: "Noch nicht übersetzt" }],
				})
				.execute();
			const result = await exportWith(project, fixture, texts);
			expect(changedLines(xcode, result.en!)).toEqual({
				// the blank line of Xcode's empty object
				before: [""],
				after: [
					'      "localizations" : {',
					'        "de" : {',
					'          "stringUnit" : {',
					'            "state" : "translated",',
					'            "value" : "Noch nicht übersetzt"',
					"          }",
					"        }",
					"      }",
				],
			});
			await project.close();
		});

		test("the published SDK, which doesn't pass the existing file, writes every string and doesn't add the key as a value", async () => {
			const project = await openFixtureProject(fixture, "published", "current");
			await project.importFiles({
				pluginKey: fixture.key,
				files: [{ locale: "en", content: encode(xcode) }],
			});
			const [file] = await exportFixtureFiles(project, fixture);
			await project.close();
			const before = JSON.parse(xcode).strings;
			const after = JSON.parse(file!.content).strings;
			expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
			for (const [id, entry] of Object.entries<any>(before)) {
				// the same locales, e.g. none for strings without localizations
				expect(Object.keys(after[id].localizations ?? {}), id).toEqual(
					Object.keys(entry.localizations ?? {})
				);
			}
		});
	}
);

/** Sets the pattern of the message of `bundleId` in `locale` to text. */
async function setPattern(
	project: Project,
	bundleId: string,
	locale: string,
	text: string
) {
	const t = tables(project.version);
	const message = await project.db
		.selectFrom(t.message)
		.where(t.bundleId, "=", bundleId)
		.where("locale", "=", locale)
		.select("id")
		.executeTakeFirstOrThrow();
	await project.db
		.updateTable(t.variant)
		.set({ pattern: [{ type: "text", value: text }] })
		.where(t.messageId, "=", message.id)
		.execute();
}

/**
 * i18next namespaces are the keys of a `pathPattern` record and can contain
 * `:`, the separator of the namespace and the key in bundle ids
 * (`common:legacy:title` is `title` of `common:legacy`). Saving a project
 * writes every namespace to its own file, on the current SDK and on the
 * published SDK, which loads the current plugin from `settings.modules`.
 */
describe("i18next namespaces with `:`", () => {
	const translationFiles: Record<string, string> = {
		"locales/en/common.json": '{\n  "title": "Common"\n}\n',
		"locales/en/common-legacy.json":
			'{\n    "title":  "Legacy",\n    "err:notFound": "Not found",\n    "item_one": "One item",\n    "item_other": "{{count}} items"\n}\n',
		"locales/de/common-legacy.json":
			'{\n\t"title": "Alt",\n\t"err:notFound": "Nicht gefunden"\n}\n',
		"locales/en/app-errors.json": '{\n  "notFound": "App not found"\n}\n',
	};
	const settingsJson = JSON.stringify(
		{
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [plugins["plugin.inlang.i18next"].url],
			"plugin.inlang.i18next": {
				pathPattern: {
					common: "./locales/{locale}/common.json",
					"common:legacy": "./locales/{locale}/common-legacy.json",
					"app:errors": "./locales/{locale}/app-errors.json",
				},
			},
		},
		undefined,
		2
	);

	const roots: string[] = [];
	afterAll(() => {
		for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
	});

	function createDirectory() {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-compat-ns-"));
		roots.push(root);
		for (const [file, text] of Object.entries(translationFiles)) {
			fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
			fs.writeFileSync(path.join(root, file), text);
		}
		fs.mkdirSync(path.join(root, "project.inlang"));
		fs.writeFileSync(
			path.join(root, "project.inlang/settings.json"),
			settingsJson
		);
		return { root, projectPath: path.join(root, "project.inlang") };
	}

	/** the files outside the project directory */
	function translationFilesIn(root: string): Record<string, string> {
		return Object.fromEntries(
			(fs.readdirSync(root, { recursive: true }) as string[])
				.filter(
					(file) =>
						!file.startsWith("project.inlang") &&
						fs.statSync(path.join(root, file)).isFile()
				)
				.sort()
				.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
		);
	}

	async function open(sdk: Version, projectPath: string) {
		servePlugins("current");
		const project = await loadFromDirectory(sdk, { path: projectPath, fs });
		expect(await project.errors.get()).toEqual([]);
		return project;
	}

	test("the current plugin reads them like the published plugin", async () => {
		const { projectPath } = createDirectory();
		const current = await open("current", projectPath);
		servePlugins("published");
		const published = await loadFromDirectory("published", {
			path: projectPath,
			fs,
		});
		expect(contentOf(await selectRows(current))).toEqual(
			contentOf(await selectRows(published))
		);
		expect(
			(await selectRows(current)).bundles.map((bundle) => bundle.id).sort()
		).toEqual([
			"app:errors:notFound",
			"common:legacy:err:notFound",
			"common:legacy:item",
			"common:legacy:title",
			"common:title",
		]);
		await current.close();
		await published.close();
	});

	test.each(["current", "published"] as const)(
		"saving without edits writes each namespace to its own file (%s SDK)",
		async (sdk) => {
			const { root, projectPath } = createDirectory();
			const project = await open(sdk, projectPath);
			const before = contentOf(await selectRows(project));
			await saveToDirectory(sdk, { path: projectPath, fs, project });
			await project.close();
			const after = translationFilesIn(root);
			if (sdk === "current") {
				// the current SDK passes the files: byte-identical
				expect(after).toEqual(translationFiles);
			} else {
				// the published SDK doesn't: whole files, the same JSON
				expect(Object.keys(after)).toEqual(
					Object.keys(translationFiles).sort()
				);
				for (const [file, text] of Object.entries(translationFiles)) {
					expect(JSON.parse(after[file]!), file).toEqual(JSON.parse(text));
				}
			}
			const reopened = await open(sdk, projectPath);
			expect(contentOf(await selectRows(reopened))).toEqual(before);
			await reopened.close();
		}
	);

	test.each(["current", "published"] as const)(
		"an edit is written to the file of its namespace (%s SDK)",
		async (sdk) => {
			const { root, projectPath } = createDirectory();
			const project = await open(sdk, projectPath);
			const t = tables(sdk);
			const message = await project.db
				.selectFrom(t.message)
				.where(t.bundleId, "=", "common:legacy:title")
				.where("locale", "=", "de")
				.selectAll()
				.executeTakeFirstOrThrow();
			await project.db
				.updateTable(t.variant)
				.set({ pattern: [{ type: "text", value: "Veraltet" }] })
				.where(t.messageId, "=", message.id)
				.execute();
			await saveToDirectory(sdk, { path: projectPath, fs, project });
			await project.close();
			const after = translationFilesIn(root);
			expect(Object.keys(after)).toEqual(Object.keys(translationFiles).sort());
			const legacyDe = "locales/de/common-legacy.json";
			if (sdk === "current") {
				expect(after).toEqual({
					...translationFiles,
					[legacyDe]: translationFiles[legacyDe]!.replace(
						'"Alt"',
						'"Veraltet"'
					),
				});
			} else {
				expect(JSON.parse(after[legacyDe]!)).toEqual({
					title: "Veraltet",
					"err:notFound": "Nicht gefunden",
				});
			}
		}
	);
});

/**
 * A `res/values/strings.xml` and `res/values-de/strings.xml` like real
 * Android apps have them: the `tools` namespace with `tools:locale` and
 * `tools:ignore`, non-translatable strings and plurals (app name, URLs,
 * keys), `formatted="false"`, `<string-array>`s and comments.
 */
describe("android: a real-world res/values/strings.xml", () => {
	const fixture = fixtures.find((candidate) => candidate.dir === "android")!;
	const read = (file: string) =>
		fs.readFileSync(
			path.join(fixturesDir, "android-real-world", "source", file),
			"utf8"
		);
	const texts: Texts = {
		en: read("values/strings.xml"),
		de: read("values-de/strings.xml"),
	};
	const nonTranslatable = [
		"app_name",
		"privacy_policy_url",
		"maps_api_key",
		"deep_link_scheme",
		"debug_cache_entries",
		"settings_version",
	];

	test("imports the translatable strings and plurals", async () => {
		const project = await load(fixture, texts);
		const t = tables(project.version);
		const messages = await project.db
			.selectFrom(t.message)
			.select([t.bundleId, "locale"])
			.execute();
		const ids = (locale: string) =>
			messages
				.filter((message: any) => message.locale === locale)
				.map((message: any) => message[t.bundleId])
				.sort();
		expect(ids("en")).toEqual([
			"notes_count",
			"notes_deleted",
			"notes_empty",
			"notes_search_hint",
			"notes_storage",
			"notes_synced_at",
			"onboarding_continue",
			"onboarding_subtitle",
			"onboarding_title",
			"settings_theme",
			"settings_title",
		]);
		expect(ids("de")).toEqual([
			"notes_count",
			"notes_empty",
			"notes_synced_at",
			"onboarding_continue",
			"onboarding_subtitle",
			"onboarding_title",
			"settings_title",
		]);
		await project.close();
	});

	test("stays byte-identical when exported with the files", async () => {
		const project = await load(fixture, texts);
		expect(await exportWith(project, fixture, texts)).toEqual(texts);
		await project.close();
	});

	test("an edited message changes only its content and keeps its attributes", async () => {
		const project = await load(fixture, texts);
		const t = tables(project.version);
		const edit = async (bundleId: string, locale: string, value: string) => {
			const message = await project.db
				.selectFrom(t.message)
				.where(t.bundleId, "=", bundleId)
				.where("locale", "=", locale)
				.select("id")
				.executeTakeFirstOrThrow();
			await project.db
				.updateTable(t.variant)
				.set({ pattern: [{ type: "text", value }] })
				.where(t.messageId, "=", message.id)
				.execute();
		};
		await edit("notes_empty", "en", "No notes yet");
		await edit("onboarding_continue", "de", "Los geht's");
		expect(await exportWith(project, fixture, texts)).toEqual({
			en: texts.en!.replace(
				`<string name="notes_empty" tools:ignore="UnusedResources">You don\\'t have any notes yet.</string>`,
				`<string name="notes_empty" tools:ignore="UnusedResources">"No notes yet"</string>`
			),
			de: texts.de!.replace(
				`<string name="onboarding_continue">Weiter</string>`,
				`<string name="onboarding_continue">"Los geht\\'s"</string>`
			),
		});
		await project.close();
	});

	test("a project directory: saving without edits keeps the files, an edit changes only its element, in res/values and res/values-de", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-android-"));
		try {
			const projectPath = path.join(root, "project.inlang");
			fs.mkdirSync(projectPath);
			fs.writeFileSync(
				path.join(projectPath, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales: ["en", "de"],
					modules: [plugins[fixture.key].url],
					[fixture.key]: fixture.pluginSettings,
				})
			);
			const files = {
				en: path.join(root, "res/values/strings.xml"),
				de: path.join(root, "res/values-de/strings.xml"),
			};
			for (const [locale, file] of Object.entries(files)) {
				fs.mkdirSync(path.dirname(file), { recursive: true });
				fs.writeFileSync(file, texts[locale]!);
			}
			const onDisk = () =>
				Object.fromEntries(
					Object.entries(files).map(([locale, file]) => [
						locale,
						fs.readFileSync(file, "utf8"),
					])
				);

			servePlugins("current");
			const project = await loadFromDirectory("current", {
				path: projectPath,
				fs,
			});
			expect(await project.errors.get()).toEqual([]);
			await saveToDirectory("current", { path: projectPath, fs, project });
			expect(onDisk()).toEqual(texts);

			const t = tables(project.version);
			const message = await project.db
				.selectFrom(t.message)
				.where(t.bundleId, "=", "settings_title")
				.where("locale", "=", "de")
				.select("id")
				.executeTakeFirstOrThrow();
			await project.db
				.updateTable(t.variant)
				.set({ pattern: [{ type: "text", value: "Optionen" }] })
				.where(t.messageId, "=", message.id)
				.execute();
			await saveToDirectory("current", { path: projectPath, fs, project });
			expect(onDisk()).toEqual({
				en: texts.en,
				de: texts.de!.replace(">Einstellungen<", '>"Optionen"<'),
			});
			// no files where `{locale}` is the locale instead of the qualifier
			expect(fs.readdirSync(path.join(root, "res")).sort()).toEqual([
				"values",
				"values-de",
			]);
			await project.close();
		} finally {
			servePlugins("published");
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test.each(upgrades)(
		"a full export (no existing files, e.g. SDK $sdk with plugin $plugin) writes no non-translatable resource",
		async ({ sdk, plugin }) => {
			const project = await openFixtureProject(fixture, sdk, plugin);
			await project.importFiles({
				pluginKey: fixture.key,
				files: Object.entries(texts).map(([locale, text]) => ({
					locale,
					content: encode(text),
				})),
			});
			const files = await exportFixtureFiles(project, fixture);
			expect(files.map((file) => file.locale).sort()).toEqual(["de", "en"]);
			for (const file of files) {
				for (const name of nonTranslatable) {
					expect(file.content).not.toContain(`name="${name}"`);
				}
			}
			await project.close();
		}
	);
});

describe("android: locale qualifiers in a project directory", () => {
	const fixture = fixtures.find((candidate) => candidate.dir === "android")!;
	const en = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="title">Title</string>
    <string name="body">Body</string>
</resources>
`;
	const pt = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="title">Título</string>
</resources>
`;

	/** Runs `fn` with a project directory of `files` (paths under `res/`). */
	async function withDirectory(
		locales: string[],
		files: Record<string, string>,
		fn: (args: {
			project: Project;
			save: () => Promise<void>;
			read: () => Record<string, string>;
		}) => Promise<void>
	) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-android-"));
		try {
			const projectPath = path.join(root, "project.inlang");
			fs.mkdirSync(projectPath);
			fs.writeFileSync(
				path.join(projectPath, "settings.json"),
				JSON.stringify({
					baseLocale: "en",
					locales,
					modules: [plugins[fixture.key].url],
					[fixture.key]: fixture.pluginSettings,
				})
			);
			for (const [file, content] of Object.entries(files)) {
				fs.mkdirSync(path.dirname(path.join(root, "res", file)), {
					recursive: true,
				});
				fs.writeFileSync(path.join(root, "res", file), content);
			}
			servePlugins("current");
			const project = await loadFromDirectory("current", {
				path: projectPath,
				fs,
			});
			expect(await project.errors.get()).toEqual([]);
			await fn({
				project,
				save: () =>
					saveToDirectory("current", { path: projectPath, fs, project }),
				read: () =>
					Object.fromEntries(
						fs
							.readdirSync(path.join(root, "res"), { recursive: true })
							.map(String)
							.filter((file) => file.endsWith(".xml"))
							.sort()
							.map((file) => [
								file,
								fs.readFileSync(path.join(root, "res", file), "utf8"),
							])
					),
			});
			await project.close();
		} finally {
			servePlugins("published");
			fs.rmSync(root, { recursive: true, force: true });
		}
	}

	test.each(["values-pt-rBR", "values-b+pt+BR"])(
		"pt-BR in %s is imported, kept and written to its file",
		async (dir) => {
			const files = {
				"values/strings.xml": en,
				[`${dir}/strings.xml`]: pt,
			};
			await withDirectory(["en", "pt-BR"], files, async (p) => {
				const t = tables(p.project.version);
				const message = await p.project.db
					.selectFrom(t.message)
					.where(t.bundleId, "=", "title")
					.where("locale", "=", "pt-BR")
					.select("id")
					.executeTakeFirstOrThrow();
				await p.save();
				expect(p.read()).toEqual(files);
				await p.project.db
					.updateTable(t.variant)
					.set({ pattern: [{ type: "text", value: "Titulo" }] })
					.where(t.messageId, "=", message.id)
					.execute();
				await p.save();
				expect(p.read()).toEqual({
					...files,
					[`${dir}/strings.xml`]: pt.replace(">Título<", '>"Titulo"<'),
				});
			});
		}
	);

	test("new locales are written to the qualifiers as Android Studio writes them", async () => {
		await withDirectory(
			["en", "pt-BR", "es-419", "zh-Hans"],
			{ "values/strings.xml": en },
			async (p) => {
				const t = tables(p.project.version);
				for (const locale of ["pt-BR", "es-419", "zh-Hans"]) {
					await p.project.db
						.insertInto(t.message)
						.values({
							id: `title_${locale}`,
							[t.bundleId]: "title",
							locale,
							selectors: [],
						})
						.execute();
					await p.project.db
						.insertInto(t.variant)
						.values({
							id: `title_${locale}_variant`,
							[t.messageId]: `title_${locale}`,
							matches: [],
							pattern: [{ type: "text", value: `Title ${locale}` }],
						})
						.execute();
				}
				await p.save();
				const written = (locale: string) =>
					`<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="title">"Title ${locale}"</string>\n</resources>\n`;
				expect(p.read()).toEqual({
					"values-b+es+419/strings.xml": written("es-419"),
					"values-b+zh+Hans/strings.xml": written("zh-Hans"),
					"values-pt-rBR/strings.xml": written("pt-BR"),
					"values/strings.xml": en,
				});
			}
		);
	});
});
