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
  "caf\\u00e9": "Caf\\u00e9"
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

async function setup() {
	const dir = nodeFs.mkdtempSync(
		nodePath.join(nodeOs.tmpdir(), "i18next-keep-unchanged-entries-")
	);
	for (const [path, text] of Object.entries(files)) {
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
			"plugin.inlang.i18next": {
				pathPattern: {
					common: "./locales/{locale}/common.json",
					app: "./locales/{locale}/app.json",
				},
			},
		})
	);
	const project = await loadProjectFromDirectory({
		path: nodePath.join(dir, "project.inlang"),
		fs: nodeFs,
		providePlugins: [plugin as unknown as InlangPlugin],
	});
	const read = () =>
		Object.fromEntries(
			Object.keys(files).map((path) => [
				path,
				nodeFs.readFileSync(nodePath.join(dir, path), "utf-8"),
			])
		);
	const save = () =>
		saveProjectToDirectory({
			project,
			path: nodePath.join(dir, "project.inlang"),
			fs: nodeFs,
		});
	return { dir, project, read, save };
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
	const { project, read, save } = await setup();
	try {
		const message = await project.db
			.selectFrom("inlang_message")
			.selectAll()
			.where("bundle_id", "=", "common:menu.close")
			.where("locale", "=", "en")
			.executeTakeFirstOrThrow();
		await project.db
			.updateTable("inlang_variant")
			.set({ pattern: [{ type: "text", value: "Shut" }] })
			.where("message_id", "=", message.id)
			.execute();
		await save();
		expect(read()).toStrictEqual({
			...files,
			"locales/en/common.json": files["locales/en/common.json"]!.replace(
				'"close": "Close"',
				'"close": "Shut"'
			),
		});
	} finally {
		await project.close();
	}
});
