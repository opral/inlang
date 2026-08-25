import { test, expect, vi } from "vitest";
import { saveProjectToDirectory } from "./saveProjectToDirectory.js";
import { Volume } from "memfs";
import { loadProjectInMemory } from "./loadProjectInMemory.js";
import { newProject } from "./newProject.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type { Bundle, NewMessage, Variant } from "../database/schema.js";
import { loadProjectFromDirectory } from "./loadProjectFromDirectory.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import type { ProjectSettings } from "../json-schema/settings.js";
import type { MessageV1 } from "../json-schema/old-v1-message/schemaV1.js";
import { ENV_VARIABLES } from "../services/env-variables/index.js";

test("it should throw if the path doesn't end with .inlang", async () => {
	await expect(() =>
		saveProjectToDirectory({
			fs: {} as any,
			project: {} as any,
			path: "/foo/bar",
		})
	).rejects.toThrowError("The path must end with .inlang");
});

test("it should write project files to the directory", async () => {
	const mockFs = Volume.fromJSON({
		"/foo/bar.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
		}),
	}).promises as any;

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr", "mock"],
			},
		}),
	});

	await saveProjectToDirectory({
		fs: mockFs,
		project,
		path: "/foo/bar.inlang",
	});

	const files = await mockFs.readdir("/foo/bar.inlang");
	const updatedSettingsFile = await mockFs.readFile(
		"/foo/bar.inlang/settings.json",
		"utf-8"
	);
	const updatedSettings = JSON.parse(updatedSettingsFile);

	// only testing known files at the time of the test.
	// this test should be updated for files that should NOT
	// be contained in the directory in the future
	expect(files).toContain("settings.json");
	expect(updatedSettings.baseLocale).toBe("en");
	expect(updatedSettings.locales).toEqual(["en", "fr", "mock"]);
});

test("accepts the node:fs style module with a promises namespace", async () => {
	const volume = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
			},
		}),
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const settings = await volume.promises.readFile(
		"/foo/bar.inlang/settings.json",
		"utf-8"
	);
	expect(JSON.parse(settings as string).locales).toEqual(["en"]);
});

test("creates exporter target directories from pathPattern", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "fallback.json",
				content: new TextEncoder().encode(JSON.stringify({ greeting: "Hi" })),
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: "./messages/{locale}.json",
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await project.db
		.insertInto("bundle")
		.values({ id: "greeting", declarations: [] })
		.execute();

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const exported = await volume.promises.readFile(
		"/foo/messages/en.json",
		"utf-8"
	);
	expect(JSON.parse(exported as string)).toEqual({ greeting: "Hi" });
});

test("writes exported files to every pattern of a pathPattern array", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "en.json",
				content: new TextEncoder().encode(JSON.stringify({ greeting: "Hi" })),
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: ["./messages/{locale}.json", "./backup/{locale}.json"],
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const messages = await volume.promises.readFile(
		"/foo/messages/en.json",
		"utf-8"
	);
	const backup = await volume.promises.readFile("/foo/backup/en.json", "utf-8");
	expect(JSON.parse(messages as string)).toEqual({ greeting: "Hi" });
	expect(JSON.parse(backup as string)).toEqual({ greeting: "Hi" });
});

test("an empty pathPattern array writes nothing", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "en.json",
				content: new TextEncoder().encode(JSON.stringify({ greeting: "Hi" })),
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: [],
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const files = await volume.promises.readdir("/foo");
	expect(files).not.toContain("en.json");
});

// https://github.com/opral/inlang/issues/4356
test("resolves a namespaced pathPattern object via export file metadata", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "common-en.json",
				content: new TextEncoder().encode(JSON.stringify({ hello: "Hello" })),
				metadata: { namespace: "common" },
			},
			{
				locale: "en",
				name: "app-en.json",
				content: new TextEncoder().encode(JSON.stringify({ title: "My app" })),
				metadata: { namespace: "app" },
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: {
						common: "./{locale}/common.json",
						app: "./{locale}/app.json",
					},
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const common = await volume.promises.readFile("/foo/en/common.json", "utf-8");
	const app = await volume.promises.readFile("/foo/en/app.json", "utf-8");
	expect(JSON.parse(common as string)).toEqual({ hello: "Hello" });
	expect(JSON.parse(app as string)).toEqual({ title: "My app" });
});

