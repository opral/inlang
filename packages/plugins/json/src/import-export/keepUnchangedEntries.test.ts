import { describe, expect, test } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	loadProjectFromDirectory,
	saveProjectToDirectory,
	type Bundle,
	type InlangPlugin,
	type Message,
	type Variant,
} from "@inlang/sdk";
// import the plugin first, see i18next's namespace-write-back.test.ts
import { plugin } from "../plugin.js";
import { PLUGIN_KEY } from "../pluginKey.js";

/**
 * Saving a project must not change the bytes of translation files beyond the
 * actual edits. `exportFiles` gets the previous files and keeps the text of
 * every entry that didn't change.
 */

type Settings = Parameters<
	NonNullable<typeof plugin.exportFiles>
>[0]["settings"];
type Rows = { bundles: Bundle[]; messages: Message[]; variants: Variant[] };
type Files = Record<string, string>;

const settings = {
	baseLocale: "en",
	locales: ["en", "de"],
	[PLUGIN_KEY]: { pathPattern: "./messages/{locale}.json" },
} as Settings;

const namespacedSettings = {
	baseLocale: "en",
	locales: ["en", "de"],
	[PLUGIN_KEY]: {
		pathPattern: {
			common: "./messages/{locale}/common.json",
			app: "./messages/{locale}/app.json",
		},
	},
} as Settings;

/** The previous files by path, as `toBeImportedFiles` lists them. */
async function existingFiles(settings: Settings, files: Files) {
	const toBeImported = await plugin.toBeImportedFiles!({ settings });
	return toBeImported
		.filter((file) => files[file.path] !== undefined)
		.map((file) => ({
			...file,
			content: new TextEncoder().encode(files[file.path]),
		}));
}

/** The rows of a project that imported `files` (by path). */
async function importRows(settings: Settings, files: Files): Promise<Rows> {
	const imported = await plugin.importFiles!({
		files: (await existingFiles(settings, files)).map((file) => ({
			locale: file.locale,
			content: file.content,
			toBeImportedFilesMetadata: file.metadata,
		})),
		settings,
	});
	return {
		bundles: imported.bundles as Bundle[],
		messages: imported.messages as Message[],
		variants: imported.variants as Variant[],
	};
}

/** Exports `rows` with the previous files (by path), as text by file name. */
async function exportTexts(
	settings: Settings,
	rows: Rows,
	previous?: Files
): Promise<Record<string, string>> {
	const exported = await plugin.exportFiles!({
		...structuredClone(rows),
		settings,
		files:
			previous === undefined
				? undefined
				: await existingFiles(settings, previous),
	});
	return Object.fromEntries(
		exported.map((file) => [
			file.name,
			new TextDecoder("utf-8", { ignoreBOM: true }).decode(file.content),
		])
	);
}

/** The rows after setting the entry at `path` of the file `file`. */
async function edit(
	settings: Settings,
	files: Files,
	file: string,
	path: string[],
	value: string | undefined
): Promise<Rows> {
	const json = JSON.parse(files[file]!);
	let cursor = json;
	for (const segment of path.slice(0, -1)) {
		cursor[segment] ??= {};
		cursor = cursor[segment];
	}
	if (value === undefined) {
		delete cursor[path.at(-1)!];
	} else {
		cursor[path.at(-1)!] = value;
	}
	return importRows(settings, { ...files, [file]: JSON.stringify(json) });
}

/** Replaces `previous` by `next` in `text`, which must occur exactly once. */
function replaceOnce(text: string, previous: string, next: string): string {
	expect(text.split(previous)).toHaveLength(2);
	return text.replace(previous, next);
}

const en = `{
  "zebra":   "Hello  {name}!",
  "apple" : "caf\\u00e9 \\u2014 \\"quoted\\" \\/",
  "nav": {
      "home": "Home",
    "about":"About {company}",
    "deep": { "er": "Deeper" }
  },
  "flat.dotted": "Flat",
  "a.": { "b": "Dotted segment" },
  "empty": ""
}
`;

