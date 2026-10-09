import { expect, test } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	loadProjectFromDirectory,
	saveProjectToDirectory,
	type InlangPlugin,
} from "@inlang/sdk";
import { plugin } from "../plugin.js";

// Saving a project must not change the bytes of translation files beyond the
// edits. Kept apart from keepUnchangedEntries.test.ts, which imports the
// import-export modules before ../plugin.js (see namespace-write-back.test.ts).

const files: Record<string, string> = {
	"locales/en/common.json": `{
  "hello" :  "Hello {{ name }}",
  "item_one": "One item",
  "item_zero": "No items",
  "item_other": "{{count}} items",
  "menu": {"open": "Open",   "close": "Close"},
  "caf\\u00e9": "Caf\\u00e9",
  "err:notFound": "Not found"
}
`,
	"locales/en/app.json":
		'{\r\n\t"title": "My app",\r\n\t"friend_male": "A boyfriend",\r\n\t"friend": "A friend"\r\n}',
	"locales/de/common.json": `{
    "item_other": "{{count}} Dinge",
    "hello": "Hallo {{name}}",
    "item_one": "Ein Ding"
}
`,
};

const pathPattern = {
	common: "./locales/{locale}/common.json",
	app: "./locales/{locale}/app.json",
};

// one file per locale: `:` in a key is not a namespace separator
const singleFiles: Record<string, string> = {
	"en.json": `{
  "err:notFound": "Not found",
  "title": "Title",
  "item_one": "One item",
  "item_other": "{{count}} items",
  "nested": { "a:b": "A:B" }
}
`,
	"de.json":
		'{\r\n\t"title": "Titel",\r\n\t"err:notFound": "Nicht gefunden"\r\n}',
};

async function setup(
	args: {
		files: Record<string, string>;
		pathPattern: string | Record<string, string>;
	} = { files, pathPattern }
) {
	const dir = nodeFs.mkdtempSync(
		nodePath.join(nodeOs.tmpdir(), "i18next-keep-unchanged-entries-")
	);
	for (const [path, text] of Object.entries(args.files)) {
		nodeFs.mkdirSync(nodePath.dirname(nodePath.join(dir, path)), {
			recursive: true,
		});
		nodeFs.writeFileSync(nodePath.join(dir, path), text);
	}
	nodeFs.mkdirSync(nodePath.join(dir, "project.inlang"));
	nodeFs.writeFileSync(
		nodePath.join(dir, "project.inlang/settings.json"),
		JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.i18next": { pathPattern: args.pathPattern },
		})
	);
	const project = await loadProjectFromDirectory({
		path: nodePath.join(dir, "project.inlang"),
		fs: nodeFs,
		providePlugins: [plugin as unknown as InlangPlugin],
	});
	// all files of the project except the .inlang directory
	const read = () =>
		Object.fromEntries(
			(nodeFs.readdirSync(dir, { recursive: true }) as string[])
				.filter(
					(path) =>
						!path.startsWith("project.inlang") &&
						nodeFs.statSync(nodePath.join(dir, path)).isFile()
				)
				.sort()
				.map((path) => [
					path,
					nodeFs.readFileSync(nodePath.join(dir, path), "utf-8"),
				])
		);
	const edit = async (bundleId: string, locale: string, text: string) => {
		const message = await project.db
			.selectFrom("inlang_message")
			.selectAll()
			.where("bundle_id", "=", bundleId)
			.where("locale", "=", locale)
			.executeTakeFirstOrThrow();
		const result = await project.db
			.updateTable("inlang_variant")
			.set({ pattern: [{ type: "text", value: text }] })
			.where("message_id", "=", message.id)
			.executeTakeFirstOrThrow();
		expect(result.numUpdatedRows).toBe(1n);
	};
	const save = () =>
		saveProjectToDirectory({
			project,
			path: nodePath.join(dir, "project.inlang"),
			fs: nodeFs,
		});
	return { dir, project, read, save, edit };
}

test("saving a project without edits leaves the translation files as they are", async () => {
	const { project, read, save } = await setup();
	try {
		await save();
		expect(read()).toStrictEqual(files);
	} finally {
		await project.close();
	}
});

test("saving a project after an edit changes only the edited entry", async () => {
	const { project, read, save, edit } = await setup();
	try {
		await edit("common:menu.close", "en", "Shut");
		await edit("common:err:notFound", "en", "Not there");
		await save();
		expect(read()).toStrictEqual({
			...files,
			"locales/en/common.json": files["locales/en/common.json"]!.replace(
				'"close": "Close"',
				'"close": "Shut"'
			).replace('"err:notFound": "Not found"', '"err:notFound": "Not there"'),
		});
	} finally {
		await project.close();
	}
});

test("saving a project with one file per locale and keys with `:` without edits", async () => {
	const { project, read, save } = await setup({
		files: singleFiles,
		pathPattern: "./{locale}.json",
	});
	try {
		await save();
		expect(read()).toStrictEqual(singleFiles);
	} finally {
		await project.close();
	}
});

test("saving a project with one file per locale and keys with `:` after an edit", async () => {
	const { project, read, save, edit } = await setup({
		files: singleFiles,
		pathPattern: "./{locale}.json",
	});
	try {
		await edit("err:notFound", "de", "Nicht da");
		await save();
		expect(read()).toStrictEqual({
			...singleFiles,
			"de.json": singleFiles["de.json"]!.replace(
				'"err:notFound": "Nicht gefunden"',
				'"err:notFound": "Nicht da"'
			),
		});
	} finally {
		await project.close();
	}
});
