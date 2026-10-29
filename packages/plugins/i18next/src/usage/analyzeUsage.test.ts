import { expect, test } from "vitest";
import type { ProjectSettings } from "@inlang/sdk";
import { analyzeUsage } from "./analyzeUsage.js";
import { PLUGIN_KEY } from "../pluginKey.js";

const single = {
	baseLocale: "en",
	locales: ["en", "de"],
	[PLUGIN_KEY]: { pathPattern: "./locales/{locale}.json" },
} as unknown as ProjectSettings;
const namespaced = {
	baseLocale: "en",
	locales: ["en", "de"],
	[PLUGIN_KEY]: {
		pathPattern: {
			common: "./locales/{locale}/common.json",
			admin: "./locales/{locale}/admin.json",
		},
	},
} as unknown as ProjectSettings;

async function analyze(
	source: string,
	settings: ProjectSettings = single,
	path = "src/App.tsx"
) {
	const result = await analyzeUsage({
		files: [{ path, content: source }],
		settings,
	});
	return {
		used: [...result.usedBundleIds].sort(),
		status: result.status,
		reasons: (result.issues ?? []).map((issue) => issue.reason),
		issues: result.issues ?? [],
	};
}

test("keys read with t() of useTranslation are used", async () => {
	const result = await analyze(`
		import { useTranslation } from "react-i18next";
		export function App() {
			const { t } = useTranslation();
			return <h1>{t("home.title")}{t(\`home.body\`)}</h1>;
		}
	`);
	expect(result).toMatchObject({
		status: "complete",
		used: expect.arrayContaining(["home.title", "home.body"]),
	});
});

test("plural and context keys use the bundle of their root key", async () => {
	const result = await analyze(`
		import i18next from "i18next";
		i18next.t("friend", { context: "male", count: 2 });
		i18next.t("item_other");
	`);
	expect(result.status).toBe("complete");
	// the root key, and every prefix of a key that already carries a suffix
	expect(result.used).toEqual(
		expect.arrayContaining(["friend", "item", "item_other"])
	);
});

test("a namespace in the key, the hook or the options selects the bundle", async () => {
	const result = await analyze(
		`
		import { useTranslation, Trans } from "react-i18next";
		function A() { const { t } = useTranslation("admin"); return t("users"); }
		function B() { const { t: tr } = useTranslation(["common"]); return tr("save"); }
		function C({ i18n }) { return i18n.t("hello", { ns: "admin" }); }
		function D() { const { t: tCommon } = useTranslation("common"); return tCommon("admin:reports"); }
		const e = <Trans i18nKey="common:title" />;
	`,
		namespaced
	);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining([
			"admin:users",
			"common:save",
			"admin:hello",
			"admin:reports",
			"common:title",
		])
	);
	// not read in the namespaces the keys don't belong to
	expect(result.used).not.toContain("common:users");
	expect(result.used).not.toContain("admin:save");
});

test("without a namespace, a key counts in every namespace", async () => {
	const result = await analyze(
		`import i18n from "i18next"; i18n.t("shared");`,
		namespaced
	);
	expect(result.used).toEqual(
		expect.arrayContaining(["common:shared", "admin:shared"])
	);
});

test("a project without namespaces has plain bundle ids", async () => {
	const result = await analyze(
		`import i18n from "i18next"; i18n.t("common:greeting");`
	);
	expect(result.used).toEqual(
		expect.arrayContaining(["greeting", "common:greeting"])
	);
});

test("conditionals and arrays of static keys are resolved", async () => {
	const result = await analyze(`
		import i18n from "i18next";
		i18n.t(ok ? "status.ok" : "status.failed");
		i18n.t(["first", "second"]);
	`);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining(["status.ok", "status.failed", "first", "second"])
	);
});

test("<Trans> with i18nKey and its t prop", async () => {
	const result = await analyze(`
		import { Trans, useTranslation } from "react-i18next";
		const { t } = useTranslation();
		const a = <Trans i18nKey="welcome" t={t} />;
		const b = <Trans i18nKey={"bye"} />;
	`);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(expect.arrayContaining(["welcome", "bye"]));
});

test("withTranslation props and <Translation> render props", async () => {
	const result = await analyze(`
		import { Translation } from "react-i18next";
		function Legacy(props) { return props.t("legacy.title"); }
		const x = <Translation>{(translate) => translate("render.title")}</Translation>;
	`);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining(["legacy.title", "render.title"])
	);
});