test("resolves an export file pathPattern metadata override", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "en.json",
				content: new TextEncoder().encode(JSON.stringify({ hello: "Hello" })),
				metadata: { pathPattern: "./main.json" },
			},
			{
				locale: "de",
				name: "de.json",
				content: new TextEncoder().encode(JSON.stringify({ hello: "Hallo" })),
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
				modules: [],
				mock: {
					pathPattern: "./{locale}.json",
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const source = await volume.promises.readFile("/foo/main.json", "utf-8");
	const target = await volume.promises.readFile("/foo/de.json", "utf-8");
	expect(JSON.parse(source as string)).toEqual({ hello: "Hello" });
	expect(JSON.parse(target as string)).toEqual({ hello: "Hallo" });
});

// old plugin versions don't provide namespace metadata. falling back to
// file.name is better than throwing "pathPattern.replace is not a function"
// https://github.com/opral/inlang/issues/4356
test("falls back to the file name when a namespaced pathPattern can't be resolved", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "common-en.json",
				content: new TextEncoder().encode(JSON.stringify({ hello: "Hello" })),
				// no metadata, like plugin versions that predate ExportFile.metadata
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: {
						common: "./{locale}/common.json",
					},
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const fallback = await volume.promises.readFile(
		"/foo/common-en.json",
		"utf-8"
	);
	expect(JSON.parse(fallback as string)).toEqual({ hello: "Hello" });
});

// https://github.com/opral/inlang/issues/4356
test("falls back to the file name when the namespace is missing from the pathPattern object", async () => {
	const volume = Volume.fromJSON({});
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => [
			{
				locale: "en",
				name: "stray-en.json",
				content: new TextEncoder().encode(JSON.stringify({ hello: "Hello" })),
				metadata: { namespace: "stray" },
			},
		],
	};

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
				mock: {
					pathPattern: {
						common: "./{locale}/common.json",
					},
				},
			},
		}),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		fs: volume as any,
		project,
		path: "/foo/bar.inlang",
	});

	const fallback = await volume.promises.readFile(
		"/foo/stray-en.json",
		"utf-8"
	);
	expect(JSON.parse(fallback as string)).toEqual({ hello: "Hello" });
});

// Users were confused by project_id, and without sync a stable id is rarely needed.
test("it should not write project_id to disk", async () => {
	const mockFs = Volume.fromJSON({
		"/foo/bar.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
		}),
	}).promises as any;

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "fr"],
			},
		}),
	});

	await saveProjectToDirectory({
		fs: mockFs,
		project,
		path: "/foo/bar.inlang",
	});

	const files = await mockFs.readdir("/foo/bar.inlang");

	expect(files).not.toContain("project_id");
});

