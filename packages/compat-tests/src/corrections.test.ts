/**
 * The cases where files written before the upgrade DO change after it.
 *
 * Each one is a message for which the published plugin wrote wrong output:
 * output that it can't read back, that drops information, or that displays
 * something else than the message says. Everything else must stay
 * byte-identical, see translation-files.test.ts.
 *
 * Also the one case where the current plugin imports the same file into
 * different messages (icu1: `#` with an offset).
 *
 * Every case is checked for both upgrade paths: the current SDK with the
 * current plugin, and the published SDK loading the current plugin.
 */
import { describe, expect, test } from "vitest";
import {
	type Project,
	contentOf,
	encode,
	decode,
	insertRows,
	selectRows,
	tables,
} from "./harness.js";
import {
	type Fixture,
	fixtures,
	openFixtureProject as open,
	readSourceFiles,
	settingsFor,
	upgrades,
	withVariantOrder,
} from "./fixtures.js";
import { editorSpecs, rowsFromSpecs } from "./editorRows.js";

const fixture = (dir: string) => fixtures.find((f) => f.dir === dir)!;

async function exportLocale(project: Project, f: Fixture, locale = "en") {
	const files = await project.exportFiles({ pluginKey: f.key });
	return decode(files.find((file) => file.locale === locale)!.content);
}

/**
 * Imports `source` with the published SDK and plugin, then exports the
 * database with the published plugin (before) and, after the upgrade, with
 * each upgraded SDK / plugin combination (after).
 */
async function beforeAndAfter(
	f: Fixture,
	source: Record<string, string>,
	locale = "en"
) {
	const published = await open(f, "published", "published");
	await published.importFiles({
		pluginKey: f.key,
		files: [{ locale, content: encode(JSON.stringify(source, undefined, 2)) }],
	});
	const before = JSON.parse(await exportLocale(published, f, locale));
	const blob = await published.toBlob();
	await published.close();
	const afters = [];
	for (const { sdk, plugin } of upgrades) {
		const current = await open(f, sdk, plugin, blob);
		afters.push({
			label: `${sdk} SDK with the ${plugin} plugin`,
			after: JSON.parse(await exportLocale(current, f, locale)),
		});
		await current.close();
	}
	return { before, afters };
}