test("TypeScript and decorators parse", async () => {
	const result = await analyze(
		`
		import { getFixedT } from "i18next";
		const t = getFixedT("en", "common") as TFunction<"common">;
		export const label: string = t("typed.label") satisfies string;
		type Key = typeof t;
	`,
		namespaced,
		"src/typed.ts"
	);
	expect(result.status).toBe("complete");
	expect(result.used).toContain("common:typed.label");
});

// ---- incomplete: anything that could read a key we can't see ----

const incomplete = [
	[
		"a dynamic key",
		`import i18n from "i18next"; i18n.t(\`status.\${s}\`);`,
		/Dynamic keys/,
	],
	[
		"a key in a variable",
		`const { t } = useTranslation(); t(key);`,
		/Dynamic keys/,
	],
	[
		"a call without a key",
		`const { t } = useTranslation(); t();`,
		/without a static key/,
	],
	[
		"a translator passed to a function",
		`import { useTranslation } from "react-i18next"; const { t } = useTranslation(); render(t);`,
		/passed on/,
	],
	[
		"a translator in a prop",
		`import { useTranslation } from "react-i18next"; const { t } = useTranslation(); const x = <Child t={t} />;`,
		/passed on/,
	],
	[
		"i18n.t as a value",
		`import i18n from "i18next"; const run = [1].map(i18n.t);`,
		/passed on/,
	],
	[
		"i18n.t.bind",
		`import i18n from "i18next"; const f = i18n.t.bind(i18n); f("bound.key");`,
		/passed on/,
	],
	[
		"an exported translator alias",
		`import i18n from "i18next"; export const tr = i18n.t;`,
		/exported translator/,
	],
	[
		"keyPrefix",
		`import { useTranslation } from "react-i18next"; const { t } = useTranslation("a", { keyPrefix: "b" });`,
		/keyPrefix/,
	],
	[
		"getFixedT with a keyPrefix",
		`import i18n from "i18next"; const t = i18n.getFixedT("en", "a", "b");`,
		/keyPrefix/,
	],
	[
		"returnObjects",
		`import i18n from "i18next"; i18n.t("list", { returnObjects: true });`,
		/returnObjects/,
	],
	[
		"fallbackNS",
		`import i18n from "i18next"; i18n.init({ fallbackNS: "common" });`,
		/fallbackNS/,
	],
	[
		"a custom nsSeparator",
		`import i18n from "i18next"; i18n.init({ nsSeparator: "|" });`,
		/nsSeparator/,
	],
	[
		"a custom keySeparator",
		`import i18n from "i18next"; i18n.init({ keySeparator: ">" });`,
		/keySeparator/,
	],
	[
		"reading a resource bundle",
		`import i18n from "i18next"; i18n.getResourceBundle("en", "common");`,
		/without a key/,
	],
	[
		"<Trans> without i18nKey",
		`import { Trans } from "react-i18next"; const x = <Trans>Hello <b>world</b></Trans>;`,
		/without i18nKey/,
	],
	[
		"a dynamic i18nKey",
		`import { Trans } from "react-i18next"; const x = <Trans i18nKey={key} />;`,
		/Dynamic i18nKey/,
	],
	[
		"require of i18next",
		`const i18n = require("i18next"); i18n.t("a");`,
		/CommonJS/,
	],
	[
		"options in a variable",
		`import { useTranslation } from "react-i18next"; const { t } = useTranslation(); t("menu", props.options);`,
		/aren't an object literal/,
	],
	[
		"spread options",
		`import i18n from "i18next"; i18n.t("menu", { ...opts });`,
		/aren't an object literal/,
	],
	[
		"options from a call",
		`import i18n from "i18next"; i18n.t("menu", "Menu", options());`,
		/aren't an object literal/,
	],
	[
		"a spread argument",
		`import i18n from "i18next"; i18n.t("menu", ...rest);`,
		/aren't an object literal/,
	],
	[
		"a computed option name",
		`import i18n from "i18next"; i18n.t("menu", { [name]: true });`,
		/aren't an object literal/,
	],
	[
		"tOptions in a variable",
		`import { Trans } from "react-i18next"; const x = <Trans i18nKey="menu" tOptions={opts} />;`,
		/aren't an object literal/,
	],
] as const;
test.each(incomplete)(
	"%s makes the analysis incomplete",
	async (_name, source, reason) => {
		const result = await analyze(source);
		expect(result.status).toBe("incomplete");
		expect(result.reasons.join("\n")).toMatch(reason);
	}
);

