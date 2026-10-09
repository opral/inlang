import { describe, expect, test, vi } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import {
	loadProjectFromDirectory,
	saveProjectToDirectory,
	type InlangPlugin,
} from "@inlang/sdk";
import { plugin } from "../plugin.js";

// loading and saving projects with the SDK is slow on CI
vi.setConfig({ testTimeout: 30_000 });

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

// A namespace can have `:` in its name. Bundle ids are `namespace:key`, so
// `common:legacy:title` is the key `title` of the namespace `common:legacy`,
// not the key `legacy:title` of `common`.
const colonNamespaces: Record<string, string> = {
	"locales/en/common.json": '{\n  "title": "Common"\n}\n',
	"locales/en/common-legacy.json":
		'{\n    "title":  "Legacy",\n    "err:notFound": "Not found",\n    "item_one": "One item",\n    "item_other": "{{count}} items"\n}',
	"locales/de/common-legacy.json":
		'{\r\n\t"title": "Alt",\r\n\t"err:notFound": "Nicht gefunden"\r\n}\r\n',
	"locales/en/app-errors.json": '{"notFound": "App not found"}\n',
};

const colonPathPattern = {
	common: "./locales/{locale}/common.json",
	"common:legacy": "./locales/{locale}/common-legacy.json",
	"app:errors": "./locales/{locale}/app-errors.json",
};

test("saving a project with namespaces with `:` without edits", async () => {
	const { project, read, save } = await setup({
		files: colonNamespaces,
		pathPattern: colonPathPattern,
	});
	try {
		await save();
		expect(read()).toStrictEqual(colonNamespaces);
	} finally {
		await project.close();
	}
});

test("saving a project with namespaces with `:` after edits", async () => {
	const { dir, project, read, save, edit } = await setup({
		files: colonNamespaces,
		pathPattern: colonPathPattern,
	});
	try {
		await edit("common:legacy:title", "de", "Veraltet");
		await edit("common:legacy:err:notFound", "en", "Gone");
		await edit("app:errors:notFound", "en", "App gone");
		await save();
		const expected = {
			...colonNamespaces,
			"locales/en/common-legacy.json": colonNamespaces[
				"locales/en/common-legacy.json"
			]!.replace('"Not found"', '"Gone"'),
			"locales/de/common-legacy.json": colonNamespaces[
				"locales/de/common-legacy.json"
			]!.replace('"Alt"', '"Veraltet"'),
			"locales/en/app-errors.json": colonNamespaces[
				"locales/en/app-errors.json"
			]!.replace('"App not found"', '"App gone"'),
		};
		expect(read()).toStrictEqual(expected);

		// and the project reads the edits back
		const reloaded = await loadProjectFromDirectory({
			path: nodePath.join(dir, "project.inlang"),
			fs: nodeFs,
			providePlugins: [plugin as unknown as InlangPlugin],
		});
		try {
			const bundles = await reloaded.db
				.selectFrom("inlang_bundle")
				.select("id")
				.orderBy("id")
				.execute();
			expect(bundles.map((bundle) => bundle.id)).toStrictEqual([
				"app:errors:notFound",
				"common:legacy:err:notFound",
				"common:legacy:item",
				"common:legacy:title",
				"common:title",
			]);
		} finally {
			await reloaded.close();
		}
	} finally {
		await project.close();
	}
});

// Namespaces `a` and `a:b` both have the bundle id `a:b:c`: the key `b:c` of
// `a` and the key `c` of `a:b`. A message is written to the namespace whose
// file has it, so that the file it is read from changes (see exportFiles).

/** the texts of the project in `dir`, as loaded */
async function reload(dir: string) {
	const project = await loadProjectFromDirectory({
		path: nodePath.join(dir, "project.inlang"),
		fs: nodeFs,
		providePlugins: [plugin as unknown as InlangPlugin],
	});
	try {
		return (
			await project.db
				.selectFrom("inlang_message")
				.innerJoin(
					"inlang_variant",
					"inlang_variant.message_id",
					"inlang_message.id"
				)
				.select([
					"inlang_message.bundle_id",
					"inlang_message.locale",
					"inlang_variant.pattern",
				])
				.orderBy("inlang_message.bundle_id")
				.orderBy("inlang_message.locale")
				.execute()
		).map((row) => [row.bundle_id, row.locale, row.pattern]);
	} finally {
		await project.close();
	}
}

