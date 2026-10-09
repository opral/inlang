import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { openLix as openPublishedLix } from "published-sdk/lix";
import {
	type Project,
	type Version,
	insertRows,
	loadFromBlob,
	newProjectBlob,
	sdks,
	selectRows,
	sortRows,
} from "./harness.js";
import { editorRows } from "./editorRows.js";

const require = createRequire(import.meta.url);

function sdkManifest(version: Version) {
	const specifier = version === "published" ? "published-sdk" : "@inlang/sdk";
	// the package entry is dist/index.js
	const entry = require.resolve(specifier);
	return JSON.parse(
		fs.readFileSync(
			path.join(path.dirname(entry), "..", "package.json"),
			"utf8"
		)
	);
}

const settings = { baseLocale: "en", locales: ["en", "de"], modules: [] };

async function registeredSchemas(project: Project) {
	const result = await project.lix.execute(
		"SELECT schema_key, value FROM lix_registered_schema WHERE schema_key LIKE 'inlang_%' ORDER BY schema_key"
	);
	return result.rows;
}

async function openOnLix(version: Version, lix: unknown): Promise<Project> {
	const project = await (sdks[version].openProject as any)({ lix, settings });
	return Object.assign(project, { version }) as Project;
}

describe("physical storage", () => {
	test("both SDKs use the same Lix release, so a Lix file has the same format", () => {
		expect(sdkManifest("current").dependencies["@lix-js/sdk"]).toBe(
			sdkManifest("published").dependencies["@lix-js/sdk"]
		);
	});

	test("both SDKs register the same Lix schemas: the renamed tables and columns are only the query layer", async () => {
		const schemas: Record<Version, unknown> = {} as any;
		for (const version of ["published", "current"] as const) {
			const project = await loadFromBlob(
				version,
				await newProjectBlob(version, settings)
			);
			schemas[version] = await registeredSchemas(project);
			await project.close();
		}
		expect(schemas.current).toEqual(schemas.published);
		expect(
			(schemas.current as Array<{ schema_key: string }>).map(
				(row) => row.schema_key
			)
		).toEqual(["inlang_bundle", "inlang_message", "inlang_variant"]);
	});

	test("both SDKs write the same .inlang file format", async () => {
		const formats: string[] = [];
		for (const version of ["published", "current"] as const) {
			const project = await loadFromBlob(
				version,
				await newProjectBlob(version, settings)
			);
			formats.push(JSON.parse(await (await project.toBlob()).text()).format);
			await project.close();
		}
		expect(formats[1]).toBe(formats[0]);
	});

	test.each([
		{ first: "published", second: "current" },
		{ first: "current", second: "published" },
	] as const)(
		"a Lix database (e.g. Fink's OPFS draft) written by the $first SDK opens in the $second SDK and back, without schema changes",
		async ({ first, second }) => {
			const lix = await openPublishedLix({});

			const a = await openOnLix(first, lix);
			await insertRows(a, editorRows);
			const schemasBefore = await registeredSchemas(a);
			const settingsBefore = await lix.execute(
				"SELECT content FROM lix_file WHERE path = '/settings.json'"
			);
			await a.close();

			const b = await openOnLix(second, lix);
			expect(sortRows(await selectRows(b))).toEqual(sortRows(editorRows));
			// opening registers no new schema version and touches no file
			expect(await registeredSchemas(b)).toEqual(schemasBefore);
			expect(
				await lix.execute(
					"SELECT content FROM lix_file WHERE path = '/settings.json'"
				)
			).toEqual(settingsBefore);
			const t =
				second === "published"
					? { variant: "variant" }
					: { variant: "inlang_variant" };
			const edited = editorRows.variants[0]!;
			await b.db
				.updateTable(t.variant)
				.set({ pattern: [{ type: "text", value: "edited" }] })
				.where("id", "=", edited.id)
				.execute();
			await b.close();

			const c = await openOnLix(first, lix);
			const rows = sortRows(await selectRows(c));
			expect(rows.variants.find((v) => v.id === edited.id)?.pattern).toEqual([
				{ type: "text", value: "edited" },
			]);
			expect(rows.bundles).toEqual(sortRows(editorRows).bundles);
			expect(rows.messages).toEqual(sortRows(editorRows).messages);
			await c.close();
			await lix.close();
		}
	);
});

describe("updateBundleNested", () => {
	test("the current SDK updates a bundle of a project written by the published SDK, which reads the update back", async () => {
		const created = await loadFromBlob(
			"published",
			await newProjectBlob("published", settings)
		);
		await insertRows(created, editorRows);
		const blob = await created.toBlob();
		await created.close();

		const current = await loadFromBlob("current", blob);
		const [bundle] = await (sdks.current.selectBundleNested as any)(current.db)
			.where("inlang_bundle.id", "=", "items_count")
			.execute();
		const en = bundle.messages.find((m: any) => m.locale === "en");
		en.variants[0].pattern = [{ type: "text", value: "updated" }];
		await sdks.current.updateBundleNested(current.db, bundle);
		const updatedBlob = await current.toBlob();
		await current.close();

		const published = await loadFromBlob("published", updatedBlob);
		const rows = await selectRows(published);
		expect(
			rows.variants.find((v) => v.id === en.variants[0].id)?.pattern
		).toEqual([{ type: "text", value: "updated" }]);
		// everything else is unchanged
		expect(
			sortRows({
				...rows,
				variants: rows.variants.filter((v) => v.id !== en.variants[0].id),
			})
		).toEqual(
			sortRows({
				...editorRows,
				variants: editorRows.variants.filter((v) => v.id !== en.variants[0].id),
			})
		);

		// the published SDK's own updateBundleNested is broken: it writes the
		// nested `messages` array as a column. 4.0 fixed it.
		const [publishedBundle] = await (sdks.published.selectBundleNested as any)(
			published.db
		)
			.where("bundle.id", "=", "items_count")
			.execute();
		await expect(
			(sdks.published.updateBundleNested as any)(published.db, publishedBundle)
		).rejects.toThrow();
		await published.close();
	});
});