test("literal options, a default value and no options keep the analysis complete", async () => {
	const result = await analyze(`
		import { Trans, useTranslation } from "react-i18next";
		const { t } = useTranslation();
		t("a", { count, name: user.name, context: "male" });
		t("b", "Default text");
		t("c", \`Default \${name}\`, { count: 2 });
		t("d", undefined);
		const x = <Trans i18nKey="e" tOptions={{ count }} />;
	`);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(["a", "b", "c", "d", "e"]);
});

test("an issue points at the code", async () => {
	const result = await analyze(`import i18n from "i18next";\n\ni18n.t(key);`);
	expect(result.issues[0]).toMatchObject({
		path: "src/App.tsx",
		start: { line: 3, column: 7 },
		end: { line: 3, column: 10 },
	});
});

test("files i18next can't be read from make the analysis incomplete", async () => {
	for (const [path, content] of [
		["src/App.vue", `<template>{{ $t("a") }}</template>`],
		[
			"src/App.svelte",
			`<script>import i18next from "i18next"; i18next.t("a")</script>`,
		],
		["src/legacy.cjs", `const i18n = require("i18next"); i18n.t("a");`],
		["content/page.mdx", `import { useTranslation } from "react-i18next"`],
	] as const) {
		const result = await analyze(content, single, path);
		expect(result.status, path).toBe("incomplete");
	}
});

test("files without i18next usage are ignored, whatever their type", async () => {
	for (const [path, content] of [
		["src/App.vue", `<template><p>Hello</p></template>`],
		["styles/app.css", `.t { color: red }`],
		[
			"src/math.ts",
			`export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;`,
		],
		["README.md", `Use t("key")`],
		["locales/en.json", `{ "a": "b" }`],
	] as const) {
		const result = await analyze(content, single, path);
		expect(result, path).toMatchObject({ status: "complete", used: [] });
	}
});

test("a file that can't be parsed makes the analysis incomplete when it mentions translations", async () => {
	const result = await analyze(`import i18n from "i18next"; i18n.t("a"`);
	expect(result).toMatchObject({
		status: "incomplete",
		reasons: ["The file could not be parsed."],
	});
});

test("unrelated `.t` and `t` stay out of the way", async () => {
	const result = await analyze(
		`
		const point = { t: 1 };
		const fade = (t: number) => t * 2;
		export const x = fade(point.t);
	`,
		single,
		"src/animation.ts"
	);
	expect(result).toMatchObject({ status: "complete", used: [] });
});

test("a snapshot over the size limit is incomplete", async () => {
	const files = Array.from({ length: 10_001 }, (_, index) => ({
		path: `src/${index}.ts`,
		content: "",
	}));
	const result = await analyzeUsage({ files, settings: single });
	expect(result.status).toBe("incomplete");
});

test("a translator renamed in a destructured parameter is read", async () => {
	const result = await analyze(`
		import { withTranslation } from "react-i18next";
		function Page({ t: translate }) { return translate("renamed.key"); }
		export default withTranslation()(Page);
	`);
	expect(result).toMatchObject({ status: "complete" });
	expect(result.used).toContain("renamed.key");
});

// ---- keys written as constants ----

async function analyzeFiles(
	files: Record<string, string>,
	settings: ProjectSettings = single
) {
	const result = await analyzeUsage({
		files: Object.entries(files).map(([path, content]) => ({ path, content })),
		settings,
	});
	return {
		used: [...result.usedBundleIds].sort(),
		status: result.status,
		reasons: (result.issues ?? []).map((issue) => issue.reason),
	};
}
const i18n = `import i18n from "i18next";\n`;

test("constants in the same file are keys", async () => {
	const result = await analyze(`${i18n}
		const TITLE = "home.title";
		const PAGE = "page";
		const KEYS = { save: "actions.save", nav: { home: "nav.home" } } as const;
		enum Status { Open = "status.open", Closed = "status.closed" }
		i18n.t(TITLE);
		i18n.t(KEYS.save);
		i18n.t(KEYS["nav"].home);
		i18n.t(\`\${PAGE}.title\`);
		i18n.t(Status.Open);
		i18n.t(cond ? KEYS.save : TITLE);
	`);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining([
			"home.title",
			"actions.save",
			"nav.home",
			"page.title",
			"status.open",
		])
	);
	expect(result.used).not.toContain("status.closed");
});

