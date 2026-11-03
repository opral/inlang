import { describe, expect, test } from "vitest";
import { openLix as openPublishedLix } from "published-sdk/lix";
import { openLix as openCurrentLix } from "@inlang/sdk/lix";
import {
	type Project,
	type Version,
	insertRows,
	loadFromBlob,
	newProjectBlob,
	sdks,
	selectRows,
	sortRows,
	tables,
} from "./harness.js";
import { editorRows } from "./editorRows.js";

const settings = { baseLocale: "en", locales: ["en", "de"], modules: [] };

async function readLix(lix: any, statement: string) {
	return typeof lix.query === "function"
		? lix.query(statement)
		: (await lix.execute(statement)).rows;
}

async function registeredSchemas(project: Project) {
	return readLix(
		project.lix,
		"SELECT schema_key, value FROM lix_registered_schema WHERE schema_key LIKE 'inlang_%' ORDER BY schema_key"
	);
}

/** The only physical schema change in this release is an additive nullable column. */
function withBundleDescription(schemas: any[]) {
	return schemas.map((schema) =>
		schema.schema_key === "inlang_bundle"
			? {
					...schema,
					value: {
						...schema.value,
						columns: [
							...schema.value.columns,
							{ name: "description", type: "text", nullable: true },
						],
					},
				}
			: schema
	);
}

async function persistedSnapshot(lix: any) {
	return new Uint8Array(await new Response(lix.exportSnapshot()).arrayBuffer());
}

async function openOnLix(version: Version, lix: unknown): Promise<Project> {
	const project = await (sdks[version].openProject as any)({ lix, settings });
	return Object.assign(project, { version }) as Project;
}

describe("physical storage", () => {
	test("Lix schemas differ only by the additive nullable bundle description column", async () => {
		const schemas: Record<Version, any[]> = {} as any;
		for (const version of ["published", "current"] as const) {
			const project = await loadFromBlob(
				version,
				await newProjectBlob(version, settings)
			);
			schemas[version] = await registeredSchemas(project);
			await project.close();
		}
		expect(schemas.current).toEqual(withBundleDescription(schemas.published));
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

	test.each(["published", "current"] as const)(
		"a persisted Lix database written by the %s SDK upgrades, preserves schemas and settings, and reopens after edits",
		async (first) => {
			const source = await (
				first === "published" ? openPublishedLix : openCurrentLix
			)({});
			let restored: Awaited<ReturnType<typeof openCurrentLix>> | undefined;
			let reopened: Awaited<ReturnType<typeof openCurrentLix>> | undefined;
			try {
				const a = await openOnLix(first, source);
				await insertRows(a, editorRows);
				const schemasBefore = await registeredSchemas(a);
				const settingsBefore = await readLix(
					source,
					"SELECT content FROM lix_file WHERE path = '/settings.json'"
				);
				await a.close();

				// Restore through the current engine: caller-owned handles from
				// a breaking Lix release cannot be shared between SDK versions.
				restored = await openCurrentLix.fromSnapshot(
					await persistedSnapshot(source)
				);
				const b = await openOnLix("current", restored);
				expect(sortRows(await selectRows(b))).toEqual(sortRows(editorRows));
				expect(await registeredSchemas(b)).toEqual(
					first === "published"
						? withBundleDescription(schemasBefore)
						: schemasBefore
				);
				expect(
					await b.db
						.selectFrom("inlang_bundle")
						.select(["id", "description"])
						.orderBy("id")
						.execute()
				).toEqual(
					sortRows(editorRows).bundles.map(({ id }) => ({
						id,
						description: null,
					}))
				);
				expect(
					await readLix(
						restored,
						"SELECT content FROM lix_file WHERE path = '/settings.json'"
					)
				).toEqual(settingsBefore);
				const edited = editorRows.variants[0]!;
				await b.db
					.updateTable(tables("current").variant)
					.set({ pattern: [{ type: "text", value: "edited" }] })
					.where("id", "=", edited.id)
					.execute();
				await b.close();

				reopened = await openCurrentLix.fromSnapshot(
					await persistedSnapshot(restored)
				);
				const c = await openOnLix("current", reopened);
				const rows = sortRows(await selectRows(c));
				expect(rows.variants.find((v) => v.id === edited.id)?.pattern).toEqual([
					{ type: "text", value: "edited" },
				]);
				expect(rows.bundles).toEqual(sortRows(editorRows).bundles);
				expect(rows.messages).toEqual(sortRows(editorRows).messages);
				await c.close();
			} finally {
				await reopened?.close();
				await restored?.close();
				await source.close();
			}
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
