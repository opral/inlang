import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
	checkProject,
	loadProjectFromDirectory,
	type InlangPlugin,
	type InlangProject,
	type SourceFile,
} from "@inlang/sdk";
import { plugin } from "../plugin.js";

// loading projects with the SDK is slow on CI
vi.setConfig({ testTimeout: 30_000 });

const open: InlangProject[] = [];
afterEach(async () => {
	for (const project of open.splice(0)) await project.close();
});

/** Writes an app like a user's repo, loads its inlang project and returns its source files like the CLI does. */
async function load(app: {
	pathPattern: string | Record<string, string>;
	locales: Record<string, unknown>;
	source: Record<string, string>;
}) {
	const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "i18next-usage-"));
	const write = (path: string, content: string) => {
		fs.mkdirSync(nodePath.dirname(nodePath.join(root, path)), {
			recursive: true,
		});
		fs.writeFileSync(nodePath.join(root, path), content);
	};
	write(
		"project.inlang/settings.json",
		JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de"],
			modules: [],
			"plugin.inlang.i18next": { pathPattern: app.pathPattern },
		})
	);
	for (const [path, content] of Object.entries(app.locales))
		write(path, JSON.stringify(content));
	for (const [path, content] of Object.entries(app.source))
		write(path, content);
	const project = await loadProjectFromDirectory({
		path: nodePath.join(root, "project.inlang"),
		fs,
		providePlugins: [plugin as unknown as InlangPlugin],
	});
	open.push(project);
	const files: SourceFile[] = Object.keys(app.source).map((path) => ({
		path,
		content: app.source[path]!,
	}));
	return { project, files };
}
const unused = (result: Awaited<ReturnType<typeof checkProject>>) =>
	result.diagnostics
		.filter((diagnostic) => diagnostic.checkId === "unused-message")
		.map((diagnostic) => diagnostic.bundleId)
		.sort();

test("unused messages of a react-i18next app with namespaces, plurals and context", async () => {
	const { project, files } = await load({
		pathPattern: {
			common: "./locales/{locale}/common.json",
			admin: "./locales/{locale}/admin.json",
		},
		locales: {
			"locales/en/common.json": {
				title: "Title",
				nav: { home: "Home", old: "Old" },
				item_one: "{{count}} item",
				item_other: "{{count}} items",
				friend: "Friend",
				friend_male: "Boyfriend",
				legacy: "Legacy",
			},
			"locales/de/common.json": { title: "Titel", nav: { home: "Start" } },
			"locales/en/admin.json": { users: "Users", title: "Admin title" },
			"locales/de/admin.json": { users: "Benutzer" },
		},
		source: {
			"src/App.tsx": `
				import { useTranslation, Trans } from "react-i18next";
				export function App({ count }) {
					const { t } = useTranslation("common");
					return (
						<>
							<h1>{t("title")}</h1>
							<a>{t("nav.home")}</a>
							<p>{t("item", { count })}</p>
							<p>{t("friend", { context: "male" })}</p>
							<Trans i18nKey="admin:users" />
						</>
					);
				}
			`,
		},
	});
	expect(await project.errors.get()).toEqual([]);
	const result = await checkProject({
		project,
		files,
		checks: ["unused-message"],
	});
	expect(result.checks).toEqual([{ id: "unused-message", status: "complete" }]);
	expect(unused(result)).toEqual([
		"admin:title",
		"common:legacy",
		"common:nav.old",
	]);
});

test("a dynamic key withholds the findings and names the line", async () => {
	const { project, files } = await load({
		pathPattern: "./locales/{locale}.json",
		locales: {
			"locales/en.json": {
				used: "Used",
				status: { open: "Open" },
				legacy: "Legacy",
			},
			"locales/de.json": { used: "Benutzt" },
		},
		source: {
			"src/status.ts": `
				import i18next from "i18next";
				export const used = i18next.t("used");
				export const status = (s: string) => i18next.t(\`status.\${s}\`);
			`,
		},
	});
	const result = await checkProject({
		project,
		files,
		checks: ["unused-message"],
	});
	expect(result.checks[0]).toMatchObject({
		id: "unused-message",
		status: "incomplete",
		issues: [
			{
				path: "src/status.ts",
				reason: "Dynamic keys can't be resolved.",
				start: { line: 4 },
			},
		],
	});
	expect(unused(result)).toEqual([]);
});

test("the plugin's project errors don't come from the analyzer", async () => {
	const { project } = await load({
		pathPattern: "./locales/{locale}.json",
		locales: { "locales/en.json": { a: "A" }, "locales/de.json": { a: "A" } },
		source: { "src/index.ts": "export {}" },
	});
	expect(await project.errors.get()).toEqual([]);
	expect(
		(await project.plugins.get()).some((entry) => entry.analyzeUsage)
	).toBe(true);
});
