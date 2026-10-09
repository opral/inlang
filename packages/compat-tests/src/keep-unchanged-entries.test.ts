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
	openFixtureProject,
	readSourceFiles,
	settingsFor,
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
