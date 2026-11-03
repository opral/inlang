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

test("a local custom data tuple does not suppress unused-message diagnostics", async () => {
	const { project, files } = await load({
		pathPattern: "./locales/{locale}.json",
		locales: {
			"locales/en.json": { live: "Live", legacy: "Legacy" },
			"locales/de.json": { live: "Aktuell", legacy: "Alt" },
		},
		source: {
			"src/theme.ts": `export function useTheme() {
				const theme = { mode: "dark" };
				return [theme, ["small", "large"]] as const;
			}`,
			"src/App.tsx": `
				import { useTranslation } from "react-i18next";
				import { useTheme } from "./theme";
				const [theme, mediaQueries] = useTheme();
				consume(theme);
				const { t } = useTranslation();
				t("live");
			`,
		},
	});
	const result = await checkProject({
		project,
		files,
		checks: ["unused-message"],
	});
	expect(result.checks).toEqual([{ id: "unused-message", status: "complete" }]);
	expect(unused(result)).toEqual(["legacy"]);
});

test("an opaque tuple translator escaping cannot offer deletion fixes", async () => {
	const { project, files } = await load({
		pathPattern: "./locales/{locale}.json",
		locales: {
			"locales/en.json": { live: "Live", legacy: "Legacy" },
			"locales/de.json": { live: "Aktuell", legacy: "Alt" },
		},
		source: {
			"src/App.tsx": `
				import "react-i18next";
				import { useCustomTranslation } from "external-hooks";
				const [translate] = useCustomTranslation();
				render(translate);
			`,
		},
	});
	const result = await checkProject({
		project,
		files,
		checks: ["unused-message"],
	});
	expect(result.checks[0]?.status).toBe("incomplete");
	expect(unused(result)).toEqual([]);
	expect(result.diagnostics.flatMap((diagnostic) => diagnostic.fixes)).toEqual(
		[]
	);
});

test.each([
	[
		"a constructor parameter property",
		`class Reader {
			constructor(private useState: Hook) {
				const [translate] = useState();
				translate("live");
			}
		}`,
	],
	[
		"a React state initializer returning a translator",
		`const [translate] = useState(() => getFixedT("en"));
		 translate("live");`,
	],
	[
		"a React state setter storing a translator",
		`const [translate, setTranslate] = useState("initial");
		 setTranslate(() => getFixedT("en"));
		 translate("live");`,
	],
	[
		"a tuple changed by a mutating method",
		`function useHook() {
			const result = ["initial"];
			result.splice(0, 1, getFixedT("en"));
			return result;
		}
		const [translate] = useHook(); translate("live");`,
	],
	[
		"a tuple mutated through a TypeScript-wrapped alias",
		`function useHook() {
			const result = ["initial"];
			const alias = (result as any)!;
			alias.splice(0, 1, getFixedT("en"));
			return result;
		}
		const [translate] = useHook(); translate("live");`,
	],
	[
		"tuple elements mutated through for-of aliases",
		`function useHook() {
			const result = [{ fn: "initial" }];
			for (const item of result) item.fn = getFixedT("en");
			return result;
		}
		const [{ fn: translate }] = useHook(); translate("live");`,
	],
	[
		"a custom state hook exposing its setter",
		`function useHook() { return useState(null); }
		const [value, setValue] = useHook();
		setValue(() => getFixedT("en"));
		value("live");`,
	],
	[
		"property deletion revealing an inherited translator",
		`function useHook() {
			const obj = { fn: "initial", __proto__: { fn: getFixedT("en") } };
			delete obj.fn;
			return [obj.fn];
		}
		const [translate] = useHook(); translate("live");`,
	],
])("%s cannot offer deletion of a live translation", async (_name, source) => {
	const { project, files } = await load({
		pathPattern: "./locales/{locale}.json",
		locales: {
			"locales/en.json": { live: "Live", legacy: "Legacy" },
			"locales/de.json": { live: "Aktuell", legacy: "Alt" },
		},
		source: {
			"src/Reader.ts": `
				import { useState } from "react";
				import { getFixedT } from "i18next";
				${source}
			`,
		},
	});
	const result = await checkProject({
		project,
		files,
		checks: ["unused-message"],
	});
	expect(unused(result)).not.toContain("live");
});