const dynamicConstants = [
	["let", `let K = "a.b"; i18n.t(K);`],
	["a parameter", `export const read = (K: string) => i18n.t(K);`],
	["a call", `const K = compute(); i18n.t(K);`],
	[
		"a const and a let of the same name",
		`const K = "a.b"; function f() { let K = x; return i18n.t(K); }`,
	],
	["a missing property", `const KEYS = { a: "a" }; i18n.t(KEYS.b);`],
	["a computed property", `const KEYS = { a: "a" }; i18n.t(KEYS[name]);`],
	["an object", `const KEYS = { a: "a" }; i18n.t(KEYS);`],
	["a spread object", `const KEYS = { ...OTHER, a: "a" }; i18n.t(KEYS.b);`],
	["a loop variable", `for (const K of keys) i18n.t(K);`],
	["an enum member without a string", `enum E { A } i18n.t(E.A);`],
	[
		"a template with a dynamic part",
		`const P = "a"; i18n.t(\`\${P}.\${suffix}\`);`,
	],
] as const;
test.each(dynamicConstants)("%s is still dynamic", async (_name, source) => {
	const result = await analyze(`${i18n}${source}`);
	expect(result.status).toBe("incomplete");
	expect(result.reasons.join("\n")).toMatch(/Dynamic keys/);
});

test("constants imported from another file are keys", async () => {
	const result = await analyzeFiles({
		"src/keys.ts": `
			export const TITLE = "home.title";
			export const KEYS = { save: "actions.save" } as const;
			export enum Status { Open = "status.open" }
			const hidden = "hidden.key";
			export { hidden as HIDDEN };
		`,
		"src/App.ts": `${i18n}
			import { TITLE, KEYS as K, Status } from "./keys";
			import { HIDDEN } from "./keys.js";
			i18n.t(TITLE); i18n.t(K.save); i18n.t(Status.Open); i18n.t(HIDDEN);
		`,
		"src/nested/Page.ts": `${i18n}
			import { TITLE } from "@/keys";
			import { KEYS } from "../keys";
			i18n.t(TITLE); i18n.t(KEYS.save);
		`,
	});
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining([
			"home.title",
			"actions.save",
			"status.open",
			"hidden.key",
		])
	);
});

test("constants that can't be followed stay dynamic", async () => {
	const files = {
		"src/keys.ts": `export const TITLE = "home.title"; export let MUTABLE = "a"; export const FROM_CALL = compute();`,
		"src/barrel.ts": `export * from "./keys";`,
		"src/a/other.ts": `export const DUP = "x";`,
		"src/b/other.ts": `export const DUP = "y";`,
	};
	for (const [name, source] of [
		["a barrel re-export", `import { TITLE } from "./barrel"; i18n.t(TITLE);`],
		["a package", `import { TITLE } from "some-package"; i18n.t(TITLE);`],
		["an exported let", `import { MUTABLE } from "./keys"; i18n.t(MUTABLE);`],
		[
			"an exported call",
			`import { FROM_CALL } from "./keys"; i18n.t(FROM_CALL);`,
		],
		[
			"a file outside the snapshot",
			`import { TITLE } from "../outside/keys"; i18n.t(TITLE);`,
		],
		["an ambiguous alias", `import { DUP } from "@/other"; i18n.t(DUP);`],
		["a default import", `import TITLE from "./keys"; i18n.t(TITLE);`],
		[
			"an import shadowed by a const",
			`import { TITLE } from "./keys"; { const TITLE = "z"; i18n.t(TITLE); }`,
		],
		["a missing export", `import { NOPE } from "./keys"; i18n.t(NOPE);`],
	] as const) {
		const result = await analyzeFiles({
			...files,
			"src/App.ts": `${i18n}${source}`,
		});
		expect(result.status, name).toBe("incomplete");
		expect(result.reasons.join("\n"), name).toMatch(/Dynamic keys/);
	}
});

test("files that import each other don't hang the analysis", async () => {
	const result = await analyzeFiles({
		"src/a.ts": `import { B } from "./b"; export const A = B;`,
		"src/b.ts": `import { A } from "./a"; export const B = A;`,
		"src/App.ts": `${i18n}import { A } from "./a"; i18n.t(A);`,
	});
	expect(result.status).toBe("incomplete");
});

// ---- translation files read directly ----

