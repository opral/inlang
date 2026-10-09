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
			"auth.SignUp": "./messages/{locale}/auth/sign-up.json",
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

/** The rows of a project that imported `files` (by path), with stable ids. */
async function importRows(settings: Settings, files: Files): Promise<Rows> {
	const imported = await plugin.importFiles!({
		files: (await existingFiles(settings, files)).map((file) => ({
			locale: file.locale,
			content: file.content,
			toBeImportedFilesMetadata: file.metadata,
		})),
		settings,
	});
	const messages = imported.messages as Message[];
	const variants: Variant[] = imported.variants.map((variant, index) => ({
		id: `variant-${index}`,
		messageId: messages.find(
			(message) =>
				message.bundleId === variant.messageBundleId &&
				message.locale === variant.messageLocale
		)!.id,
		matches: [],
		pattern: variant.pattern ?? [],
	}));
	return { bundles: imported.bundles as Bundle[], messages, variants };
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
  "Navigation": {
      "home": "Home",
    "about":"About {company}",
    "deep": { "er": "Deeper" }
  },
  "count": "{count,plural,=0{none} one{# item}other{# items}}",
  "rich": "Please <link>log in</link> or <b>{name}</b>",
  "date": "Due {due, date, short}",
  "flat.dotted": "Flat"
}
`;

const de = `{\r
\t"apple": "Caf\\u00e9",\r
\t"Navigation": {\r
\t\t"about": "Über {company}",\r
\t\t"home": "Start"\r
\t},\r
\t"count": "{count, plural,\\n  one {# Ding}\\n  other {# Dinge}\\n}",\r
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

		const pluralRows = await edit(
			settings,
			files,
			"./messages/de.json",
			["count"],
			"{count, plural, one {# Sache} other {# Sachen}}"
		);
		expect(await exportTexts(settings, pluralRows, files)).toStrictEqual({
			"en.json": en,
			"de.json": replaceOnce(
				de,
				'"{count, plural,\\n  one {# Ding}\\n  other {# Dinge}\\n}"',
				'"{count, plural, one {# Sache} other {# Sachen}}"'
			),
		});
	});

	test("only the edited nested entry changes", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["Navigation", "deep", "er"],
			"Deepest"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(en, '"Deeper"', '"Deepest"')
		);

		const dottedRows = await edit(
			settings,
			files,
			"./messages/en.json",
			["flat.dotted"],
			"Still flat"
		);
		expect((await exportTexts(settings, dottedRows, files))["en.json"]).toBe(
			replaceOnce(en, '"Flat"', '"Still flat"')
		);
	});

	test("adding and removing messages", async () => {
		// a nested message, after the key that precedes it in the full export
		const added = await edit(
			settings,
			files,
			"./messages/de.json",
			["Navigation", "contact"],
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

		const removedLast = await edit(
			settings,
			files,
			"./messages/en.json",
			["flat.dotted"],
			undefined
		);
		expect((await exportTexts(settings, removedLast, files))["en.json"]).toBe(
			replaceOnce(en, ',\n  "flat.dotted": "Flat"', "")
		);
	});
});

