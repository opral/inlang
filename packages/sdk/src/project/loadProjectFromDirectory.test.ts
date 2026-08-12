/* eslint-disable @typescript-eslint/no-unused-vars */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { ProjectSettings } from "../json-schema/settings.js";
import { Volume } from "memfs";
import nodePath from "node:path";
import {
	loadProjectFromDirectory,
	ResourceFileImportError,
	WarningDeprecatedLintRule,
} from "./loadProjectFromDirectory.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { Text } from "../json-schema/pattern.js";
import type { InlangPlugin } from "../plugin/schema.js";
import type {
	MessageV1,
	VariantV1,
} from "../json-schema/old-v1-message/schemaV1.js";
import { saveProjectToDirectory } from "./saveProjectToDirectory.js";
import { insertBundleNested } from "../query-utilities/insertBundleNested.js";
import { ENV_VARIABLES } from "../services/env-variables/index.js";

test("plugin.loadMessages and plugin.saveMessages must not be configured together with import export", async () => {
	const mockLegacyPlugin: InlangPlugin = {
		key: "mock-legacy-plugin",
		loadMessages: async () => {
			return [];
		},
		saveMessages: async () => {},
	};

	const mockLegacyPlugin2: InlangPlugin = {
		key: "mock-legacy-plugin-2",
		loadMessages: async () => {
			return [];
		},
		saveMessages: async () => {},
	};

	const mockImportExportPlugin: InlangPlugin = {
		key: "mock-import-export-plugin",
		exportFiles: () => {
			return [];
		},
		importFiles: () => {
			return {} as any;
		},
	};

	await expect(
		(async () => {
			await loadProjectFromDirectory({
				fs: Volume.fromJSON({
					"./project.inlang/settings.json": JSON.stringify({
						baseLocale: "en",
						locales: ["en", "de"],
						modules: [],
					} satisfies ProjectSettings),
				}) as any,
				path: "./project.inlang",
				providePlugins: [
					mockLegacyPlugin,
					mockLegacyPlugin2,
					mockImportExportPlugin,
				],
			});
		})()
	).rejects.toThrowError();

	await expect(
		(async () => {
			await loadProjectFromDirectory({
				fs: Volume.fromJSON({
					"./project.inlang/settings.json": JSON.stringify({
						baseLocale: "en",
						locales: ["en", "de"],
						modules: [],
					} satisfies ProjectSettings),
				}) as any,
				path: "./project.inlang",
				providePlugins: [
					mockLegacyPlugin,
					mockLegacyPlugin2,
					mockImportExportPlugin,
				],
			});
		})()
	).rejects.toThrowError();
});

