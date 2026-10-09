import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type Project,
	type Rows,
	type Version,
	contentOf,
	fetchedModules,
	insertRows,
	loadFromBlob,
	loadFromDirectory,
	newProjectBlob,
	plugins,
	saveToDirectory,
	selectRows,
	servePlugins,
	sortRows,
} from "./harness.js";
import { editorRows, editorSpecs, rowsFromSpecs } from "./editorRows.js";

const settings = {
	$schema: "https://inlang.com/schema/project-settings",
	baseLocale: "en",
	locales: ["en", "de", "fr"],
	modules: [
		plugins["plugin.inlang.messageFormat"].url,
		plugins["plugin.inlang.mFunctionMatcher"].url,
	],
	"plugin.inlang.messageFormat": {
		pathPattern: "./messages/{locale}.json",
	},
};

const other: Record<Version, Version> = {
	published: "current",
	current: "published",
};

// edits made by the other SDK: one bundle added, one updated, one deleted
const added = rowsFromSpecs(
	[
		{
			id: "added_by_other_sdk",
			declarations: [{ type: "input-variable", name: "x" }],
			messages: {
				en: {
					variants: [
						{
							pattern: [
								{ type: "text", value: "x is " },
								{
									type: "expression",
									arg: { type: "variable-reference", name: "x" },
								},
							],
						},
					],
				},
			},
		},
	],
	"edit/"
);

async function editWith(project: Project) {
	const t =
		project.version === "published"
			? {
					bundle: "bundle",
					message: "message",
					variant: "variant",
					messageId: "messageId",
					bundleId: "bundleId",
				}
			: {
					bundle: "inlang_bundle",
					message: "inlang_message",
					variant: "inlang_variant",
					messageId: "message_id",
					bundleId: "bundle_id",
				};
	await insertRows(project, added);
	// update the text of the German greeting
	const greetingDe = await project.db
		.selectFrom(t.message)
		.where(t.bundleId, "=", "greeting")
		.where("locale", "=", "de")
		.select("id")
		.executeTakeFirstOrThrow();
	await project.db
		.updateTable(t.variant)
		.set({
			pattern: [{ type: "text", value: "Servus!" }],
		})
		.where(t.messageId, "=", greetingDe.id)
		.execute();
	// delete the pronoun bundle with its messages and variants
	const pronounMessages = await project.db
		.selectFrom(t.message)
		.where(t.bundleId, "=", "pronoun")
		.select("id")
		.execute();
	for (const message of pronounMessages) {
		await project.db
			.deleteFrom(t.variant)
			.where(t.messageId, "=", message.id)
			.execute();
	}
	await project.db
		.deleteFrom(t.message)
		.where(t.bundleId, "=", "pronoun")
		.execute();
	await project.db.deleteFrom(t.bundle).where("id", "=", "pronoun").execute();
}

function expectedAfterEdit(rows: Rows): Rows {
	const pronounMessageIds = new Set(
		rows.messages.filter((m) => m.bundleId === "pronoun").map((m) => m.id)
	);
	const greetingDe = rows.messages.find(
		(m) => m.bundleId === "greeting" && m.locale === "de"
	)!;
	return sortRows({
		bundles: [
			...rows.bundles.filter((b) => b.id !== "pronoun"),
			...added.bundles,
		],
		messages: [
			...rows.messages.filter((m) => m.bundleId !== "pronoun"),
			...added.messages,
		],
		variants: [
			...rows.variants
				.filter((v) => !pronounMessageIds.has(v.messageId))
				.map((v) =>
					v.messageId === greetingDe.id
						? { ...v, pattern: [{ type: "text", value: "Servus!" }] }
						: v
				),
			...added.variants,
		],
	});
}

describe.each(["published", "current"] as const)(
	"a .inlang file created by the %s SDK",
	(creator) => {
		const reader = other[creator];

		test(`opens in the ${reader} SDK with identical data, and edits from the ${reader} SDK open in the ${creator} SDK`, async () => {
			servePlugins("published");
			const created = await loadFromBlob(
				creator,
				await newProjectBlob(creator, settings)
			);
			await insertRows(created, editorRows);
			const written = sortRows(await selectRows(created));
			expect(written).toEqual(sortRows(editorRows));
			const createdSettings = await created.settings.get();
			const blob = await created.toBlob();
			await created.close();

			const opened = await loadFromBlob(reader, blob);
			expect(sortRows(await selectRows(opened))).toEqual(written);
			expect(await opened.settings.get()).toEqual(createdSettings);

			await editWith(opened);
			const edited = sortRows(await selectRows(opened));
			expect(edited).toEqual(expectedAfterEdit(written));
			const editedBlob = await opened.toBlob();
			await opened.close();

			const reopened = await loadFromBlob(creator, editedBlob);
			expect(sortRows(await selectRows(reopened))).toEqual(edited);
			expect(await reopened.settings.get()).toEqual(createdSettings);
			await reopened.close();
		});
	}
);

/**
 * Every file under `root`, path → bytes.
 */
function snapshotDirectory(root: string): Map<string, string> {
	const files = new Map<string, string>();
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else
				files.set(
					path.relative(root, full),
					fs.readFileSync(full).toString("base64")
				);
		}
	};
	walk(root);
	return files;
}

