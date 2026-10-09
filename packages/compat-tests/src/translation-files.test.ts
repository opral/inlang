import { describe, expect, test } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
	type Project,
	type Rows,
	contentOf,
	insertRows,
	selectRows,
	tables,
} from "./harness.js";
import {
	type Files,
	type Fixture,
	exportFixtureFiles as exportFiles,
	fixtures,
	fixturesDir,
	openFixtureProject as openProject,
	readSourceFiles,
	upgrades,
	withVariantOrder,
} from "./fixtures.js";
import { editorSpecs, rowsFromSpecs } from "./editorRows.js";

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
		const t = tables(project.version);
		const message = await project.db
			.selectFrom(t.message)
			.where(t.bundleId, "=", "item")
			.where("locale", "=", "en")
			.select("id")
			.executeTakeFirstOrThrow();
		const variants = await project.db
			.selectFrom(t.variant)
			.where(t.messageId, "=", message.id)
			.selectAll()
			.execute();
		const exactZero = variants.find((variant: any) =>
			variant.matches.some(
				(match: any) => match.key === "count" && match.value === "0"
			)
		);
		expect(exactZero).toBeDefined();
		await project.db
			.updateTable(t.variant)
			.set({ pattern: [{ type: "text", value: "Your list is empty" }] })
			.where("id", "=", exactZero.id)
			.execute();
	}
}

function listFiles(dir: string): string[] {
	return fs
		.readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
		.sort();
}

/**
 * Bundles that the current plugin imports differently from the published
 * one, from the same file. See corrections.test.ts.
 */
const importChanges: Record<string, string[]> = {
	// `#` in a plural with an offset keeps the offset (`icu:pound offset=1`)
	icu1: ["guests"],
};

/**
 * Messages that editors stored with a variant after the catch-all, which the
 * published plugin wrote in that order. Runtimes that try variants in file
 * order (Paraglide JS 2.26) never select that variant. The current plugin
 * writes the catch-all last; nothing else of the file changes. See
 * corrections.test.ts.
 */
const variantOrderChanges: Record<string, Record<string, string[]>> = {
	"message-format": {
		"editor_items_count/en": ["countPlural=one", "countPlural=*"],
		"editor_items_count/de": ["countPlural=one", "countPlural=*"],
		"editor_pronoun/en": ["gender=male", "gender=female", "gender=*"],
		"editor_invite/en": [
			"countPlural=one, gender=female",
			"countPlural=one, gender=*",
			"countPlural=*, gender=female",
			"countPlural=*, gender=*",
		],
	},
};

describe.each(fixtures)("$dir", (fixture) => {
	test("hand-written files import into the same messages after the upgrade", async () => {
		const project = await openProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		const expected = withoutBundles(
			contentOf(await selectRows(project)),
			importChanges[fixture.dir] ?? []
		);
		await project.close();
		expect(expected.bundles.length).toBeGreaterThan(0);

		for (const { sdk, plugin } of upgrades) {
			const upgraded = await openProject(fixture, sdk, plugin);
			await upgraded.importFiles({
				pluginKey: fixture.key,
				files: readSourceFiles(fixture),
			});
			expect(
				withoutBundles(
					contentOf(await selectRows(upgraded)),
					importChanges[fixture.dir] ?? []
				),
				`${sdk} SDK with the ${plugin} plugin`
			).toEqual(expected);
			await upgraded.close();
		}
	});

	test("files written by the published plugin stay byte-identical when they are imported and exported again after the upgrade", async () => {
		const project = await openProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		const published = await exportFiles(project, fixture);
		await project.close();
		// every committed fixture is written, and nothing else
		const publishedDir = path.join(fixturesDir, fixture.dir, "published");
		expect(published.map((file) => path.normalize(file.name)).sort()).toEqual(
			listFiles(publishedDir)
		);
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

	test("re-importing the same files into a project changes no rows", async () => {
		const project = await openProject(fixture, "current", "current");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		const before = await selectRows(project);
		const exported = await exportFiles(project, fixture);
		expect(before.variants.length).toBeGreaterThan(0);

		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});

		// no duplicate variants, same ids, same order
		expect(sortById(await selectRows(project))).toEqual(sortById(before));
		expect(await exportFiles(project, fixture)).toEqual(exported);
		await project.close();
	});

	test("a database written by the published SDK and plugin exports the same files after the upgrade", async () => {
		const project = await openProject(fixture, "published", "published");
		await project.importFiles({
			pluginKey: fixture.key,
			files: readSourceFiles(fixture),
		});
		await editLikeAnEditor(project, fixture);
		const before = await exportFiles(project, fixture);
		expect(before.length).toBeGreaterThan(0);
		const blob = await project.toBlob();
		await project.close();

		for (const { sdk, plugin } of upgrades) {
			const upgraded = await openProject(fixture, sdk, plugin, blob);
			expect(
				await exportFiles(upgraded, fixture),
				`${sdk} SDK with the ${plugin} plugin`
			).toEqual(
				withVariantOrder(before, variantOrderChanges[fixture.dir] ?? {})
			);
			await upgraded.close();
		}
	});
});

function sortById(rows: Rows): Rows {
	const byId = (a: { id: string }, b: { id: string }) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	return {
		bundles: [...rows.bundles].sort(byId),
		messages: [...rows.messages].sort(byId),
		variants: [...rows.variants].sort(byId),
	};
}

function withoutBundles(
	content: ReturnType<typeof contentOf>,
	ids: string[]
): ReturnType<typeof contentOf> {
	const keep = (key: string | undefined) =>
		!ids.some((id) => key?.startsWith(`${id}/`));
	return {
		bundles: content.bundles.filter((bundle) => !ids.includes(bundle.id)),
		messages: content.messages.filter((message) => keep(message.key)),
		variants: content.variants.filter((variant) => keep(variant.message)),
	};
}