describe("data changes are detected", () => {
	test("only the match of a plural variant changed", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["count"],
			"{count,plural,=0{none} =1{# item}other{# items}}"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(
				en,
				'"{count,plural,=0{none} one{# item}other{# items}}"',
				'"{count,plural,=0{none} =1{# item}other{# items}}"'
			)
		);
	});

	test("only the format of an argument changed", async () => {
		const rows = await edit(
			settings,
			files,
			"./messages/en.json",
			["date"],
			"Due {due, date, long}"
		);
		expect((await exportTexts(settings, rows, files))["en.json"]).toBe(
			replaceOnce(en, '"Due {due, date, short}"', '"Due {due, date, long}"')
		);
	});

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

		const pluralRows = await edit(
			settings,
			files,
			"./messages/en.json",
			["count"],
			"{count, plural,=0{none} one{# item}other{# items}}"
		);
		expect((await exportTexts(settings, pluralRows, files))["en.json"]).toBe(
			replaceOnce(
				en,
				'"{count,plural,=0{none} one{# item}other{# items}}"',
				'"{count, plural,=0{none} one{# item}other{# items}}"'
			)
		);
	});

	test("only a variable name changed", async () => {
		const rows = await importRows(settings, files);
		const message = rows.messages.find(
			(message) =>
				message.bundleId === "Navigation.about" && message.locale === "de"
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
});

describe("namespaces", () => {
	const namespaced: Files = {
		"./messages/en/common.json": '{\n  "hello": "Hello",\n  "bye":"Bye"\n}\n',
		"./messages/en/auth/sign-up.json":
			'{\n\t"title": "Sign up {name}",\n\t"form": { "email": "Email" }\n}',
		"./messages/de/common.json": '{"hello":"Hallo","bye":"Tschüss"}',
		"./messages/de/auth/sign-up.json":
			'{\r\n    "title": "Registrieren {name}"\r\n}\r\n',
	};

	test("each file keeps its text", async () => {
		const rows = await importRows(namespacedSettings, namespaced);
		expect(
			await exportTexts(namespacedSettings, rows, namespaced)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"auth.SignUp-en.json": namespaced["./messages/en/auth/sign-up.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"auth.SignUp-de.json": namespaced["./messages/de/auth/sign-up.json"],
		});
	});

	test("only the edited entry of the edited file changes", async () => {
		const rows = await edit(
			namespacedSettings,
			namespaced,
			"./messages/de/auth/sign-up.json",
			["form", "email"],
			"E-Mail"
		);
		expect(
			await exportTexts(namespacedSettings, rows, namespaced)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"auth.SignUp-en.json": namespaced["./messages/en/auth/sign-up.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"auth.SignUp-de.json":
				'{\r\n    "title": "Registrieren {name}",\r\n    "form": {\r\n        "email": "E-Mail"\r\n    }\r\n}\r\n',
		});
	});

	test("a namespace without a previous file is written whole", async () => {
		const rows = await importRows(namespacedSettings, namespaced);
		const whole = await exportTexts(namespacedSettings, rows);
		const withoutDeSignUp = { ...namespaced };
		delete withoutDeSignUp["./messages/de/auth/sign-up.json"];
		expect(
			await exportTexts(namespacedSettings, rows, withoutDeSignUp)
		).toStrictEqual({
			"common-en.json": namespaced["./messages/en/common.json"],
			"auth.SignUp-en.json": namespaced["./messages/en/auth/sign-up.json"],
			"common-de.json": namespaced["./messages/de/common.json"],
			"auth.SignUp-de.json": whole["auth.SignUp-de.json"],
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
				"./messages/en.json": en.replace('"Flat"', '"Flat",'),
				"./messages/de.json": "",
			})
		).toStrictEqual(whole);
	});
});

test("saveProjectToDirectory only writes the edited entry, also with sourceLanguageFilePath", async () => {
	const dir = nodeFs.mkdtempSync(
		nodePath.join(nodeOs.tmpdir(), "next-intl-keep-")
	);
	const initial: Files = {
		"messages/main.json":
			'{\n  "title": "Hello {name}",\n  "nav":{"home":"Home"}\n}\n',
		"messages/de.json":
			'{\r\n\t"nav": {"home": "Start"},\r\n\t"title": "Hallo {name}"\r\n}',
	};
	try {
		for (const [path, text] of Object.entries(initial)) {
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
			JSON.stringify({
				baseLocale: "en",
				locales: ["en", "de"],
				[PLUGIN_KEY]: {
					pathPattern: "./messages/{locale}.json",
					sourceLanguageFilePath: "./messages/main.json",
				},
			})
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
			for (const [path, text] of Object.entries(initial)) {
				expect(read(path)).toBe(text);
			}
			expect(nodeFs.existsSync(nodePath.join(dir, "messages/en.json"))).toBe(
				false
			);

			const message = await project.db
				.selectFrom("inlang_message")
				.selectAll()
				.where("bundle_id", "=", "nav.home")
				.where("locale", "=", "en")
				.executeTakeFirstOrThrow();
			await project.db
				.updateTable("inlang_variant")
				.set({ pattern: [{ type: "text", value: "Start page" }] })
				.where("message_id", "=", message.id)
				.execute();
			await saveProjectToDirectory({
				project,
				path: nodePath.join(dir, "project.inlang"),
				fs: nodeFs,
			});
			expect(read("messages/main.json")).toBe(
				replaceOnce(initial["messages/main.json"]!, '"Home"', '"Start page"')
			);
			expect(read("messages/de.json")).toBe(initial["messages/de.json"]);
		} finally {
			await project.close();
		}
	} finally {
		nodeFs.rmSync(dir, { recursive: true, force: true });
	}
});