const de = `{\r
\t"apple": "Caf\\u00e9",\r
\t"nav": {\r
\t\t"about": "Über {company}",\r
\t\t"home": "Start"\r
\t},\r
\t"zebra": "Hallo {name}!"\r
}`;

const files: Files = {
	"./messages/en.json": en,
	"./messages/de.json": de,
};

describe("export with the previous files", () => {
	test("is byte-identical if nothing was edited", async () => {
		const rows = await importRows(settings, files);
		expect(await exportTexts(settings, rows, files)).toStrictEqual({
			"en.json": en,
			"de.json": de,
		});
		// the files are not what the plugin writes without them
		const whole = await exportTexts(settings, rows);
		expect(whole["en.json"]).not.toBe(en);
		expect(whole["de.json"]).not.toBe(de);
	});

	test("is byte-identical for minified, BOM and odd whitespace files", async () => {
		const odd = {
			"./messages/en.json": '﻿{"b":"B {x}","a":{"c":"C"}}',
			"./messages/de.json":
				'  {\n        "a"   :\n {"c" :"C"} ,"b":"B {x}"}\n\n',
		};
		const rows = await importRows(settings, odd);
		expect(await exportTexts(settings, rows, odd)).toStrictEqual({
			"en.json": odd["./messages/en.json"],
			"de.json": odd["./messages/de.json"],
		});
	});

	test("only the edited entry changes", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["zebra"],
			"Hi {name}!"
		);
		expect(await exportTexts(settings, rows, files)).toStrictEqual({
			"en.json": replaceOnce(en, '"Hello  {name}!"', '"Hi {name}!"'),
			"de.json": de,
		});
	});

	test("only the edited nested entry changes", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["nav", "about"],
			"About us"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(en, '"About {company}"', '"About us"')
		);

		const deepRows = await edit(
			settings,
			files,
			"./messages/en.json",
			["nav", "deep", "er"],
			"Deepest"
		);
		expect((await exportTexts(settings, deepRows, files))["en.json"]).toBe(
			replaceOnce(en, '"Deeper"', '"Deepest"')
		);
	});

	test("a dotted key stays flat, a dotted path segment stays nested", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["flat.dotted"],
			"Still flat"
		);
		const segmentRows = await edit(
			settings,
			files,
			"./messages/en.json",
			["a.", "b"],
			"Still nested"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(en, '"Flat"', '"Still flat"')
		);
		expect((await exportTexts(settings, segmentRows, files))["en.json"]).toBe(
			replaceOnce(en, '"Dotted segment"', '"Still nested"')
		);
	});

	test("adding and removing messages", async () => {
		// a nested message, after the key that precedes it in the full export
		const added = await edit(
			settings,
			files,
			"./messages/de.json",
			["nav", "contact"],
			"Kontakt"
		);
		expect((await exportTexts(settings, added, files))["de.json"]).toBe(
			replaceOnce(de, '"Start"\r\n', '"Start",\r\n\t\t"contact": "Kontakt"\r\n')
		);

		const addedTopLevel = await edit(
			settings,
			files,
			"./messages/de.json",
			["new"],
			"Neu {x}"
		);
		expect((await exportTexts(settings, addedTopLevel, files))["de.json"]).toBe(
			replaceOnce(
				de,
				'"Hallo {name}!"\r\n',
				'"Hallo {name}!",\r\n\t"new": "Neu {x}"\r\n'
			)
		);

		const removed = await edit(
			settings,
			files,
			"./messages/en.json",
			["apple"],
			undefined
		);
		expect((await exportTexts(settings, removed, files))["en.json"]).toBe(
			replaceOnce(
				en,
				'  "apple" : "caf\\u00e9 \\u2014 \\"quoted\\" \\/",\n',
				""
			)
		);

		const removedNested = await edit(
			settings,
			files,
			"./messages/en.json",
			["nav", "deep", "er"],
			undefined
		);
		// the full export doesn't write the empty object either
		expect((await exportTexts(settings, removedNested, files))["en.json"]).toBe(
			replaceOnce(en, ',\n    "deep": { "er": "Deeper" }', "")
		);
	});
});