const text = (value: string) => [{ type: "text", value }];

describe.each([
	{ a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" },
	{ "a:b": "./{locale}/a-b.json", a: "./{locale}/a.json" },
])("namespaces %j and a key `b:c` of `a`", (pathPattern) => {
	const ambiguous = {
		"en/a.json": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
		"en/a-b.json": '{\n  "d": "D"\n}\n',
	};

	test("saving without edits leaves the files as they are", async () => {
		const { dir, project, read, save } = await setup({
			files: ambiguous,
			pathPattern,
		});
		try {
			const before = [
				["a:b:c", "en", text("C")],
				["a:b:d", "en", text("D")],
				["a:x", "en", text("X")],
			];
			expect(await reload(dir)).toStrictEqual(before);
			await save();
			expect(read()).toStrictEqual(ambiguous);
			expect(await reload(dir)).toStrictEqual(before);
		} finally {
			await project.close();
		}
	});

	test("an edit of the key `b:c` changes only its entry in `a`", async () => {
		const { dir, project, read, save, edit } = await setup({
			files: ambiguous,
			pathPattern,
		});
		try {
			await edit("a:b:c", "en", "C edited");
			await save();
			expect(read()).toStrictEqual({
				...ambiguous,
				"en/a.json": ambiguous["en/a.json"].replace('"C"', '"C edited"'),
			});
			expect(await reload(dir)).toStrictEqual([
				["a:b:c", "en", text("C edited")],
				["a:b:d", "en", text("D")],
				["a:x", "en", text("X")],
			]);
		} finally {
			await project.close();
		}
	});
});

test("namespaces `a:b` and `a`: an edit of a message of `a`, which no other message of the locale is in, is read back", async () => {
	const files = {
		"en/a.json": '{\n  "b:c": "C"\n}\n',
		"en/a-b.json": '{\n  "d": "D"\n}\n',
	};
	const { dir, project, read, save, edit } = await setup({
		files,
		pathPattern: { "a:b": "./{locale}/a-b.json", a: "./{locale}/a.json" },
	});
	try {
		await edit("a:b:c", "en", "C edited");
		await save();
		expect(read()).toStrictEqual({
			...files,
			"en/a.json": files["en/a.json"].replace('"C"', '"C edited"'),
		});
		expect(await reload(dir)).toStrictEqual([
			["a:b:c", "en", text("C edited")],
			["a:b:d", "en", text("D")],
		]);
	} finally {
		await project.close();
	}
});

test("namespaces `a` and `a:b`: saving without edits creates no file of `a:b` for a locale that has none", async () => {
	const files = {
		"en/a.json": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
		"de/a-b.json": '{\n  "d": "D"\n}\n',
	};
	const { dir, project, read, save } = await setup({
		files,
		pathPattern: { a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" },
	});
	try {
		const before = await reload(dir);
		await save();
		expect(read()).toStrictEqual(files);
		expect(await reload(dir)).toStrictEqual(before);
	} finally {
		await project.close();
	}
});

test("namespaces `a` and `a:b`: a new translation of a message of `a` is written to `a`", async () => {
	const files = {
		"en/a.json": '{\n  "x": "X",\n  "b:c": "C"\n}\n',
		"de/a.json": '{\n  "x": "X de"\n}\n',
		"en/a-b.json": '{\n  "d": "D"\n}\n',
	};
	const { dir, project, read, save } = await setup({
		files,
		pathPattern: { a: "./{locale}/a.json", "a:b": "./{locale}/a-b.json" },
	});
	try {
		await project.db
			.insertInto("inlang_message")
			.values({
				id: "a:b:c-de",
				bundle_id: "a:b:c",
				locale: "de",
				selectors: [],
			})
			.execute();
		await project.db
			.insertInto("inlang_variant")
			.values({
				id: "a:b:c-de-variant",
				message_id: "a:b:c-de",
				matches: [],
				pattern: [{ type: "text", value: "C de" }],
			})
			.execute();
		await save();
		expect(read()).toStrictEqual({
			...files,
			"de/a.json": '{\n  "x": "X de",\n  "b:c": "C de"\n}\n',
		});
		expect((await reload(dir)).filter(([id]) => id === "a:b:c")).toStrictEqual([
			["a:b:c", "de", text("C de")],
			["a:b:c", "en", text("C")],
		]);
	} finally {
		await project.close();
	}
});
