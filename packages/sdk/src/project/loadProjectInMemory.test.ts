import { expect, test } from "vitest";
import { insertBundleNested } from "../query-utilities/insertBundleNested.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { newProject } from "./newProject.js";
import { loadProjectInMemory } from "./loadProjectInMemory.js";

test("roundtrip should succeed", async () => {
	const file1 = await newProject();
	const project1 = await loadProjectInMemory({ blob: file1 });
	const numBundles1 = (
		await project1.db.selectFrom("bundle").select("id").execute()
	).length;
	expect(numBundles1).toBe(0);

	// modify project
	const insertedBundle = await project1.db
		.insertInto("bundle")
		.values({
			id: "mock245",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const file1AfterUpdates = await project1.toBlob();
	await project1.close();

	const project2 = await loadProjectInMemory({ blob: file1AfterUpdates });
	const bundles = await project2.db.selectFrom("bundle").select("id").execute();
	expect(bundles.length).toBe(1);
	expect(bundles[0]?.id).toBe(insertedBundle.id);
	await project2.close();
});

test("serializes bundles with nested messages and variants", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	await insertBundleNested(project.db, {
		id: "welcome",
		declarations: [{ type: "input-variable", name: "audience" }],
		messages: [
			{
				id: "welcome_en",
				bundleId: "welcome",
				locale: "en",
				selectors: [{ type: "variable-reference", name: "audience" }],
				variants: [
					{
						id: "welcome_en_admin",
						messageId: "welcome_en",
						matches: [
							{ type: "literal-match", key: "audience", value: "admin" },
						],
						pattern: [{ type: "text", value: "Welcome, admin" }],
					},
				],
			},
		],
	});

	const blob = await project.toBlob();
	const serialized = JSON.parse(await blob.text());
	expect(serialized).toMatchObject({
		format: "inlang-lix-memory-v3",
		lixId: expect.any(String),
		bundles: [
			{
				id: "welcome",
				messages: [
					{
						id: "welcome_en",
						variants: [{ id: "welcome_en_admin" }],
					},
				],
			},
		],
	});
	await project.close();

	const reopened = await loadProjectInMemory({ blob });
	const nested = await selectBundleNested(
		reopened.db
	).executeTakeFirstOrThrow();
	expect(nested.messages[0]?.variants[0]).toMatchObject({
		id: "welcome_en_admin",
		matches: [{ type: "literal-match", key: "audience", value: "admin" }],
		pattern: [{ type: "text", value: "Welcome, admin" }],
	});
	expect(await reopened.id.get()).toBe(serialized.lixId);
	await reopened.close();

	const previousFiles = [
		...serialized.files,
		{
			path: "/project_id",
			data: Buffer.from(serialized.lixId).toString("base64"),
		},
	];
	const previousBlob = new Blob([
		JSON.stringify({
			format: "inlang-lix-memory-v2",
			files: previousFiles,
			bundles: serialized.bundles,
		}),
	]);
	const reopenedPrevious = await loadProjectInMemory({ blob: previousBlob });
	expect(await reopenedPrevious.id.get()).toBe(serialized.lixId);
	expect(
		(await selectBundleNested(reopenedPrevious.db).executeTakeFirstOrThrow())
			.messages[0]?.variants[0]?.id
	).toBe("welcome_en_admin");
	await reopenedPrevious.close();

	const legacyBlob = new Blob([
		JSON.stringify({
			format: "inlang-lix-memory-v1",
			files: previousFiles,
			bundles: serialized.bundles.map(
				(bundle: { id: string; declarations: unknown[] }) => ({
					id: bundle.id,
					declarations: bundle.declarations,
				})
			),
			messages: serialized.bundles.flatMap(
				(bundle: {
					messages: Array<{
						id: string;
						bundleId: string;
						locale: string;
						selectors: unknown[];
					}>;
				}) =>
					bundle.messages.map((message) => ({
						id: message.id,
						bundleId: message.bundleId,
						locale: message.locale,
						selectors: message.selectors,
					}))
			),
			variants: serialized.bundles.flatMap(
				(bundle: { messages: Array<{ variants: unknown[] }> }) =>
					bundle.messages.flatMap((message) => message.variants)
			),
		}),
	]);
	const reopenedLegacy = await loadProjectInMemory({ blob: legacyBlob });
	expect(await reopenedLegacy.id.get()).toBe(serialized.lixId);
	expect(
		(await selectBundleNested(reopenedLegacy.db).executeTakeFirstOrThrow())
			.messages[0]?.variants[0]?.id
	).toBe("welcome_en_admin");
	await reopenedLegacy.close();
});