test("translation files handed to i18next are not reads", async () => {
	const result = await analyze(`
		import i18n from "i18next";
		import en from "./locales/en.json";
		import * as de from "./locales/de.json";
		import pkg from "../package.json";
		i18n.init({ resources: { en: { translation: en }, de: { translation: de } } });
		i18n.addResourceBundle("en", "extra", en);
		export const version = pkg.version;
	`);
	expect(result.status).toBe("complete");
});

const catalogReads = [
	[
		"a property",
		`import en from "./locales/en.json"; export const title = en.title;`,
		/en is a translation file/,
	],
	[
		"a spread",
		`import en from "./locales/en.json"; export const all = { ...en };`,
		/en is a translation file/,
	],
	[
		"a call",
		`import en from "./locales/en.json"; Object.keys(en);`,
		/en is a translation file/,
	],
	[
		"a named import",
		`import { title } from "./locales/en.json"; console.log(title);`,
		/read from a translation file directly/,
	],
	[
		"a require",
		`const en = require("./locales/en.json"); en.title;`,
		/en is a translation file/,
	],
	[
		"a required property",
		`export const title = require("./locales/en.json").title;`,
		/loaded and read directly/,
	],
	[
		"a dynamic import",
		`export const load = () => import("./locales/de.json");`,
		/loaded and read directly/,
	],
	[
		"a destructured require",
		`const { title } = require("./locales/en.json");`,
		/destructured/,
	],
	[
		"fs",
		`import fs from "node:fs"; fs.readFileSync("src/locales/en.json", "utf8");`,
		/read directly/,
	],
	["fetch", `fetch("/locales/de.json");`, /read directly/],
] as const;
test.each(catalogReads)(
	"a translation file read through %s",
	async (_name, source, reason) => {
		const result = await analyze(`${i18n}${source}`);
		expect(result.status).toBe("incomplete");
		expect(result.reasons.join("\n")).toMatch(reason);
	}
);

test("a namespaced translation file is recognized by its path", async () => {
	const result = await analyze(
		`import admin from "../locales/de/admin.json"; export const x = admin.users;`,
		namespaced
	);
	expect(result.status).toBe("incomplete");
});

test("the source language file outside pathPattern is recognized", async () => {
	const settings = {
		baseLocale: "en",
		locales: ["en", "de"],
		[PLUGIN_KEY]: {
			pathPattern: "./locales/{locale}.json",
			sourceLanguageFilePath: "./src/i18n/source.json",
		},
	} as unknown as ProjectSettings;
	const result = await analyze(
		`import i18n from "i18next"; import source from "../i18n/source.json"; i18n.t("a"); export const title = source.title;`,
		settings
	);
	expect(result.status).toBe("incomplete");
	expect(result.reasons.join("\n")).toMatch(/read directly/);

	const byNamespace = {
		...namespaced,
		[PLUGIN_KEY]: {
			...(namespaced as Record<string, any>)[PLUGIN_KEY],
			sourceLanguageFilePath: { common: "./src/source/common.json" },
		},
	} as unknown as ProjectSettings;
	const namespacedResult = await analyze(
		`import common from "./source/common.json"; export const x = common.title;`,
		byNamespace
	);
	expect(namespacedResult.status).toBe("incomplete");
});

test("the resource store of i18next holds every translation", async () => {
	for (const source of [
		`import i18n from "i18next"; i18n.store.data;`,
		`import i18n from "i18next"; i18n.options.resources;`,
		`import { useTranslation } from "react-i18next"; const { i18n } = useTranslation(); i18n.store.data;`,
		`import i18n from "i18next"; i18n.services.resourceStore.data;`,
	]) {
		expect((await analyze(source)).status, source).toBe("incomplete");
	}
	// not every `store` is i18next's
	const result = await analyze(
		`import i18n from "i18next"; state.store.dispatch({});`
	);
	expect(result.status).toBe("complete");
});

// ---- $t ----

test("$t of i18next-vue is read in scripts", async () => {
	const result = await analyze(
		`
		export const x = { methods: { run() { return this.$t("vue.method"); } } };
		app.config.globalProperties.$t("vue.global");
		$t("vue.bare");
		$te("vue.exists");
		this.$te("vue.member-exists");
	`,
		single,
		"src/vue.ts"
	);
	expect(result.status).toBe("complete");
	expect(result.used).toEqual(
		expect.arrayContaining([
			"vue.method",
			"vue.global",
			"vue.bare",
			"vue.exists",
			"vue.member-exists",
		])
	);
	expect((await analyze(`this.$t(key);`, single, "src/vue.ts")).status).toBe(
		"incomplete"
	);
});