test("values that the plugin doesn't import are kept (the full export drops them)", async () => {
	const previous = {
		"./messages/en.json":
			'{\n  "a": "A",\n  "count": 42,\n  "list": ["x"]\n}\n',
	};
	const rows = await importRows(settings, previous);
	expect(await exportTexts(settings, rows, previous)).toStrictEqual({
		"en.json": '{\n  "a": "A",\n  "count": 42,\n  "list": ["x"]\n}\n',
	});
});

describe("data changes are detected", () => {
	test("only whitespace inside a pattern changed", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["zebra"],
			"Hello {name}!"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(en, '"Hello  {name}!"', '"Hello {name}!"')
		);
	});

	test("only a variable name changed", async () => {
		const rows = await importRows(settings, files);
		const message = rows.messages.find(
			(message) => message.bundleId === "nav.about" && message.locale === "de"
		)!;
		const variant = rows.variants.find(
			(variant) => variant.messageId === message.id
		)!;
		variant.pattern = variant.pattern.map((part) =>
			part.type === "expression" && part.arg.type === "variable-reference"
				? { ...part, arg: { ...part.arg, name: "firma" } }
				: part
		);
		expect((await exportTexts(settings, rows, files))["de.json"]).toBe(
			replaceOnce(de, '"Über {company}"', '"Über {firma}"')
		);
	});

	test("text that looks like a variable with another variable reference pattern", async () => {
		const mustache = {
			...settings,
			[PLUGIN_KEY]: {
				pathPattern: "./messages/{locale}.json",
				variableReferencePattern: ["{{", "}}"],
			},
		} as Settings;
		const previous = { "./messages/en.json": '{ "a": "{name} {{name}}" }' };
		const rows = await importRows(mustache, previous);
		expect(await exportTexts(mustache, rows, previous)).toStrictEqual({
			"en.json": previous["./messages/en.json"],
		});
		const variant = rows.variants[0]!;
		// the text "{name}" becomes a variable reference
		expect(variant.pattern).toStrictEqual([
			{ type: "text", value: "{name} " },
			{ type: "expression", arg: { type: "variable-reference", name: "name" } },
		]);
		variant.pattern = [
			{ type: "expression", arg: { type: "variable-reference", name: "name" } },
			{ type: "text", value: " " },
			{ type: "expression", arg: { type: "variable-reference", name: "name" } },
		];
		expect(await exportTexts(mustache, rows, previous)).toStrictEqual({
			"en.json": '{ "a": "{{name}} {{name}}" }',
		});
	});
});

describe("namespaces", () => {
	const namespaced: Files = {
		"./messages/en/common.json": '{\n  "hello": "Hello",\n  "bye":"Bye"\n}\n',
		"./messages/en/app.json":
			'{\n\t"title": "App",\n\t"menu": { "open": "Open" }\n}',
		"./messages/de/common.json": '{"hello":"Hallo","bye":"Tschüss"}',
		"./messages/de/app.json": '{\r\n    "title": "Anwendung"\r\n}\r\n',
	};

	test("each file keeps its text", async () => {
		const rows = await importRows(namespacedSettings, namespaced);
		expect(
			await exportTexts(namespacedSettings, rows, namespaced)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"app-en.json": namespaced["./messages/en/app.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"app-de.json": namespaced["./messages/de/app.json"],
		});
	});

	test("only the edited entry of the edited file changes", async () => {
		const rows = await edit(
			namespacedSettings,
			namespaced,
			"./messages/de/app.json",
			["menu", "open"],
			"Öffnen"
		);
		expect(
			await exportTexts(namespacedSettings, rows, namespaced)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"app-en.json": namespaced["./messages/en/app.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"app-de.json":
				'{\r\n    "title": "Anwendung",\r\n    "menu": {\r\n        "open": "Öffnen"\r\n    }\r\n}\r\n',
		});
	});

	test("a namespace without a previous file is written whole", async () => {
		const rows = await importRows(namespacedSettings, namespaced);
		const whole = await exportTexts(namespacedSettings, rows);
		const { ["./messages/de/app.json"]: _, ...withoutDeApp } = namespaced;
		expect(
			await exportTexts(namespacedSettings, rows, withoutDeApp)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"app-en.json": namespaced["./messages/en/app.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"app-de.json": whole["app-de.json"],
		});
	});
});