test("plugin.loadMessages and plugin.saveMessages should work for legacy purposes", async () => {
	const mockLegacyPlugin: InlangPlugin = {
		id: "mock-legacy-plugin",
		// @ts-expect-error - id is deprecated, key can be undefined
		key: undefined,
		loadMessages: async ({ nodeishFs, settings }) => {
			const pathPattern = settings["plugin.mock-plugin"]?.pathPattern as string;

			const messages: MessageV1[] = [];

			// @ts-expect-error - language tag is always given by the sdk v2
			for (const languageTag of settings.languageTags) {
				const data = await nodeishFs.readFile(
					pathPattern.replace("{languageTag}", languageTag)
				);

				for (const [key, value] of Object.entries(
					JSON.parse(data.toString())
				)) {
					const exisitngMessage = messages.find(
						(message) => message.id === key
					);
					const variant = {
						languageTag: languageTag,
						match: [],
						pattern: [{ type: "Text", value: value }],
					} as VariantV1;
					if (exisitngMessage !== undefined) {
						exisitngMessage.variants.push(variant);
					} else {
						messages.push({
							alias: {},
							id: key,
							selectors: [],
							variants: [variant],
						});
					}
				}
			}

			return messages;
		},
		saveMessages: async ({ messages, nodeishFs, settings }) => {
			const pathPattern = settings["plugin.mock-plugin"]?.pathPattern as string;
			for (const languageTag of settings.languageTags!) {
				const messagesInLanguage = {} as Record<string, string>;
				for (const message of messages) {
					const variantsInLanguage = message.variants.filter(
						(variant) => variant.languageTag === languageTag
					);
					if (variantsInLanguage.length > 1) {
						// data will get lost during export => throw?
					} else if (variantsInLanguage.length === 1) {
						if (
							variantsInLanguage[0]!.pattern.length != 1 ||
							variantsInLanguage[0]!.pattern[0]?.type !== "Text"
						) {
							// throw?
						}
						messagesInLanguage[message.id] = (
							variantsInLanguage[0]!.pattern[0]! as any
						).value;
					}
					// else no-op
				}
				await nodeishFs.writeFile(
					pathPattern.replace("{languageTag}", languageTag),
					JSON.stringify(messagesInLanguage, null, 2)
				);
			}
		},
	};
	const mockRepo = {
		"./README.md": "# Hello World",
		"./src/index.js": "console.log('Hello World')",
		"./src/translations/en.json": JSON.stringify({
			key1: "value1",
			key2: "value2",
		}),
		"./src/translations/de.json": JSON.stringify({
			key1: "wert1",
			key2: "wert2",
		}),
		"./project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: ["./mock-module.js"],
			"plugin.mock-plugin": {
				pathPattern: "./src/translations/{languageTag}.json",
			},
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	let project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "./project.inlang",
		providePlugins: [mockLegacyPlugin],
	});

	await insertBundleNested(project.db, {
		id: "key-id",
		messages: [
			{
				id: "mock-message",
				bundleId: "mock-bundle",
				locale: "en",
				selectors: [],
				variants: [
					{
						messageId: "mock-message",
						pattern: [
							{
								type: "text",
								value: "JOJO",
							},
						],
					},
				],
			},
		],
	});

	await saveProjectToDirectory({
		fs: fs.promises as any,
		path: "./project.inlang",
		project,
	});

	project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "./project.inlang",
		providePlugins: [mockLegacyPlugin],
	});

	const bundles = await selectBundleNested(project.db).execute();

	const bundlesOrdered = bundles.sort((a, b) => a.id.localeCompare(b.id));

	expect(bundles.length).toBe(3);
	expect(bundlesOrdered[0]?.messages[0]?.locale).toBe("en");
	expect(
		(bundlesOrdered[0]?.messages[0]?.variants[0]?.pattern[0] as Text)?.value
	).toBe("JOJO");

	// TODO fix
	// expect(bundlesOrdered[0]?.messages[9]?.locale).toBe("en");
	// expect(
	// 	(bundlesOrdered[0]?.messages[1]?.variants[0]?.pattern[0] as Text)?.value
	// ).toBe("wert1");

	// expect(bundlesOrdered[1]?.messages[0]?.locale).toBe("en");
	// expect(
	// 	(bundlesOrdered[1]?.messages[0]?.variants[0]?.pattern[0] as Text)?.value
	// ).toBe("value2");

	// expect(bundlesOrdered[1]?.messages[1]?.locale).toBe("de");
	// expect(
	// 	(bundlesOrdered[1]?.messages[1]?.variants[0]?.pattern[0] as Text)?.value
	// ).toBe("wert2");
});

const mockSettings = {
	baseLocale: "en",
	locales: ["en", "de"],
	modules: [],
} satisfies ProjectSettings;

const mockDirectory = {
	"/project.inlang/cache/plugin/29j49j2": "cache value",
	"/project.inlang/.gitignore": "git value",
	"/project.inlang/.meta.json": JSON.stringify({
		highestSdkVersion: ENV_VARIABLES.SDK_VERSION,
	}),
	"/project.inlang/prettierrc.json": "prettier value",
	"/project.inlang/README.md": "readme value",
	"/project.inlang/settings.json": JSON.stringify(mockSettings),
};