function changedFiles(before: Map<string, string>, after: Map<string, string>) {
	const changed: string[] = [];
	for (const [file, content] of after) {
		if (before.get(file) !== content)
			changed.push(before.has(file) ? `changed ${file}` : `added ${file}`);
	}
	for (const file of before.keys()) {
		if (!after.has(file)) changed.push(`removed ${file}`);
	}
	return changed.sort();
}

/**
 * A settings.json as users write it: own formatting, keys in their order,
 * several modules and plugin settings.
 */
const settingsJson =
	JSON.stringify(
		{
			$schema: "https://inlang.com/schema/project-settings",
			locales: ["en", "de", "fr"],
			baseLocale: "en",
			modules: [
				plugins["plugin.inlang.messageFormat"].url,
				plugins["plugin.inlang.mFunctionMatcher"].url,
			],
			"plugin.inlang.messageFormat": {
				pathPattern: "./messages/{locale}.json",
			},
		},
		undefined,
		4
	) + "\n";

/**
 * Files in git: `.inlang/.gitignore` ignores everything in the project
 * directory except `settings.json` (README.md, .meta.json, the plugin cache).
 */
function trackedChanges(changes: string[]) {
	return changes.filter((change) => {
		const file = change.split(" ")[1]!;
		return (
			!file.startsWith("project.inlang/") ||
			file === "project.inlang/settings.json" ||
			file === "project.inlang/.gitignore"
		);
	});
}

// The published plugin can't read the exact-number + plural pair ("cart") it
// writes, see corrections.test.ts. Projects that contain one can't be opened
// with the published plugin at all, so they are left out here.
const directoryRows = rowsFromSpecs(
	editorSpecs.filter((spec) => spec.id !== "cart")
);

async function createDirectory(sdk: Version) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "inlang-compat-"));
	const projectPath = path.join(root, "project.inlang");
	fs.mkdirSync(projectPath);
	fs.writeFileSync(path.join(projectPath, "settings.json"), settingsJson);
	// each SDK with the plugins of its release
	servePlugins(sdk);
	const project = await loadFromDirectory(sdk, { path: projectPath, fs });
	expect(await project.errors.get()).toEqual([]);
	await insertRows(project, directoryRows);
	await saveToDirectory(sdk, { path: projectPath, fs, project });
	await project.close();
	return { root, projectPath };
}

describe.each([
	{ creator: "published", reader: "current" },
	{ creator: "current", reader: "published" },
] as const)(
	"a project directory saved by the $creator SDK",
	({ creator, reader }) => {
		test.each(["published", "current"] as const)(
			`opening and saving it in the ${reader} SDK without edits keeps every file in git byte-identical (%s plugins)`,
			async (served) => {
				const { root, projectPath } = await createDirectory(creator);
				const before = snapshotDirectory(root);
				expect([...before.keys()].sort()).toEqual(
					expect.arrayContaining([
						"messages/de.json",
						"messages/en.json",
						"project.inlang/.gitignore",
						"project.inlang/settings.json",
					])
				);

				servePlugins(served);
				fetchedModules.length = 0;
				const opened = await loadFromDirectory(reader, {
					path: projectPath,
					fs,
				});
				expect(await opened.errors.get()).toEqual([]);
				expect(fetchedModules).toContain(
					`${served} ${plugins["plugin.inlang.messageFormat"].url}`
				);
				expect(
					(await opened.plugins.get()).map((plugin: any) => plugin.key).sort()
				).toEqual([
					"plugin.inlang.mFunctionMatcher",
					"plugin.inlang.messageFormat",
				]);
				// loading writes nothing tracked, and adds or migrates no file
				const afterLoad = snapshotDirectory(root);
				expect(trackedChanges(changedFiles(before, afterLoad))).toEqual([]);
				expect(
					changedFiles(before, afterLoad).filter(
						(c) => !c.startsWith("changed")
					)
				).toEqual([]);

				await saveToDirectory(reader, {
					path: projectPath,
					fs,
					project: opened,
				});
				await opened.close();
				const afterSave = snapshotDirectory(root);
				if (process.env.COMPAT_DEBUG)
					console.log(creator, reader, served, changedFiles(before, afterSave));
				expect(trackedChanges(changedFiles(before, afterSave))).toEqual([]);
				expect(
					changedFiles(before, afterSave).filter(
						(c) => !c.startsWith("changed")
					)
				).toEqual([]);
				expect(
					fs.readFileSync(path.join(projectPath, "settings.json"), "utf8")
				).toBe(settingsJson);
			}
		);

		test(`the ${reader} SDK reads the same messages from it as the ${creator} SDK`, async () => {
			const { projectPath } = await createDirectory(creator);
			const own = await loadFromDirectory(creator, { path: projectPath, fs });
			const expected = contentOf(await selectRows(own));
			await own.close();
			for (const served of ["published", "current"] as const) {
				servePlugins(served);
				const other = await loadFromDirectory(reader, {
					path: projectPath,
					fs,
				});
				expect(contentOf(await selectRows(other)), served).toEqual(expected);
				await other.close();
			}
		});
	}
);
