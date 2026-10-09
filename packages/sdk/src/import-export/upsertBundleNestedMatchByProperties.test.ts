import { expect, test } from "vitest";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { newProject } from "../project/newProject.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import type { NewBundleNested } from "../database/schema.js";
import { upsertBundleNestedMatchByProperties } from "./upsertBundleNestedMatchByProperties.js";

const text = (value: string) => [{ type: "text" as const, value }];

/** Matches the way plugins create them; the database sorts their keys. */
const bundle = (variants: Array<[string, string]>): NewBundleNested => ({
	id: "bundle",
	declarations: [],
	messages: [
		{
			bundleId: "bundle",
			locale: "en",
			selectors: [{ type: "variable-reference", name: "count" }],
			variants: variants.map(([value, pattern]) => ({
				matches:
					value === "*"
						? [{ type: "catchall-match", key: "count" }]
						: [{ type: "literal-match", key: "count", value }],
				pattern: text(pattern),
			})),
		} as any,
	],
});

test("upserting the same bundle again creates no duplicate variants", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const plural = bundle([
		["one", "One item"],
		["*", "Many items"],
	]);

	await upsertBundleNestedMatchByProperties(
		project.db,
		structuredClone(plural)
	);
	const before = await selectBundleNested(project.db).execute();
	await upsertBundleNestedMatchByProperties(
		project.db,
		structuredClone(plural)
	);

	expect(await selectBundleNested(project.db).execute()).toEqual(before);
	expect(
		await project.db.selectFrom("inlang_variant").selectAll().execute()
	).toHaveLength(2);
});

test("upserted variants take the order of the bundle", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await upsertBundleNestedMatchByProperties(
		project.db,
		bundle([
			["*", "Many items"],
			["one", "One item"],
		])
	);
	await upsertBundleNestedMatchByProperties(
		project.db,
		bundle([
			["one", "One item"],
			["*", "Many items"],
		])
	);

	const [result] = await selectBundleNested(project.db).execute();
	expect(result!.messages[0]!.variants.map((v) => v.pattern)).toEqual([
		text("One item"),
		text("Many items"),
	]);
});

test("variants of a message with the same matches are upserted into one", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await upsertBundleNestedMatchByProperties(
		project.db,
		bundle([
			["one", "first"],
			["one", "last"],
		])
	);

	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();
	expect(variants).toHaveLength(1);
	expect(variants[0]!.pattern).toEqual(text("last"));
});
