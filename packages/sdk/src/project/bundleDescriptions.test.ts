import { test, expect } from "vitest";
import { openLix, Value } from "@lix-js/sdk";
import { Volume, createFsFromVolume } from "memfs";
import { openProject } from "./openProject.js";
import { newProject } from "./newProject.js";
import { loadProjectInMemory } from "./loadProjectInMemory.js";
import { loadProjectFromDirectory } from "./loadProjectFromDirectory.js";
import { saveProjectToDirectory } from "./saveProjectToDirectory.js";
import { createCatalogLoader } from "./createCatalogLoader.js";
import { InlangBundleSchema } from "../schema-definitions/bundle.js";
import { insertBundleNested } from "../query-utilities/insertBundleNested.js";
import { upsertBundleNested } from "../query-utilities/upsertBundleNested.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { encodeBundleDescriptions } from "./bundleDescriptions.js";
import type { InlangPlugin } from "../plugin/schema.js";

const settings = {
	baseLocale: "en",
	locales: ["en", "de"],
	modules: [],
	"test.json": { pathPattern: "./messages/{locale}.json" },
};
// A format without native metadata, using the real SDK import/export lifecycle.
const jsonPlugin: InlangPlugin = {
	key: "test.json",
	toBeImportedFiles: ({ settings }) =>
		settings.locales.map((locale) => ({
			locale,
			path: `./messages/${locale}.json`,
		})),
	importFiles: ({ files }) => {
		const bundles = [],
			messages = [],
			variants = [];
		for (const file of files)
			for (const [id, value] of Object.entries(
				JSON.parse(new TextDecoder().decode(file.content))
			)) {
				bundles.push({ id });
				messages.push({ bundleId: id, locale: file.locale });
				variants.push({
					messageBundleId: id,
					messageLocale: file.locale,
					pattern: [{ type: "text" as const, value: String(value) }],
				});
			}
		return { bundles, messages, variants };
	},
	exportFiles: ({ messages, variants }) =>
		[...new Set(messages.map((m) => m.locale))].map((locale) => ({
			locale,
			name: `${locale}.json`,
			content: new TextEncoder().encode(
				JSON.stringify(
					Object.fromEntries(
						messages
							.filter((m) => m.locale === locale)
							.map((m) => [
								m.bundleId,
								variants
									.find((v) => v.messageId === m.id)
									?.pattern.map((p) => (p.type === "text" ? p.value : ""))
									.join(""),
							])
					)
				)
			),
		})),
};

test("migrates an existing registered bundle schema without losing rows", async () => {
	const lix = await openLix();
	const old = {
		...InlangBundleSchema,
		columns: InlangBundleSchema.columns.filter((c) => c.name !== "description"),
	};
	await lix.execute("INSERT INTO lix_registered_schema (value) VALUES ($1)", [
		Value.jsonb(old),
	]);
	await lix.execute("INSERT INTO inlang_bundle (id) VALUES ('existing')");
	const project = await openProject({ lix, settings });
	try {
		expect(
			await project.db
				.selectFrom("inlang_bundle")
				.select(["id", "description"])
				.execute()
		).toEqual([{ id: "existing", description: null }]);
		await project.db
			.updateTable("inlang_bundle")
			.set({ description: "Existing guidance" })
			.where("id", "=", "existing")
			.execute();
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBe("Existing guidance");
	} finally {
		await project.close();
		await lix.close();
	}
});

test("nested updates retain omitted descriptions, clear explicit null and survive packed reopen", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({ settings }),
	});
	try {
		await insertBundleNested(project.db, {
			id: "save",
			description: "Save money",
			messages: [],
		});
		await upsertBundleNested(project.db, {
			id: "save",
			declarations: [],
			messages: [],
		});
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBe("Save money");
		const reopened = await loadProjectInMemory({
			blob: await project.toBlob(),
		});
		try {
			expect(
				(await selectBundleNested(reopened.db).execute())[0]?.description
			).toBe("Save money");
		} finally {
			await reopened.close();
		}
		await upsertBundleNested(project.db, {
			id: "save",
			description: null,
			messages: [],
		});
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBeNull();
	} finally {
		await project.close();
	}
});