describe("it should keep files between the inlang directory and lix in sync", async () => {
	test("updates .meta.json to the current sdk version on load", async () => {
		const fs = Volume.fromJSON({
			"/project.inlang/.meta.json": JSON.stringify({
				highestSdkVersion: "1.0.0",
			}),
			"/project.inlang/settings.json": JSON.stringify(mockSettings),
		});

		await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
		});

		const metaRaw = await fs.promises.readFile(
			"/project.inlang/.meta.json",
			"utf-8"
		);
		const meta = JSON.parse(
			typeof metaRaw === "string" ? metaRaw : metaRaw.toString()
		);
		expect(meta.highestSdkVersion).toBe(ENV_VARIABLES.SDK_VERSION);
	});

	test("does not downgrade .meta.json when sdk version is lower", async () => {
		const fs = Volume.fromJSON({
			"/project.inlang/.meta.json": JSON.stringify({
				highestSdkVersion: "99.0.0",
			}),
			"/project.inlang/settings.json": JSON.stringify(mockSettings),
		});

		await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
		});

		const metaRaw = await fs.promises.readFile(
			"/project.inlang/.meta.json",
			"utf-8"
		);
		const meta = JSON.parse(
			typeof metaRaw === "string" ? metaRaw : metaRaw.toString()
		);
		expect(meta.highestSdkVersion).toBe("99.0.0");
	});

	test("updates README.md and .gitignore when meta version is lower", async () => {
		const fs = Volume.fromJSON({
			"/project.inlang/.meta.json": JSON.stringify({
				highestSdkVersion: "1.0.0",
			}),
			"/project.inlang/README.md": "custom readme",
			"/project.inlang/.gitignore": "custom gitignore",
			"/project.inlang/settings.json": JSON.stringify(mockSettings),
		});

		await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
		});

		const readme = await fs.promises.readFile(
			"/project.inlang/README.md",
			"utf-8"
		);
		const gitignore = await fs.promises.readFile(
			"/project.inlang/.gitignore",
			"utf-8"
		);

		expect(readme).not.toContain("custom readme");
		expect(gitignore).toContain("*");
		expect(gitignore).toContain("!settings.json");
	});

	test("recreates README.md and .gitignore when meta version is higher but files are missing", async () => {
		const fs = Volume.fromJSON({
			"/project.inlang/.meta.json": JSON.stringify({
				highestSdkVersion: "99.0.0",
			}),
			"/project.inlang/settings.json": JSON.stringify(mockSettings),
		});

		await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
		});

		const readme = await fs.promises.readFile(
			"/project.inlang/README.md",
			"utf-8"
		);
		const gitignore = await fs.promises.readFile(
			"/project.inlang/.gitignore",
			"utf-8"
		);
		const metaRaw = await fs.promises.readFile(
			"/project.inlang/.meta.json",
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

	test("files from directory should be available via lix after project has been loaded from directory", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		const files = await project.lix.db.selectFrom("file").selectAll().execute();

		expect(files.length).toBe(6);

		const filesByPath = files.reduce((acc, file) => {
			acc[file.path] = new TextDecoder().decode(file.content);
			return acc;
		}, {} as any);

		expect(filesByPath["/cache/plugin/29j49j2"]).toBe("cache value");
		expect(filesByPath["/.gitignore"]).toBe("git value");
		expect(filesByPath["/.meta.json"]).toBe(
			JSON.stringify({ highestSdkVersion: ENV_VARIABLES.SDK_VERSION })
		);
		expect(filesByPath["/prettierrc.json"]).toBe("prettier value");
		expect(filesByPath["/README.md"]).toBe("readme value");
		expect(filesByPath["/settings.json"]).toBe(JSON.stringify(mockSettings));
	});

	test("does not recreate project_id on disk during sync", async () => {
		const fs = Volume.fromJSON(mockDirectory);

		await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
		});

		const files = await fs.promises.readdir("/project.inlang");
		expect(files).not.toContain("project_id");
	});

	// the test doesn't work on non-windows systems
	// mocking the node:path to use backlashes has no effect
	test.skip("files from directory should be available via lix if the OS uses backlashes as folder separators", async () => {
		const mockWindowsDirectory = {
			"\\project.inlang\\cache\\plugin\\29j49j2": "cache value",
			"\\project.inlang\\.gitignore": "git value",
			"\\project.inlang\\.meta.json": JSON.stringify({
				highestSdkVersion: ENV_VARIABLES.SDK_VERSION,
			}),
			"\\project.inlang\\prettierrc.json": "prettier value",
			"\\project.inlang\\README.md": "readme value",
			"\\project.inlang\\settings.json": JSON.stringify(mockSettings),
		};

		// Temporarily set the platform to win32
		Object.defineProperty(process, "platform", {
			value: "win32",
		});

		Object.defineProperty(nodePath, "sep", {
			value: "\\",
		});

		const fs = Volume.fromJSON(mockWindowsDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "\\project.inlang",
		});

		const files = await project.lix.db.selectFrom("file").selectAll().execute();

		expect(files.length).toBe(6 + 1 /* the db.sqlite file */);

		const filesByPath = files.reduce((acc, file) => {
			acc[file.path] = new TextDecoder().decode(file.content);
			return acc;
		}, {} as any);

		expect(filesByPath["/cache/plugin/29j49j2"]).toBe("cache value");
		expect(filesByPath["/.gitignore"]).toBe("git value");
		expect(filesByPath["/.meta.json"]).toBe(
			JSON.stringify({ highestSdkVersion: ENV_VARIABLES.SDK_VERSION })
		);
		expect(filesByPath["/prettierrc.json"]).toBe("prettier value");
		expect(filesByPath["/README.md"]).toBe("readme value");
		expect(filesByPath["/settings.json"]).toBe(JSON.stringify(mockSettings));
	});

	test("does not rewrite unchanged files when nodePath.relative returns Windows separators", async () => {
		const fs = Volume.fromJSON(mockDirectory);
		const originalRelative = nodePath.relative.bind(nodePath);
		const relativeSpy = vi
			.spyOn(nodePath, "relative")
			.mockImplementation((from, to) =>
				originalRelative(from, to)
					.split(nodePath.posix.sep)
					.join(nodePath.win32.sep)
			);
		const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync");
		const writeFileSpy = vi.spyOn(fs.promises, "writeFile");

		try {
			const project = await loadProjectFromDirectory({
				fs: fs as any,
				path: "/project.inlang",
			});

			await project.close();

			const writesToProjectFiles = [
				...writeFileSyncSpy.mock.calls.map((call) => String(call[0])),
				...writeFileSpy.mock.calls.map((call) => String(call[0])),
			].filter((path) => path.startsWith("/project.inlang/"));

			expect(relativeSpy).toHaveBeenCalled();
			expect(writesToProjectFiles).toEqual([]);
		} finally {
			writeFileSpy.mockRestore();
			writeFileSyncSpy.mockRestore();
			relativeSpy.mockRestore();
		}
	});

	test("file created in fs should be avaialable in lix ", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		fs.writeFileSync(
			"/project.inlang/file-created-on-fs.txt",
			"value written by fs",
			{
				encoding: "utf-8",
			}
		);

		// lets wait a seconds to allow the sync process catch up
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));

		const randomFileInLix = await project.lix.db
			.selectFrom("file")
			.selectAll()
			.where("path", "=", "/file-created-on-fs.txt")
			.executeTakeFirstOrThrow();

		expect(new TextDecoder().decode(randomFileInLix.content)).toBe(
			"value written by fs"
		);
	});

	test("file updated in fs should be avaialable in lix ", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		// "changes to a file on disk should reflect in lix
		fs.writeFileSync(
			"/project.inlang/settings.json",
			JSON.stringify({
				...mockSettings,
				baseLocale: "brand-new-locale-written-to-fs-file",
			})
		);

		// console.log("wrting fs settings");
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));
		const fileInLix = await project.lix.db
			.selectFrom("file")
			.selectAll()
			.where("path", "=", "/settings.json")
			.executeTakeFirstOrThrow();

		const settingsAfterUpdateOnDisk = JSON.parse(
			new TextDecoder().decode(fileInLix.content)
		);

		expect(settingsAfterUpdateOnDisk.baseLocale).toBe(
			"brand-new-locale-written-to-fs-file"
		);
	});

	test("file deleted in fs should be droped from lix ", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		const filesInLixBefore = await project.lix.db
			.selectFrom("file")
			.selectAll()
			.where("path", "=", "/README.md")
			.execute();

		expect(filesInLixBefore.length).toBe(1);

		// "changes to a file on disk should reflect in lix
		fs.unlinkSync("/project.inlang/README.md");

		// console.log("wrting fs settings");
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));
		const fileInLixAfter = await project.lix.db
			.selectFrom("file")
			.selectAll()
			.where("path", "=", "/README.md")
			.execute();

		expect(fileInLixAfter.length).toBe(0);
	});

	test("file created in lix should be avaialable in fs ", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		await project.lix.db
			.insertInto("file")
			.values({
				path: "/file-created-in.lix.txt",
				content: new TextEncoder().encode("random value lix"),
			})
			.execute();

		// lets wait a seconds to allow the sync process catch up
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));

		const randomFileOnDiskContent = fs
			.readFileSync("/project.inlang/file-created-in.lix.txt")
			.toString();
		expect(randomFileOnDiskContent).toBe("random value lix");
	});

	test("file updated in lix should be avaialable in fs ", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		// console.log("wrting lix settings");
		// changes to a file in lix should reflect in the project directory
		await project.lix.db
			.updateTable("file")
			.where("path", "=", "/settings.json")
			.set({
				content: new TextEncoder().encode(
					JSON.stringify({ ...mockSettings, baseLocale: "brand-new-locale2" })
				),
			})
			.execute();

		// lets wait a seconds to allow the sync process catch up
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));

		const fileOnDisk = fs.readFileSync("/project.inlang/settings.json");
		const settings = JSON.parse(fileOnDisk.toString());

		expect(settings.baseLocale).toBe("brand-new-locale2");
	});

	test("file deleted in lix should be gone in fs as awell", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		// console.log("wrting lix settings");
		// changes to a file in lix should reflect in the project directory
		await project.lix.db
			.deleteFrom("file")
			.where("path", "=", "/.gitignore")
			.execute();

		// lets wait a seconds to allow the sync process catch up
		await new Promise((resolve) => setTimeout(resolve, syncInterval + 10));

		const fileExistsOnDisk = fs.existsSync("/project.inlang/.gitignore");

		expect(fileExistsOnDisk).toBe(false);
	});

	test("file updated in fs and lix (conflicting) should result in the fs state", async () => {
		const syncInterval = 100;
		const fs = Volume.fromJSON(mockDirectory);

		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/project.inlang",
			syncInterval: syncInterval,
		});

		// console.log("wrting fs settings simultanous");
		// changes to a file on disk and lix at the same time should lead to the fs version
		fs.writeFileSync(
			"/project.inlang/settings.json",
			JSON.stringify({ ...mockSettings, baseLocale: "fs-version" })
		);

		// console.log("wrting lix settings simultanous");
		await project.lix.db
			.updateTable("file")
			.where("path", "=", "/settings.json")
			.set({
				content: new TextEncoder().encode(
					JSON.stringify({ ...mockSettings, baseLocale: "lix-version" })
				),
			})
			.execute();

		// lets wait a seconds to allow the sync process catch up
		await new Promise((resolve) => setTimeout(resolve, 1010));

		const fileOnDiskUpdated = fs.readFileSync("/project.inlang/settings.json");
		const settingsUpdated = JSON.parse(fileOnDiskUpdated.toString());

		expect(settingsUpdated.baseLocale).toBe("fs-version");

		const fileInLixUpdated = await project.lix.db
			.selectFrom("file")
			.selectAll()
			.where("path", "=", "/settings.json")
			.executeTakeFirstOrThrow();

		const settingsAfterUpdateOnDiskAndLix = JSON.parse(
			new TextDecoder().decode(fileInLixUpdated.content)
		);

		expect(settingsAfterUpdateOnDiskAndLix.baseLocale).toBe("fs-version");
	});
});

