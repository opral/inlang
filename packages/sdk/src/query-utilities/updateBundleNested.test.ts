import { expect, test } from "vitest";
import { newProject } from "../project/newProject.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { insertBundleNested } from "./insertBundleNested.js";
import { selectBundleNested } from "./selectBundleNested.js";
import { updateBundleNested } from "./updateBundleNested.js";

async function projectWithGreeting() {
	const project = await loadProjectInMemory({ blob: await newProject() });
	await insertBundleNested(project.db, {
		id: "greeting",
		declarations: [],
		messages: [
			{
				id: "greeting_en",
				bundle_id: "greeting",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "greeting_en_one",
						message_id: "greeting_en",
						matches: [],
						pattern: [{ type: "text", value: "Hello" }],
					},
				],
			},
		],
	});
	return project;
}

test("updateBundleNested writes a selectBundleNested() result back", async () => {
	const project = await projectWithGreeting();
	const bundle = await selectBundleNested(project.db)
		.where("inlang_bundle.id", "=", "greeting")
		.executeTakeFirstOrThrow();
	bundle.declarations = [{ type: "input-variable", name: "name" }];
	bundle.messages[0]!.variants[0]!.pattern = [{ type: "text", value: "Hi" }];

	await updateBundleNested(project.db, bundle);

	const updated = await selectBundleNested(project.db)
		.where("inlang_bundle.id", "=", "greeting")
		.executeTakeFirstOrThrow();
	expect(updated.declarations).toEqual([
		{ type: "input-variable", name: "name" },
	]);
	expect(updated.messages[0]!.bundle_id).toBe("greeting");
	expect(updated.messages[0]!.variants[0]!.pattern).toEqual([
		{ type: "text", value: "Hi" },
	]);
	await project.close();
});

test("updateBundleNested only updates the columns that are set", async () => {
	const project = await projectWithGreeting();
	await insertBundleNested(project.db, { id: "farewell", messages: [] });

	await updateBundleNested(project.db, {
		id: "greeting",
		messages: [
			{
				id: "greeting_en",
				bundle_id: "farewell",
				variants: [{ id: "greeting_en_one" }],
			},
		],
	});

	const message = await project.db
		.selectFrom("inlang_message")
		.select(["bundle_id", "locale"])
		.where("id", "=", "greeting_en")
		.executeTakeFirstOrThrow();
	expect(message).toEqual({ bundle_id: "farewell", locale: "en" });
	const variant = await project.db
		.selectFrom("inlang_variant")
		.select("pattern")
		.where("id", "=", "greeting_en_one")
		.executeTakeFirstOrThrow();
	expect(variant.pattern).toEqual([{ type: "text", value: "Hello" }]);
	await project.close();
});

test("updateBundleNested does not write the lixcol_* columns of selectAll() rows", async () => {
	const project = await projectWithGreeting();
	const message = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.where("id", "=", "greeting_en")
		.executeTakeFirstOrThrow();
	const variant = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.where("id", "=", "greeting_en_one")
		.executeTakeFirstOrThrow();
	expect(Object.keys(message).some((key) => key.startsWith("lixcol_"))).toBe(
		true
	);

	await updateBundleNested(project.db, {
		id: "greeting",
		messages: [
			{
				...message,
				variants: [{ ...variant, pattern: [{ type: "text", value: "Hey" }] }],
			},
		],
	});

	const updated = await selectBundleNested(project.db)
		.where("inlang_bundle.id", "=", "greeting")
		.executeTakeFirstOrThrow();
	expect(updated.messages[0]!.variants[0]!.pattern).toEqual([
		{ type: "text", value: "Hey" },
	]);
	await project.close();
});