describe("message-format", () => {
	const f = fixture("message-format");

	test("an exact number (ICU =0) next to its plural: written before the plural, which the published plugin couldn't read back", async () => {
		const cart = rowsFromSpecs(editorSpecs.filter((s) => s.id === "cart"));
		const published = await open(f, "published", "published");
		await insertRows(published, cart);
		const before = await exportLocale(published, f);
		// the published plugin can't import the file it wrote
		await expect(
			published.importFiles({
				pluginKey: f.key,
				files: [{ locale: "en", content: encode(before) }],
			})
		).rejects.toThrow();
		await published.close();

		for (const [source, { sdk, plugin }] of (
			["file", "database"] as const
		).flatMap((source) =>
			upgrades.map((upgrade) => [source, upgrade] as const)
		)) {
			const current = await open(f, sdk, plugin);
			if (source === "file") {
				await current.importFiles({
					pluginKey: f.key,
					files: [{ locale: "en", content: encode(before) }],
				});
			} else {
				await insertRows(current, cart);
			}
			const after = await exportLocale(current, f);
			await current.close();
			expect(JSON.parse(before).cart[0].selectors).toEqual([
				"countPlural",
				"countPluralExact",
			]);
			expect(
				JSON.parse(after).cart[0].selectors,
				`${source}, ${sdk} SDK with the ${plugin} plugin`
			).toEqual(["countPluralExact", "countPlural"]);
			// The published plugin also wrote the "one" form after the catch-all,
			// where runtimes that try the forms in file order never select it.
			// Nothing else changes.
			const [corrected] = withVariantOrder(
				[{ locale: "en", name: "en.json", content: before }],
				{
					"cart/en": [
						"countPlural=*, countPluralExact=0",
						"countPlural=one, countPluralExact=*",
						"countPlural=*, countPluralExact=*",
					],
				}
			);
			expect(
				after.replace(
					'"countPluralExact",\n\t\t\t\t"countPlural"',
					'"countPlural",\n\t\t\t\t"countPluralExact"'
				),
				`${source}, ${sdk} SDK with the ${plugin} plugin`
			).toBe(corrected!.content);
		}
	});

	test("an exact number (=0) that an editor adds to a plural: written before the catch-all, after which the published plugin wrote it because it is the newest variant", async () => {
		// `addExactNumber` in Fink: the catch-all `countPluralExact=*` for the
		// existing forms, then a new `=0` form with a later uuid (v7)
		const id = (n: number) => `0199c3a0-0000-7000-8000-00000000000${n}`;
		const rows = {
			bundles: [
				{
					id: "files_deleted",
					declarations: [
						{ type: "input-variable", name: "count" },
						{
							type: "local-variable",
							name: "countPlural",
							value: {
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
								annotation: {
									type: "function-reference",
									name: "plural",
									options: [],
								},
							},
						},
						{
							type: "local-variable",
							name: "countPluralExact",
							value: {
								type: "expression",
								arg: { type: "variable-reference", name: "count" },
							},
						},
					],
				},
			],
			messages: [
				{
					id: id(1),
					bundleId: "files_deleted",
					locale: "en",
					selectors: [
						{ type: "variable-reference", name: "countPluralExact" },
						{ type: "variable-reference", name: "countPlural" },
					],
				},
			],
			variants: [
				{
					id: id(2),
					messageId: id(1),
					matches: [
						{ type: "catchall-match", key: "countPluralExact" },
						{ type: "literal-match", key: "countPlural", value: "one" },
					],
					pattern: [{ type: "text", value: "One file deleted" }],
				},
				{
					id: id(3),
					messageId: id(1),
					matches: [
						{ type: "catchall-match", key: "countPluralExact" },
						{ type: "catchall-match", key: "countPlural" },
					],
					pattern: [
						{
							type: "expression",
							arg: { type: "variable-reference", name: "count" },
						},
						{ type: "text", value: " files deleted" },
					],
				},
				{
					id: id(4),
					messageId: id(1),
					matches: [
						{ type: "literal-match", key: "countPluralExact", value: "0" },
						{ type: "catchall-match", key: "countPlural" },
					],
					pattern: [{ type: "text", value: "No files deleted" }],
				},
			],
		};
		const published = await open(f, "published", "published");
		await insertRows(published, rows);
		const before = JSON.parse(await exportLocale(published, f));
		await published.close();
		expect(Object.keys(before.files_deleted[0].match)).toEqual([
			"countPlural=one, countPluralExact=*",
			"countPlural=*, countPluralExact=*",
			// never selected: the catch-all before it matches 0
			"countPlural=*, countPluralExact=0",
		]);

		for (const { sdk, plugin } of upgrades) {
			const current = await open(f, sdk, plugin);
			await insertRows(current, rows);
			const after = await exportLocale(current, f);
			await current.close();
			expect(
				JSON.parse(after).files_deleted,
				`${sdk} SDK with the ${plugin} plugin`
			).toStrictEqual([
				{
					declarations: [
						"input count",
						"local countPlural = count: plural",
						"local countPluralExact = count",
					],
					selectors: ["countPluralExact", "countPlural"],
					match: {
						"countPlural=*, countPluralExact=0": "No files deleted",
						"countPlural=one, countPluralExact=*": "One file deleted",
						"countPlural=*, countPluralExact=*": "{count} files deleted",
					},
				},
			]);

			// the written file stays as it is
			const reopened = await open(f, sdk, plugin);
			await reopened.importFiles({
				pluginKey: f.key,
				files: [{ locale: "en", content: encode(after) }],
			});
			expect(
				await exportLocale(reopened, f),
				`${sdk} SDK with the ${plugin} plugin`
			).toBe(after);
			await reopened.close();
		}
	});

	test('a plain string next to a plural in another locale: the published plugin rewrote it into the complex form, with `selectors: []` and on the next export `selectors: ["count"]`; it stays a plain string, and files in either complex form stay as they are', async () => {
		const file = (messages: Record<string, unknown>) =>
			JSON.stringify(
				{
					$schema: "https://inlang.com/schema/inlang-message-format",
					...messages,
				},
				undefined,
				"\t"
			);
		const handWritten: Record<string, string> = {
			en: file({
				hello: "Hello",
				files_deleted: [
					{
						declarations: ["input count", "local countPlural = count: plural"],
						selectors: ["countPlural"],
						match: {
							"countPlural=one": "One file deleted",
							"countPlural=*": "{count} files deleted",
						},
					},
				],
			}),
			de: file({ hello: "Hallo", files_deleted: "{count} Dateien gelöscht" }),
			fr: file({ hello: "Bonjour", files_deleted: "Fichiers supprimés" }),
		};
		const asImport = (files: Record<string, string>) =>
			Object.entries(files).map(([locale, content]) => ({
				locale,
				content: encode(content),
			}));
		const exportAll = async (project: Project) =>
			Object.fromEntries(
				(await project.exportFiles({ pluginKey: f.key })).map((exported) => [
					exported.locale,
					decode(exported.content),
				])
			);

		// the published plugin: the first export rewrites the plain strings,
		// the second the German one again
		const published = await open(f, "published", "published");
		await published.importFiles({
			pluginKey: f.key,
			files: asImport(handWritten),
		});
		const firstExport = await exportAll(published);
		const blob = await published.toBlob();
		await published.close();
		expect(firstExport.en).toBe(handWritten.en);
		expect(JSON.parse(firstExport.de!).files_deleted).toEqual([
			{
				declarations: ["input count", "local countPlural = count: plural"],
				selectors: [],
				match: { "count=*": "{count} Dateien gelöscht" },
			},
		]);
		expect(JSON.parse(firstExport.fr!).files_deleted).toEqual([
			{
				declarations: ["input count", "local countPlural = count: plural"],
				selectors: [],
				// `{ "": … }`, which flat's unflatten turns into an array
				match: ["Fichiers supprimés"],
			},
		]);
		const republished = await open(f, "published", "published");
		await republished.importFiles({
			pluginKey: f.key,
			files: asImport(firstExport),
		});
		const secondExport = await exportAll(republished);
		await republished.close();
		expect(JSON.parse(secondExport.de!).files_deleted[0].selectors).toEqual([
			"count",
		]);
		expect(secondExport.fr).toBe(firstExport.fr);

		for (const { sdk, plugin } of upgrades) {
			const label = `${sdk} SDK with the ${plugin} plugin`;
			const roundtrip = async (files: Record<string, string>) => {
				const current = await open(f, sdk, plugin);
				await current.importFiles({
					pluginKey: f.key,
					files: asImport(files),
				});
				const exported = await exportAll(current);
				await current.close();
				return exported;
			};
			// hand-written files stay as they are
			expect(await roundtrip(handWritten), label).toEqual(handWritten);
			// so do the complex forms the published plugin wrote, except the one
			// without a placeholder: `"match": ["Fichiers supprimés"]` is the
			// same message as the plain string, which it is written as again
			expect(await roundtrip(firstExport), label).toEqual({
				...firstExport,
				fr: handWritten.fr,
			});
			expect(await roundtrip(secondExport), label).toEqual({
				...secondExport,
				fr: handWritten.fr,
			});
			// a database the published plugin imported the hand-written files
			// into exports them as they were written
			const fromDatabase = await open(f, sdk, plugin, blob);
			expect(await exportAll(fromDatabase), label).toEqual(handWritten);
			await fromDatabase.close();
		}
	});

	test("a placeholder with a function (e.g. ICU {rate, number, percent}, imported by plugin-icu1): the published plugin dropped the function", async () => {
		const icu1 = fixture("icu1");
		const rows = await (async () => {
			const project = await open(icu1, "published", "published");
			await project.importFiles({
				pluginKey: icu1.key,
				files: [
					{
						locale: "en",
						content: encode(
							JSON.stringify({
								progress: "{rate, number, percent} done",
							})
						),
					},
				],
			});
			const blob = await project.toBlob();
			await project.close();
			return blob;
		})();
		// the project also uses message-format
		const before = await open(f, "published", "published", rows);
		await before.settings.set({
			...(await before.settings.get()),
			...settingsFor(f),
		});
		const beforeFile = JSON.parse(await exportLocale(before, f));
		const blob = await before.toBlob();
		await before.close();
		expect(beforeFile.progress).toBe("{rate} done");
		for (const { sdk, plugin } of upgrades) {
			const after = await open(f, sdk, plugin, blob);
			const afterFile = JSON.parse(await exportLocale(after, f));
			await after.close();
			expect(afterFile.progress, `${sdk} SDK with the ${plugin} plugin`).toBe(
				"{rate: number style=percent} done"
			);
		}
	});
});