test("errors from importing translation files should be shown", async () => {
	const mock = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mock);

	const proxiedFs = new Proxy(fs, {
		get: (target, prop) => {
			if (prop === "promises") {
				// Intercept the 'promises' object
				return new Proxy(target.promises, {
					get: (promisesTarget, promisesProp) => {
						if (promisesProp === "readFile") {
							// @ts-expect-error - we are mocking the fs
							return (path, ...args) => {
								if (path.endsWith("some-file.json")) {
									throw new Error("MOCK ERROR");
								}
								return promisesTarget.readFile(path, ...args);
							};
						}
						return Reflect.get(promisesTarget, promisesProp);
					},
				});
			}
			return Reflect.get(target, prop);
		},
	});

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		importFiles: async () => {
			return { bundles: [], messages: [], variants: [] };
		},
		toBeImportedFiles: async () => {
			return [{ path: "./some-file.json", locale: "mock" }];
		},
	};

	const project = await loadProjectFromDirectory({
		fs: proxiedFs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin],
	});

	const errors = await project.errors.get();
	// TODO deactivated for now - we need to proxy fs.promises or change the signature of loadProject
	expect(errors).toHaveLength(1);
	expect(errors[0]).toBeInstanceOf(ResourceFileImportError);
});

// it happens often that a resource file doesn't exist yet on import
test("errors from importing translation files that are ENOENT should not be shown", async () => {
	const mock = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mock);

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		importFiles: async () => {
			return { bundles: [], messages: [], variants: [] };
		},
		toBeImportedFiles: async () => {
			return [{ path: "./some-non-existing-file.json", locale: "mock" }];
		},
	};

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin],
	});

	const errors = await project.errors.get();
	expect(errors).toHaveLength(0);
});