test("a roundtrip should work", async () => {
	const bundles: Bundle[] = [{ id: "mock-bundle", declarations: [] }];
	const messages: NewMessage[] = [{ bundleId: "mock-bundle", locale: "en" }];
	const variants: Variant[] = [];

	const volume = Volume.fromJSON({
		"/mock-file.json": JSON.stringify({ bundles, messages, variants }),
	});

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		toBeImportedFiles: async () => {
			return [{ path: "/mock-file.json", locale: "mock" }];
		},
		importFiles: async ({ files }) => {
			const { bundles, messages, variants } = JSON.parse(
				new TextDecoder().decode(files[0]?.content)
			);
			return { bundles, messages, variants };
		},
		exportFiles: async ({ bundles }) => {
			return [
				{
					content: new TextEncoder().encode(JSON.stringify(bundles)),
					name: "mock-file.json",
					locale: "mock",
				},
			];
		},
	};

	const exportFilesSpy = vi.spyOn(mockPlugin, "exportFiles");
	const importFilesSpy = vi.spyOn(mockPlugin, "importFiles");

	const project = await loadProjectInMemory({
		blob: await newProject(),
		providePlugins: [mockPlugin],
	});

	await project.db.insertInto("bundle").values(bundles).execute();
	await project.db.insertInto("message").values(messages).execute();

	await saveProjectToDirectory({
		fs: volume.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	// const fileTree = volume.toJSON();

	expect(exportFilesSpy).toHaveBeenCalled();
	expect(importFilesSpy).not.toHaveBeenCalled();

	// TODO deactivated since mockBundleNested no longer contains the id of the messages
	// expect(fileTree).toEqual(
	// 	expect.objectContaining({
	// 		"/foo/mock-file.json": JSON.stringify([mockBundleNested]),
	// 	})
	// );

	// testing roundtrip

	const project2 = await loadProjectFromDirectory({
		fs: volume as any,
		path: "/foo/bar.inlang",
		providePlugins: [mockPlugin],
	});

	expect(mockPlugin.importFiles).toHaveBeenCalled();

	const bundlesAfter = await project2.db
		.selectFrom("bundle")
		.selectAll()
		.execute();
	const messagesAfter = await project2.db
		.selectFrom("message")
		.selectAll()
		.execute();
	const variantsAfter = await project2.db
		.selectFrom("variant")
		.selectAll()
		.execute();

	expect(bundlesAfter).lengthOf(1);
	expect(messagesAfter).lengthOf(1);
	expect(variantsAfter).lengthOf(0);

	expect(bundlesAfter[0]).toStrictEqual(expect.objectContaining(bundles[0]));
	expect(messagesAfter[0]).toStrictEqual(
		expect.objectContaining(messagesAfter[0])
	);
});

test.todo(
	"a roundtrip with legacy load and save messages should work",
	async () => {
		const mockMessageV1: MessageV1 = {
			id: "mock-legacy-message",
			alias: {},
			selectors: [],
			variants: [
				{
					languageTag: "en",
					match: [],
					pattern: [{ type: "Text", value: "Hello from legacy message" }],
				},
			],
		};

		const volume = Volume.fromJSON({
			"/foo/bar.inlang/settings.json": JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
			} satisfies ProjectSettings),
			"/foo/i18n/en.json": JSON.stringify([mockMessageV1]),
		});

		const mockPlugin: InlangPlugin = {
			id: "mock-legacy-plugin",
			key: "mock-legacy-plugin",
			loadMessages: async ({ nodeishFs }) => {
				// expecting `loadMessages` to transform the relative path
				// to an absolute path `./i18n/en.json` -> `/foo/i18n/en.json`
				const file = await nodeishFs.readFile("./i18n/en.json", {
					encoding: "utf-8",
				});
				return JSON.parse(file as string);
			},
			saveMessages: async ({ messages, nodeishFs }) => {
				await nodeishFs.writeFile(
					"./i18n/en.json",
					new TextEncoder().encode(JSON.stringify(messages))
						.buffer as ArrayBuffer
				);
			},
		};

		const loadMessagesSpy = vi.spyOn(mockPlugin, "loadMessages");
		const saveMessagesSpy = vi.spyOn(mockPlugin, "saveMessages");

		const project = await loadProjectFromDirectory({
			fs: volume as any,
			path: "/foo/bar.inlang",
			providePlugins: [mockPlugin],
		});

		expect(loadMessagesSpy).toHaveBeenCalled();
		expect(saveMessagesSpy).not.toHaveBeenCalled();

		const bundles1 = await selectBundleNested(project.db).execute();

		expect(bundles1[0]?.messages).lengthOf(1);
		expect(bundles1[0]?.messages[0]?.variants).toEqual([
			expect.objectContaining({
				pattern: [
					{
						type: "text",
						value: "Hello from legacy message",
					},
				],
			}),
		]);

		// await project.db
		// 	.updateTable("variant")
		// 	.set({
		// 		pattern: [{ type: "text", value: "Updated message" }],
		// 	})
		// 	.where("id", "=", bundles1[0]?.messages[0]?.variants[0]?.id as string)
		// 	.execute();

		// testing the saveMessages function by removing the en.json file
		await volume.promises.rm("/foo/i18n/en.json");

		await saveProjectToDirectory({
			fs: volume.promises as any,
			project,
			path: "/foo/bar.inlang",
		});

		expect(saveMessagesSpy).toHaveBeenCalled();

		const fileTree = volume.toJSON();
		const parsed = JSON.parse(fileTree["/foo/i18n/en.json"] as string);

		expect(parsed).toEqual(expect.objectContaining([mockMessageV1]));

		// testing roundtrip

		const project2 = await loadProjectFromDirectory({
			fs: volume as any,
			path: "/foo/bar.inlang",
			providePlugins: [mockPlugin],
		});

		const bundles2 = await selectBundleNested(project2.db).execute();

		// TODO deactivated since the ids must not be equal for separate imports - matching happens on language and matcher now
		expect(bundles1).toStrictEqual(bundles2);
	}
);