describe("falls back to the full export", () => {
	test("without a previous file, e.g. for a new locale", async () => {
		const rows = await importRows(settings, files);
		const whole = await exportTexts(settings, rows);
		expect(
			await exportTexts(settings, rows, { "./messages/en.json": en })
		).toStrictEqual({ "en.json": en, "de.json": whole["de.json"] });
		expect(await exportTexts(settings, rows, {})).toStrictEqual(whole);
	});

	test("if the previous file is not valid JSON", async () => {
		const rows = await importRows(settings, files);
		const whole = await exportTexts(settings, rows);
		expect(
			await exportTexts(settings, rows, {
				"./messages/en.json": en.replace('"empty": ""', '"empty": "",'),
				"./messages/de.json": "",
			})
		).toStrictEqual(whole);
	});
});

test("saveProjectToDirectory only writes the edited entry", async () => {
	const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "json-keep-"));
	try {
		for (const [path, text] of Object.entries(namespaced())) {
			nodeFs.mkdirSync(nodePath.dirname(nodePath.join(dir, path)), {
				recursive: true,
			});
			nodeFs.writeFileSync(nodePath.join(dir, path), text);
		}
		nodeFs.mkdirSync(nodePath.join(dir, "project.inlang"), {
			recursive: true,
		});
		nodeFs.writeFileSync(
			nodePath.join(dir, "project.inlang/settings.json"),
			JSON.stringify(namespacedSettings)
		);
		const project = await loadProjectFromDirectory({
			path: nodePath.join(dir, "project.inlang"),
			fs: nodeFs,
			providePlugins: [plugin as unknown as InlangPlugin],
		});
		const read = (path: string) =>
			nodeFs.readFileSync(nodePath.join(dir, path), "utf-8");
		try {
			await saveProjectToDirectory({
				project,
				path: nodePath.join(dir, "project.inlang"),
				fs: nodeFs,
			});
			for (const [path, text] of Object.entries(namespaced())) {
				expect(read(path)).toBe(text);
			}

			const message = await project.db
				.selectFrom("inlang_message")
				.selectAll()
				.where("bundle_id", "=", "app:menu.open")
				.where("locale", "=", "en")
				.executeTakeFirstOrThrow();
			await project.db
				.updateTable("inlang_variant")
				.set({ pattern: [{ type: "text", value: "Open now" }] })
				.where("message_id", "=", message.id)
				.execute();
			await saveProjectToDirectory({
				project,
				path: nodePath.join(dir, "project.inlang"),
				fs: nodeFs,
			});
			for (const [path, text] of Object.entries(namespaced())) {
				expect(read(path)).toBe(
					path === "./messages/en/app.json"
						? replaceOnce(text, '"Open"', '"Open now"')
						: text
				);
			}
		} finally {
			await project.close();
		}
	} finally {
		nodeFs.rmSync(dir, { recursive: true, force: true });
	}

	function namespaced(): Files {
		return {
			"./messages/en/common.json": '{\n  "hello": "Hello",\n  "bye":"Bye"\n}\n',
			"./messages/en/app.json":
				'{\n\t"title": "App {name}",\n\t"menu": { "open": "Open" }\n}',
			"./messages/de/common.json": '{"hello":"Hallo","bye":"Tschüss"}',
			"./messages/de/app.json": '{\r\n    "title": "Anwendung"\r\n}\r\n',
		};
	}
});