// it happens often that a resource file doesn't exist yet on import
test("it should pass toBeImportedMetadata on import", async () => {
	const mock = {
		"/foo/en.json": JSON.stringify({}),
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mock);

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		toBeImportedFiles: async () => {
			return [
				{
					path: "/foo/en.json",
					locale: "mock",
					metadata: {
						foo: "bar",
					},
				},
			];
		},
		importFiles: async () => {
			return { bundles: [], messages: [], variants: [] };
		},
	};

	const toBeSpy = vi.spyOn(mockPlugin, "toBeImportedFiles");
	const importSpy = vi.spyOn(mockPlugin, "importFiles");

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin],
	});

	expect(toBeSpy).toHaveBeenCalled();

	expect(importSpy).toHaveBeenCalledWith(
		expect.objectContaining({
			files: [
				expect.objectContaining({
					toBeImportedFilesMetadata: {
						foo: "bar",
					},
				}),
			],
		})
	);
});

test("it should provide plugins from disk for backwards compatibility but warn that those plugins are not portable", async () => {
	const mockRepo = {
		"/local-plugins/mock-plugin.js": "export default { key: 'mock-plugin' }",
		"/local-plugins/mock-rule.js":
			"export default { id: 'messageLintRule.mock }",
		"/website/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [
				"../local-plugins/mock-plugin.js",
				"../local-plugins/mock-rule.js",
			],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/website/project.inlang",
	});

	const plugins = await project.plugins.get();
	const errors = await project.errors.get();
	const settings = await project.settings.get();

	expect(plugins.length).toBe(1);
	expect(plugins[0]?.key).toBe("mock-plugin");

	expect(errors.length).toBe(1);
	expect(errors[0]).toBeInstanceOf(WarningDeprecatedLintRule);

	// it should not remove the module from the settings
	// else roundtrips would not work
	expect(settings.modules?.[0]).toBe("../local-plugins/mock-plugin.js");
});