test("it should preserve the formatting of existing json resource files", async () => {
	const mockJson =
		JSON.stringify(
			{ key: "value" },
			undefined,
			// tab spacing
			"\t"
		) +
		// ends with new line
		"\n";

	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: async () => {
			return [
				{
					name: "en.json",
					// no beautified json
					content: new TextEncoder().encode(JSON.stringify({ key: "value" })),
					locale: "en",
				},
			];
		},
	};

	const volume = Volume.fromJSON({
		"/foo/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
		} satisfies ProjectSettings),
		"/foo/en.json": mockJson,
	});

	const project = await loadProjectInMemory({
		blob: await newProject(),
		providePlugins: [mockPlugin],
	});

	await saveProjectToDirectory({
		path: "/foo/project.inlang",
		fs: volume.promises as any,
		project,
	});

	const fileAfterSave = await volume.promises.readFile("/foo/en.json", "utf-8");
	expect(fileAfterSave).toBe(mockJson);
});

test("adds a gitignore file if it doesn't exist", async () => {
	const fs = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const gitignore = await fs.promises.readFile(
		"/foo/bar.inlang/.gitignore",
		"utf-8"
	);
	expect(gitignore).toContain("*");
	expect(gitignore).toContain("!settings.json");
});

test("emits a README.md file for coding agents", async () => {
	const fs = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const readme = await fs.promises.readFile(
		"/foo/bar.inlang/README.md",
		"utf-8"
	);
	expect(readme).toContain("## What is this folder?");
	expect(readme).toContain("@inlang/sdk");
});

test("emits a .meta.json file with the sdk version", async () => {
	const fs = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const metaRaw = await fs.promises.readFile(
		"/foo/bar.inlang/.meta.json",
		"utf-8"
	);
	const meta = JSON.parse(
		typeof metaRaw === "string" ? metaRaw : metaRaw.toString()
	);
	expect(meta.highestSdkVersion).toBe(ENV_VARIABLES.SDK_VERSION);
});

test("throws when saving translation data to a directory without an exporter plugin", async () => {
	const fs = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await project.db
		.insertInto("bundle")
		.values({ id: "greeting", declarations: [] })
		.execute();

	await expect(
		saveProjectToDirectory({
			fs: fs.promises as any,
			project,
			path: "/foo/bar.inlang",
		})
	).rejects.toThrow(
		"saveProjectToDirectory cannot write bundles, messages, or variants without an import/export plugin"
	);
});

test("updates an existing README.md file", async () => {
	const fs = Volume.fromJSON({
		"/foo/bar.inlang/README.md": "custom readme",
	});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const readme = await fs.promises.readFile(
		"/foo/bar.inlang/README.md",
		"utf-8"
	);
	expect(readme).not.toContain("custom readme");
});

test("does not overwrite README.md or .gitignore when meta has a higher sdk version", async () => {
	const fs = Volume.fromJSON({
		"/foo/bar.inlang/.meta.json": JSON.stringify({
			highestSdkVersion: "99.0.0",
		}),
		"/foo/bar.inlang/README.md": "custom readme",
		"/foo/bar.inlang/.gitignore": "custom gitignore",
	});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const readme = await fs.promises.readFile(
		"/foo/bar.inlang/README.md",
		"utf-8"
	);
	const gitignore = await fs.promises.readFile(
		"/foo/bar.inlang/.gitignore",
		"utf-8"
	);
	const metaRaw = await fs.promises.readFile(
		"/foo/bar.inlang/.meta.json",
		"utf-8"
	);
	const meta = JSON.parse(
		typeof metaRaw === "string" ? metaRaw : metaRaw.toString()
	);
	expect(readme).toBe("custom readme");
	expect(gitignore).toBe("custom gitignore");
	expect(meta.highestSdkVersion).toBe("99.0.0");
});