describe("icu1", () => {
	const f = fixture("icu1");

	test("import: # in a plural with an offset keeps the offset, which the published plugin dropped (no file change)", async () => {
		const poundOptions = async (
			sdk: "published" | "current",
			plugin: "published" | "current"
		) => {
			const project = await open(f, sdk, plugin);
			await project.importFiles({
				pluginKey: f.key,
				files: readSourceFiles(f),
			});
			const content = contentOf(await selectRows(project));
			await project.close();
			const guests = content.variants.find(
				(variant) =>
					variant.message === "guests/en" &&
					JSON.stringify(variant.pattern).includes("icu:pound")
			)!;
			return (guests.pattern as any[]).find(
				(part) => part.annotation?.name === "icu:pound"
			).annotation.options;
		};
		expect(await poundOptions("published", "published")).toEqual([]);
		for (const { sdk, plugin } of upgrades) {
			expect(
				await poundOptions(sdk, plugin),
				`${sdk} SDK with the ${plugin} plugin`
			).toEqual([{ name: "offset", value: { type: "literal", value: "1" } }]);
		}
	});

	test.each([
		{
			name: "an apostrophe between quoted special characters: the published plugin added an apostrophe on every export",
			message: "It''s #'#' and '{''}' here",
			before: "It''s #''#'' and '{''''}' here",
			after: "It''s #''#'' and '{''}' here",
		},
		{
			name: "quoted braces next to quoted # signs: the published plugin added an apostrophe",
			message: "Use '#'##' and '{}' and ''quoted''",
			before: "Use ''#''##'' and '{''}' and ''quoted''",
			after: "Use ''#''##'' and '{}' and ''quoted''",
		},
		{
			name: "# of a plural without offset inside a plural with offset: the published plugin moved it into the offset plural, displaying count - 1",
			message:
				"{count, plural, offset:1 other {{gender, select, male {{count, plural, other {# x}}} other {{count, plural, other {# y}}}}}}",
			before:
				"{count, plural, offset:1 other {#{gender, select, male {{count, plural, other { x}}} other {{count, plural, other { y}}}}}}",
			after:
				"{count, plural, offset:1 other {{gender, select, male {{count, plural, other {#}} x} other {{count, plural, other {#}} y}}}}",
		},
		{
			name: "# next to a nested plural with offset: the published plugin moved it into the offset plural, displaying n - 1",
			message:
				"{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}",
			before:
				"{n, plural, other {{n, plural, offset:1 one {# and one} other {# and many}}}}",
			after:
				"{n, plural, other {# and {n, plural, offset:1 one {one} other {many}}}}",
		},
	])(
		"$name",
		async ({ message, before: expectedBefore, after: expectedAfter }) => {
			const { before, afters } = await beforeAndAfter(f, { message });
			expect(before.message).toBe(expectedBefore);
			for (const { label, after } of afters) {
				expect(after.message, label).toBe(expectedAfter);
			}

			// files written by the published plugin are read back as they are
			for (const { sdk, plugin } of upgrades) {
				const current = await open(f, sdk, plugin);
				await current.importFiles({
					pluginKey: f.key,
					files: [{ locale: "en", content: encode(JSON.stringify(before)) }],
				});
				expect(
					JSON.parse(await exportLocale(current, f)),
					`${sdk} SDK with the ${plugin} plugin`
				).toEqual(before);
				await current.close();
			}
		}
	);
});