// https://github.com/opral/inlang/issues/174
test("plugin calls that use fs should be intercepted to use an absolute path", async () => {
	process.cwd = () => "/";

	const mockRepo = {
		"/messages/en.json": JSON.stringify({
			key1: "value1",
			key2: "value2",
		}),
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.mock-plugin": {
				pathPattern: "./messages/{locale}.json",
			},
		} satisfies ProjectSettings),
	};

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		loadMessages: async ({ nodeishFs, settings }) => {
			const pathPattern = settings["plugin.mock-plugin"]?.pathPattern.replace(
				"{locale}",
				"en"
			) as string;
			const file = await nodeishFs.readFile(pathPattern);
			// reading the file should be possible without an error
			expect(file.toString()).toBe(
				JSON.stringify({
					key1: "value1",
					key2: "value2",
				})
			);
			return [];
		},
		saveMessages: async ({ nodeishFs, settings }) => {
			const pathPattern = settings["plugin.mock-plugin"]?.pathPattern.replace(
				"{locale}",
				"en"
			) as string;
			const file = new TextEncoder().encode(
				JSON.stringify({
					key1: "value1",
					key2: "value2",
					key3: "value3",
				})
			);
			await nodeishFs.writeFile(pathPattern, file.buffer as ArrayBuffer);
		},
		toBeImportedFiles: async ({ settings }) => {
			const pathPattern = settings["plugin.mock-plugin"]?.pathPattern.replace(
				"{locale}",
				"en"
			) as string;
			return [
				{
					path: pathPattern,
					locale: "en",
				},
			];
		},
	};

	const fs = Volume.fromJSON(mockRepo);

	const loadMessagesSpy = vi.spyOn(mockPlugin, "loadMessages");
	const saveMessagesSpy = vi.spyOn(mockPlugin, "saveMessages");
	const toBeImportedFilesSpy = vi.spyOn(mockPlugin, "toBeImportedFiles");
	const fsReadFileSpy = vi.spyOn(fs.promises, "readFile");
	const fsWriteFileSpy = vi.spyOn(fs.promises, "writeFile");

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin],
	});

	expect(loadMessagesSpy).toHaveBeenCalled();
	expect(fsReadFileSpy).toHaveBeenCalledWith("/messages/en.json", undefined);

	// todo test that saveMessages works too.
	// await project.db.insertInto("bundle").defaultValues().execute();

	// const translationFile = await fs.readFile("/messages/en.json", "utf-8");

	// expect(translationFile).toBe(
	// 	JSON.stringify({
	// 		key1: "value1",
	// 		key2: "value2",
	// 		key3: "value3",
	// 	})
	// );

	// expect(fsWriteFileSpy).toHaveBeenCalledWith(
	// 	"/messages/en.json",
	// 	JSON.stringify({
	// 		key1: "value1",
	// 		key2: "value2",
	// 		key3: "value3",
	// 	}),
	// 	"utf-8"
	// );

	// expect(saveMessagesSpy).toHaveBeenCalled();
	// expect(toBeImportedFilesSpy).toHaveBeenCalled();
});