test("recreates missing README.md and .gitignore when meta has a higher sdk version", async () => {
	const fs = Volume.fromJSON({
		"/foo/bar.inlang/.meta.json": JSON.stringify({
			highestSdkVersion: "99.0.0",
		}),
	});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const readme = await fs.promises.readFile(
		"/foo/bar.inlang/README.md",
		"utf-8"
	);
	const gitignore = await fs.promises.readFile(
		"/foo/bar.inlang/.gitignore",
		"utf-8"
	);
	const metaRaw = await fs.promises.readFile(
		"/foo/bar.inlang/.meta.json",
		"utf-8"
	);
	const meta = JSON.parse(
		typeof metaRaw === "string" ? metaRaw : metaRaw.toString()
	);

	expect(readme).toContain("## What is this folder?");
	expect(gitignore).toContain("*");
	expect(gitignore).toContain("!settings.json");
	expect(meta.highestSdkVersion).toBe("99.0.0");
});

test("README.md is gitignored", async () => {
	const fs = Volume.fromJSON({});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const gitignore = await fs.promises.readFile(
		"/foo/bar.inlang/.gitignore",
		"utf-8"
	);
	expect(gitignore).toContain("# everything is ignored except settings.json");
	expect(gitignore).toContain("*");
	expect(gitignore).toContain("!settings.json");
	expect(gitignore).not.toContain("!README.md");
});

test("overwrites existing .gitignore with generated entries", async () => {
	const fs = Volume.fromJSON({
		"/foo/bar.inlang/.gitignore": "custom\nnode_modules",
	});

	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		project,
		path: "/foo/bar.inlang",
	});

	const gitignore = await fs.promises.readFile(
		"/foo/bar.inlang/.gitignore",
		"utf-8"
	);
	expect(gitignore).toContain("*");
	expect(gitignore).toContain("!settings.json");
});

test("uses exportFiles when both exportFiles and saveMessages are defined", async () => {
	const exportFilesSpy = vi.fn().mockResolvedValue([]);
	const saveMessagesSpy = vi.fn();
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: exportFilesSpy,
		saveMessages: saveMessagesSpy,
	};
	const volume = Volume.fromJSON({});
	const project = await loadProjectInMemory({
		blob: await newProject(),
		providePlugins: [mockPlugin],
	});
	await saveProjectToDirectory({
		path: "/foo/project.inlang",
		fs: volume.promises as any,
		project,
	});
	expect(exportFilesSpy).toHaveBeenCalled();
	expect(saveMessagesSpy).not.toHaveBeenCalled();
});

test("skipExporting prevents exporters from running", async () => {
	const exportFilesSpy = vi.fn().mockResolvedValue([]);
	const saveMessagesSpy = vi.fn();
	const mockPlugin: InlangPlugin = {
		key: "mock",
		exportFiles: exportFilesSpy,
		saveMessages: saveMessagesSpy,
	};
	const volume = Volume.fromJSON({});
	const project = await loadProjectInMemory({
		blob: await newProject(),
		providePlugins: [mockPlugin],
	});
	await saveProjectToDirectory({
		path: "/foo/project.inlang",
		fs: volume.promises as any,
		project,
		skipExporting: true,
	});
	expect(exportFilesSpy).not.toHaveBeenCalled();
	expect(saveMessagesSpy).not.toHaveBeenCalled();
});

test("uses saveMessages when exportFiles is not defined", async () => {
	const saveMessagesSpy = vi.fn().mockResolvedValue([]);
	const mockPlugin: InlangPlugin = {
		key: "mock",
		saveMessages: saveMessagesSpy,
	};
	const volume = Volume.fromJSON({});
	const project = await loadProjectInMemory({
		blob: await newProject(),
		providePlugins: [mockPlugin],
	});
	await saveProjectToDirectory({
		path: "/foo/project.inlang",
		fs: volume.promises as any,
		project,
	});
	expect(saveMessagesSpy).toHaveBeenCalled();
});