test("JSON companion survives directory saves, translation edits, portable export and clear", async () => {
	const fs = createFsFromVolume(
		Volume.fromJSON({
			"/repo/project.inlang/settings.json": JSON.stringify(settings),
			"/repo/messages/en.json": JSON.stringify({ save: "Save" }),
		})
	);
	const load = () =>
		loadProjectFromDirectory({
			fs: fs as any,
			path: "/repo/project.inlang",
			providePlugins: [jsonPlugin],
		});
	let project = await load();
	try {
		await project.db
			.updateTable("inlang_bundle")
			.set({ description: "Save money" })
			.where("id", "=", "save")
			.execute();
		await saveProjectToDirectory({
			fs: fs as any,
			project,
			path: "/repo/project.inlang",
		});
		expect(
			JSON.parse(fs.readFileSync("/repo/messages/en.json", "utf8") as string)
		).toEqual({ save: "Save" });
		expect(
			fs.readFileSync("/repo/project.inlang/.gitignore", "utf8")
		).toContain("!descriptions.json");
		await project.close();
		project = await load();
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBe("Save money");
		await project.importFiles({
			pluginKey: jsonPlugin.key,
			files: [
				{
					locale: "de",
					content: new TextEncoder().encode('{"save":"Sparen"}'),
				},
			],
		});
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBe("Save money");
		const exported = await project.exportFiles({ pluginKey: jsonPlugin.key });
		const companion = exported.find((f) => f.metadata?.inlangDescriptions)!;
		expect(
			JSON.parse(new TextDecoder().decode(companion.content)).descriptions
		).toEqual({ save: "Save money" });
		await project.db
			.updateTable("inlang_bundle")
			.set({ description: null })
			.where("id", "=", "save")
			.execute();
		await saveProjectToDirectory({
			fs: fs as any,
			project,
			path: "/repo/project.inlang",
		});
		await project.close();
		project = await load();
		expect(
			(await selectBundleNested(project.db).execute())[0]?.description
		).toBeNull();
	} finally {
		await project.close();
	}
});

test("compiler loader reads companion descriptions and detects description-only changes", async () => {
	const fs = createFsFromVolume(
		Volume.fromJSON({
			"/repo/project.inlang/settings.json": JSON.stringify(settings),
			"/repo/messages/en.json": '{"save":"Save"}',
			"/repo/project.inlang/descriptions.json": new TextDecoder().decode(
				encodeBundleDescriptions(new Map([["save", "Save money"]]))
			),
		})
	);
	const loader = createCatalogLoader({
		fs: fs as any,
		path: "/repo/project.inlang",
		providePlugins: [jsonPlugin],
	});
	const first = await loader.load();
	expect(first.bundles[0]?.description).toBe("Save money");
	fs.writeFileSync(
		"/repo/project.inlang/descriptions.json",
		encodeBundleDescriptions(new Map([["save", "Store data"]]))
	);
	const next = await loader.load();
	expect(next.bundles[0]?.description).toBe("Store data");
	fs.unlinkSync("/repo/project.inlang/descriptions.json");
	const cleared = await loader.load();
	expect(cleared.bundles[0]?.description).toBeNull();
});

test.each(["edit", "delete", "create"])(
	"directory save preserves an external companion %s before writing resources",
	async (change) => {
		const descriptionPath = "/repo/project.inlang/descriptions.json";
		const initial = encodeBundleDescriptions(new Map([["save", "Save money"]]));
		const external = encodeBundleDescriptions(
			new Map([["save", "External guidance"]])
		);
		const fs = createFsFromVolume(
			Volume.fromJSON({
				"/repo/project.inlang/settings.json": JSON.stringify(settings),
				"/repo/messages/en.json": '{"save":"Save"}',
				...(change === "create"
					? {}
					: {
							[descriptionPath]: new TextDecoder().decode(initial),
						}),
			})
		);
		const project = await loadProjectFromDirectory({
			fs: fs as any,
			path: "/repo/project.inlang",
			providePlugins: [jsonPlugin],
		});
		try {
			await project.db
				.updateTable("inlang_bundle")
				.set({ description: "Local guidance" })
				.where("id", "=", "save")
				.execute();
			if (change === "delete") fs.unlinkSync(descriptionPath);
			else fs.writeFileSync(descriptionPath, external);
			await expect(
				saveProjectToDirectory({
					fs: fs as any,
					project,
					path: "/repo/project.inlang",
				})
			).rejects.toThrow("descriptions.json changed");
			expect(fs.readFileSync("/repo/messages/en.json", "utf8")).toBe(
				'{"save":"Save"}'
			);
			if (change === "delete")
				expect(fs.existsSync(descriptionPath)).toBe(false);
			else
				expect(fs.readFileSync(descriptionPath)).toEqual(Buffer.from(external));
		} finally {
			await project.close();
		}
	}
);

test("repeated directory saves advance the companion baseline", async () => {
	const fs = createFsFromVolume(
		Volume.fromJSON({
			"/repo/project.inlang/settings.json": JSON.stringify(settings),
			"/repo/messages/en.json": '{"save":"Save"}',
		})
	);
	const project = await loadProjectFromDirectory({
		fs: fs as any,
		path: "/repo/project.inlang",
		providePlugins: [jsonPlugin],
	});
	try {
		for (const description of ["First guidance", "Second guidance"]) {
			await project.db
				.updateTable("inlang_bundle")
				.set({ description })
				.where("id", "=", "save")
				.execute();
			await saveProjectToDirectory({
				fs: fs as any,
				project,
				path: "/repo/project.inlang",
			});
			expect(
				JSON.parse(
					fs.readFileSync(
						"/repo/project.inlang/descriptions.json",
						"utf8"
					) as string
				).descriptions
			).toEqual({ save: description });
		}
	} finally {
		await project.close();
	}
});
