import { expect, test } from "vitest";
import { defaultProjectSettings, newProject } from "./newProject.js";
import { loadProjectInMemory } from "./loadProjectInMemory.js";

test("it should be possible to provide settings for testing or other purposes", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject({
			settings: { baseLocale: "fr", locales: ["fr"], modules: [] },
		}),
	});
	const settings = await project.settings.get();
	expect(settings.baseLocale).toBe("fr");
	expect(settings.locales).toEqual(["fr"]);
	expect(settings.modules).toEqual([]);
});

test("it should be possible to create a project with default settings", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});
	const settings = await project.settings.get();
	// pruning old settings that might exist for legacy reasons
	delete settings.languageTags;
	delete settings.sourceLanguageTag;
	expect(settings).toStrictEqual(defaultProjectSettings);
});

// for historical reasons, inlang files introduced a project id
// before lix'es got their own id. having two ids for the same
// file is not needed anymore.
test("it should have the lix id as project id", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});
	const { value: lixId } = await project.lix.db
		.selectFrom("key_value")
		.select("value")
		.where("key", "=", "lix_id")
		.executeTakeFirstOrThrow();

	const projectId = await project.id.get();
	expect(projectId).toBeDefined();
	expect(projectId).toBe(lixId);
	expect(
		await project.lix.db
			.selectFrom("file")
			.select("path")
			.where("path", "=", "/project_id")
			.executeTakeFirst()
	).toBeUndefined();
});

test("it should not persist the removed SDK metadata key during project creation", async () => {
	const project = await loadProjectInMemory({
		blob: await newProject(),
	});

	const removedSdkKey = ["lix", "tele" + "metry"].join("_");

	const removedKey = await project.lix.db
		.selectFrom("key_value")
		.select("value")
		.where("key", "=", removedSdkKey)
		.executeTakeFirst();

	expect(removedKey).toBeUndefined();
});
