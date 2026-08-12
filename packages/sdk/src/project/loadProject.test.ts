import { expect, test, vi } from "vitest";
import { newProject } from "./newProject.js";
import { loadProjectInMemory } from "./loadProjectInMemory.js";
import { PluginImportError } from "../plugin/errors.js";
import { validate } from "uuid";

test("it should persist changes of bundles, messages, and variants to lix ", async () => {
	const file1 = await newProject();
	const project1 = await loadProjectInMemory({ blob: file1 });
	const bundle = await project1.db
		.insertInto("bundle")
		.defaultValues()
		.returning("id")
		.executeTakeFirstOrThrow();

	const message = await project1.db
		.insertInto("message")
		.values({
			bundleId: bundle.id,
			locale: "en",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await project1.db
		.insertInto("variant")
		.values({
			messageId: message.id,
		})
		.execute();

	const file1AfterUpdates = await project1.toBlob();
	await project1.close();

	const project2 = await loadProjectInMemory({ blob: file1AfterUpdates });
	const bundles = await project2.db.selectFrom("bundle").select("id").execute();
	const messages = await project2.db
		.selectFrom("message")
		.select("id")
		.execute();
	const variants = await project2.db
		.selectFrom("variant")
		.select("id")
		.execute();
	expect(bundles.length).toBe(1);
	expect(messages.length).toBe(1);
	expect(variants.length).toBe(1);
});

test("get and set settings", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const settings = await project.settings.get();

	expect(settings["plugin.key"]).toBeUndefined();

	const copied = structuredClone(settings);

	copied["plugin.key"] = { test: "value" };

	await project.settings.set(copied);

	const updatedSettings = await project.settings.get();
	expect(updatedSettings["plugin.key"]).toEqual({ test: "value" });
});

test("it should set sourceLanguageTag and languageTags if non-existent to make v1 plugins work", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
			},
		}),
	});
	const settings = await project.settings.get();
	expect(settings.baseLocale).toBe("en");
	expect(settings.sourceLanguageTag).toBe("en");
	expect(settings.languageTags).toEqual(["en", "de"]);
	expect(settings.locales).toEqual(["en", "de"]);
});

test("providing plugins should work", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				modules: [],
			},
		}),
		providePlugins: [{ key: "my-provided-plugin" }],
	});

	const plugins = await project.plugins.get();
	const errors = await project.errors.get();

	expect(plugins.length).toBe(1);
	expect(plugins[0]?.key).toBe("my-provided-plugin");
	expect(errors.length).toBe(0);
});

test("the Lix id is preserved when serializing a project", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const id = await project.id.get();
	const blob = await project.toBlob();
	const project2 = await loadProjectInMemory({ blob });
	expect(await project2.id.get()).toBe(id);
	expect(validate(id)).toBe(true);
});

test("uses the active account owned by Lix", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});
	const activeAccountId = await project.lix.activeAccountId();
	const activeAccount = await project.lix.db
		.selectFrom("account")
		.selectAll()
		.where("id", "=", activeAccountId)
		.executeTakeFirstOrThrow();

	expect(activeAccount).toMatchObject({
		id: activeAccountId,
		kind: "anonymous",
		status: "active",
	});
});

// test("subscribing to errors should work", async () => {
// 	const project = await loadProjectInMemory({ blob: await newProject() });

// 	expect(await project.errors.get()).toEqual([]);

// 	let errorsFromSub: readonly Error[] = [];
// 	project.errors.subscribe((value) => {
// 		errorsFromSub = value;
// 	});

// 	await project.lix.db
// 		.updateTable("file")
// 		.where("path", "=", "/settings.json")
// 		.set({
// 			data: new TextEncoder().encode(
// 				JSON.stringify({
// 					baseLocale: "en",
// 					locales: ["en"],
// 					modules: ["invalid-module.js"],
// 				})
// 			),
// 		})
// 		.execute();

// 	const errors = await project.errors.get();

// 	expect(errors.length).toBe(1);
// 	expect(errorsFromSub.length).toBe(1);
// 	expect(errorsFromSub).toStrictEqual(errors);
// });

test("closing a project should not lead to a throw", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.close();

	// capture async throws
	await new Promise((resolve) => setTimeout(resolve, 250));
});

test("project.errors.get() returns errors for modules that couldn't be imported via http", async () => {
	// Mock global fetch to simulate a network error
	global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: {
				baseLocale: "en",
				locales: ["en", "de", "fr"],
				modules: ["https://example.com/non-existent-paraglide-plugin.js"],
			},
		}),
	});

	// Get the errors from project
	const errors = await project.errors.get();

	// Verify there's at least one error
	expect(errors.length).toBeGreaterThan(0);

	// Find the error related to the HTTP import
	const httpImportError = errors.find(
		(error) =>
			error instanceof PluginImportError &&
			error.plugin === "https://example.com/non-existent-paraglide-plugin.js"
	);

	// Verify the error exists and contains appropriate information
	expect(httpImportError).toBeDefined();
	expect(httpImportError?.message).toContain(
		"non-existent-paraglide-plugin.js"
	);
	expect(httpImportError?.message).toContain("Couldn't import");

	await project.close();
});
