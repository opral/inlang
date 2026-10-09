import { describe, expect, test } from "vitest";
import path from "node:path";
import {
	type Project,
	type Version,
	decode,
	importPlugin,
	insertRows,
	loadFromBlob,
	newProjectBlob,
} from "./harness.js";
import {
	type Fixture,
	fixtures,
	fixturesDir,
	readSourceFiles,
	settingsFor,
} from "./fixtures.js";
import { editorSpecs, rowsFromSpecs } from "./editorRows.js";

type Files = Array<{ locale: string; name: string; content: string }>;

/**
 * The SDK / plugin combinations that write files after the release:
 *
 * - current SDK + current plugin: apps and CLIs that upgrade
 * - published SDK + current plugin: every project on the published SDK, which
 *   loads the new plugin release from `settings.modules` (major range URL)
 */
const upgrades: Array<{ sdk: Version; plugin: Version }> = [
	{ sdk: "current", plugin: "current" },
	{ sdk: "published", plugin: "current" },
];

async function openProject(
	fixture: Fixture,
	sdk: Version,
	plugin: Version,
	blob?: Blob
): Promise<Project> {
	return loadFromBlob(
		sdk,
		blob ?? (await newProjectBlob(sdk, settingsFor(fixture))),
		[await importPlugin(fixture.key, plugin)]
	);
}

async function exportFiles(project: Project, fixture: Fixture): Promise<Files> {
	const files = await project.exportFiles({ pluginKey: fixture.key });
	return files
		.map((file) => ({
			locale: file.locale,
			name: file.name,
			content: decode(file.content),
		}))
		.sort((a, b) =>
			`${a.name}${a.locale}`.localeCompare(`${b.name}${b.locale}`)
		);
}

const asImport = (files: Files) =>
	files.map((file) => ({
		locale: file.locale,
		content: new TextEncoder().encode(file.content),
	}));

/**
 * Edits an editor makes in a project created from imported files.
 */
async function editLikeAnEditor(project: Project, fixture: Fixture) {
	const specs = editorSpecs.filter((spec) =>
		fixture.editorBundles.includes(spec.id)
	);
	await insertRows(project, rowsFromSpecs(specs, fixture.dir, "editor_"));

	if (fixture.key === "plugin.inlang.i18next") {
		// Imports of the published plugin store `item_zero` twice for English: as
		// the exact `count = 0` form and as the plural category `zero` form.
		// A translator edits the "=0" form.
		const message = await project.db
			.selectFrom("message")
			.where("bundleId", "=", "item")
			.where("locale", "=", "en")
			.select("id")
			.executeTakeFirstOrThrow();
		const variants = await project.db
			.selectFrom("variant")
			.where("messageId", "=", message.id)
			.selectAll()
			.execute();
		const exactZero = variants.find((variant: any) =>
			variant.matches.some(
				(match: any) => match.key === "count" && match.value === "0"
			)
		);
		expect(exactZero).toBeDefined();
		await project.db
			.updateTable("variant")
			.set({ pattern: [{ type: "text", value: "Your list is empty" }] })
			.where("id", "=", exactZero.id)
			.execute();
	}
}

describe.each(fixtures)("$dir", (fixture) => {
	test("files written by the published plugin stay byte-identical when they are imported and exported again after the upgrade", async () => {
		const project = await openProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		const published = await exportFiles(project, fixture);
		await project.close();
		for (const file of published) {
			await expect(file.content).toMatchFileSnapshot(
				path.join(fixturesDir, fixture.dir, "published", file.name)
			);
		}

		for (const { sdk, plugin } of upgrades) {
			const upgraded = await openProject(fixture, sdk, plugin);
			await upgraded.importFiles({
				pluginKey: fixture.key,
				files: asImport(published),
			});
			expect(
				await exportFiles(upgraded, fixture),
				`${sdk} SDK with the ${plugin} plugin`
			).toEqual(published);
			await upgraded.close();
		}
	});

	test("a database written by the published SDK and plugin exports the same files after the upgrade", async () => {
		const project = await openProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		await editLikeAnEditor(project, fixture);
		const before = await exportFiles(project, fixture);
		const blob = await project.toBlob();
		await project.close();

		for (const { sdk, plugin } of upgrades) {
			const upgraded = await openProject(fixture, sdk, plugin, blob);
			expect(
				await exportFiles(upgraded, fixture),
				`${sdk} SDK with the ${plugin} plugin`
			).toEqual(before);
			await upgraded.close();
		}
	});
});