test("it can import plugins via http", async () => {
	const mockRepo = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: ["https://example.com/plugin.js"],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	const mockPluginModule = `export default {
			key: "mock-plugin"	
		}`;

	global.fetch = vi.fn(() => Promise.resolve(new Response(mockPluginModule)));

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const plugins = await project.plugins.get();

	expect(global.fetch).toHaveBeenCalledWith("https://example.com/plugin.js");
	expect(plugins.length).toBe(1);

	const pluginCache = await project.lix.db
		.selectFrom("file")
		.selectAll()
		.where("path", "like", "/cache/plugins/%")
		.execute();

	expect(
		pluginCache.some(
			(file) => new TextDecoder().decode(file.content) === mockPluginModule
		),
		"expecting the plugin to be cached"
	).toBe(true);
});

test("plugins that provide both loadMessages and importFiles should be allowed and the importFiles should be called", async () => {
	const mockRepo = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: [],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	const mockPlugin: InlangPlugin = {
		key: "mock-plugin",
		loadMessages: vi.fn(async () => []),
		importFiles: vi.fn(async () => {
			return { bundles: [], messages: [], variants: [] };
		}),
	};

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin],
	});

	expect(mockPlugin.importFiles).toHaveBeenCalled();
	expect(mockPlugin.loadMessages).not.toHaveBeenCalled();
});