describe("i18next", () => {
	const f = fixture("i18next");

	test("Latvian `_zero` whose exact-0 form and `zero` category form differ: the published plugin showed the =0 text for 10, 11–19, 20, … too; now the export fails", async () => {
		const published = await open(f, "published", "published");
		await published.importFiles({
			pluginKey: f.key,
			files: [
				{
					locale: "lv",
					content: encode(
						JSON.stringify({
							item_zero: "{{count}} preču",
							item_one: "{{count}} prece",
							item_other: "{{count}} preces",
						})
					),
				},
			],
		});
		// a translator edits only the "=0" form
		const t = tables("published");
		const variants = await published.db
			.selectFrom(t.variant)
			.selectAll()
			.execute();
		const exactZero = variants.find((v: any) =>
			v.matches.some((m: any) => m.key === "count" && m.value === "0")
		);
		await published.db
			.updateTable(t.variant)
			.set({ pattern: [{ type: "text", value: "Nav preču" }] })
			.where("id", "=", exactZero.id)
			.execute();
		const before = JSON.parse(await exportLocale(published, f, "lv"));
		expect(before.item_zero).toBe("Nav preču");
		const blob = await published.toBlob();
		await published.close();

		for (const { sdk, plugin } of upgrades) {
			const current = await open(f, sdk, plugin, blob);
			await expect(current.exportFiles({ pluginKey: f.key })).rejects.toThrow(
				'i18next export cannot represent two different texts for "item_zero" of bundle "item" (lv)'
			);
			await current.close();
		}
	});
});