test("providing multiple plugins that have legacy loadMessages and saveMessages function should be possible if they have import/export functions", async () => {
	const mockRepo = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: [],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	const mockPlugin1: InlangPlugin = {
		key: "mock-plugin1",
		loadMessages: vi.fn(async () => []),
		importFiles: vi.fn(async () => {
			return { bundles: [], messages: [], variants: [] };
		}),
	};

	const mockPlugin2: InlangPlugin = {
		key: "mock-plugin2",
		loadMessages: vi.fn(async () => []),
		importFiles: vi.fn(async () => {
			return { bundles: [], messages: [], variants: [] };
		}),
	};

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
		providePlugins: [mockPlugin1, mockPlugin2],
	});

	expect(mockPlugin1.importFiles).toHaveBeenCalled();
	expect(mockPlugin1.loadMessages).not.toHaveBeenCalled();

	expect(mockPlugin2.importFiles).toHaveBeenCalled();
	expect(mockPlugin2.loadMessages).not.toHaveBeenCalled();
});

// https://github.com/opral/inlang/issues/228
// Skipped: project ids are intentionally unstable for unpacked projects for now.
test.skip("the lix id should be stable between loadings of the same project", async () => {
	const mockRepo = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: [],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	const project1 = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const inlangId = await project1.id.get();

	const { value: lixId } = await project1.lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	// the project_id file does not exist on the first load
	await saveProjectToDirectory({
		fs: fs.promises as any,
		path: "/project.inlang",
		project: project1,
	});

	const project2 = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const inlangId2 = await project2.id.get();

	const { value: lixId2 } = await project2.lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	const project3 = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const inlangId3 = await project3.id.get();
	const { value: lixId3 } = await project3.lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	expect(inlangId).not.toBeUndefined();
	expect(inlangId).toBe(inlangId2);
	expect(inlangId).toBe(inlangId3);

	expect(lixId).not.toBeUndefined();
	expect(lixId).toBe(lixId2);
	expect(lixId).toBe(lixId3);
});

test("it imports plugins from cache if the network is not available", async () => {
	const mockRepo = {
		"/project.inlang/settings.json": JSON.stringify({
			baseLocale: "en",
			locales: ["en"],
			modules: ["http://mock.com/plugin.js"],
		} satisfies ProjectSettings),
	};

	const fs = Volume.fromJSON(mockRepo);

	globalThis.fetch = vi.fn(() =>
		Promise.resolve(
			new Response(`
		export default {
			key: "mock-plugin"	
		}`)
		)
	);

	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const plugins = await project.plugins.get();

	expect(plugins.length).toBe(1);
	expect(plugins[0]?.key).toBe("mock-plugin");

	globalThis.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

	const cache = await fs.promises.readdir("/project.inlang/cache/plugins");
	expect(cache.length).toBe(1);

	const project2 = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/project.inlang",
	});

	const plugins2 = await project2.plugins.get();

	expect(plugins2.length).toBe(1);
	expect(plugins2[0]?.key).toBe("mock-plugin");
});
