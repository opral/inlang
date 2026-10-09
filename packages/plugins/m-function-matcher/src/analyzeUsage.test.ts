import { expect, test } from "vitest";
import { analyzeUsage } from "./analyzeUsage.js";
const settings = { baseLocale: "en", locales: ["en"], modules: [] };
const analyze = (content: string, path = "src/app.tsx") =>
	analyzeUsage({ files: [{ path, content }], settings });

test("counts calls and function references, quoted and escaped IDs, JSX and template expressions", async () => {
	const result = await analyze(`import { m } from '@/paraglide/messages';
		const fn = m.first; m['quoted.id'](); m["escaped\\u005fid"](); m?.optional();
		const view = <div>{m.jsx()}</div>; const text = \`hello \${m.nested()}\`; m[\`literal\`]();`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set([
			"first",
			"quoted.id",
			"escaped_id",
			"optional",
			"jsx",
			"nested",
			"literal",
		])
	);
});
test("recognizes namespace imports, renamed m imports and named function imports", async () => {
	const result = await analyze(
		`import * as messages from './paraglide/messages.js'; import { m as translations } from './messages.js'; import { welcome as hello } from './messages.js'; messages.first(); translations.second(); hello();`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["first", "second", "welcome"])
	);
});
test("ignores comments, strings, regex literals and type-only usages", async () => {
	const result = await analyze(`import { m } from './messages'; // m.fake()
		const s = "m.fake()"; const r = /m.fake()/; type Label = typeof m.real; m.real();`);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["real"]);
});
test.each([
	"m[key]()",
	"m[`${field}_label`]()",
	"const alias = m; alias.key()",
	"const { key } = m",
	"use(m)",
	"export { m }",
	"export * from './paraglide/messages'",
	"globalThis.m.key()",
	"globalThis['m'].key()",
	'window["m"].key()',
	"globalThis[`m`].key()",
	"const x = { m }",
	"m[someKey as string]()",
	"const t = require('./messages'); t.key()",
	"const t = await import('./messages'); t.key()",
])("withholds unused findings for unresolved usage: %s", async (code) => {
	const result = await analyze(`import { m } from './messages'; ${code}`);
	expect(result.status).toBe("incomplete");
	expect(result.issues?.length).toBeGreaterThan(0);
});
test("parse errors, unsupported formats and size limits are explicit", async () => {
	for (const [content, path] of [
		["m.", "app.ts"],
		["<p>{m.key()}</p>", "app.vue"],
		[" ".repeat(2_000_001), "large.js"],
	]) {
		expect((await analyze(content!, path)).status).toBe("incomplete");
	}
});
test("retains ambiguous shadowed names conservatively", async () => {
	const result = await analyze(
		`import { m } from './messages'; function fn(m: unknown) { return m.keep(); }`
	);
	expect(result.status).toBe("incomplete");
	expect(result.usedBundleIds).toContain("keep");
});

test("counts JSX member references conservatively", async () => {
	const result = await analyze(
		`import { m } from './messages'; const view = <m.component />;`
	);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toContain("component");
});

test("retains message imports from custom paths", async () => {
	const result = await analyze(
		`import * as translations from '@/i18n'; import { legacy as fn } from '@/custom-generated'; translations.welcome(); fn();`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["welcome", "legacy"]));
});
test("bounds total snapshot size and file count", async () => {
	const files = Array.from({ length: 10_001 }, (_, i) => ({
		path: `f${i}.ts`,
		content: "",
	}));
	expect((await analyzeUsage({ files, settings })).status).toBe("incomplete");
	const large = Array.from({ length: 26 }, (_, i) => ({
		path: `f${i}.ts`,
		content: " ".repeat(2_000_000),
	}));
	expect((await analyzeUsage({ files: large, settings })).status).toBe(
		"incomplete"
	);
});

test.each([
	"const translations = await import('./custom-generated'); translations.keep();",
	"const translations = require('./custom-generated'); translations.keep();",
	"export * from './custom-generated';",
	"const translations = await import(modulePath); translations.keep();",
])(
	"custom or unresolved module graphs cannot enable deletion: %s",
	async (code) => {
		expect((await analyze(code)).status).toBe("incomplete");
	}
);

test.each([
	"export { messages as t } from './custom-generated';",
	"import t = require('./custom-generated'); t.keep();",
])(
	"unresolved named reexports and TS imports withhold fixes: %s",
	async (code) => {
		expect((await analyze(code, "app.ts")).status).toBe("incomplete");
	}
);
test("scans executable TypeScript namespaces, enums and parameter properties", async () => {
	const result = await analyze(
		`import { m } from './messages'; namespace Labels { export const label = m.in_namespace(); } enum E { Value = m.in_enum() } class C { constructor(public label = m.in_parameter()) {} }`,
		"app.ts"
	);
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["in_namespace", "in_enum", "in_parameter"])
	);
});

test.each(["app.cjs", "app.cts"])(
	"CommonJS file %s is unsupported",
	async (path) => {
		expect((await analyze("m.keep()", path)).status).toBe("incomplete");
	}
);
test("TypeScript CommonJS exports are unsupported", async () => {
	expect((await analyze("export = m;", "app.ts")).status).toBe("incomplete");
});

test.each([
	"const load = require; load('./custom-generated').keep();",
	"module.require('./custom-generated').keep();",
	"module['require']('./custom-generated').keep();",
	"import { createRequire as makeLoader } from 'node:module'; const load = makeLoader(import.meta.url); load('./custom-generated').keep();",
	"eval('m.keep()');",
	"const fn = new Function('return m.keep()'); fn();",
])(
	"unsupported loaders and evaluated code cannot enable deletion: %s",
	async (code) => {
		expect((await analyze(code)).status).toBe("incomplete");
	}
);

test("message keys named like loaders are static message references", async () => {
	const result = await analyze(
		`import { m } from './messages'; m.module(); m.exports(); m.require(); m.Function();`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["module", "exports", "require", "Function"])
	);
});

test.each([
	"globalThis.eval('m.live()')",
	"globalThis['eval']('m.live()')",
	"globalThis.Function('return m.live()')()",
	"globalThis['Function']('return m.live()')()",
])(
	"indirect dynamic evaluation withholds unused findings: %s",
	async (code) => {
		expect((await analyze(code)).status).toBe("incomplete");
	}
);

test.each([
	"const { eval: execute } = globalThis; execute('m.live()')",
	"const { Function: Build } = globalThis; Build('return m.live()')()",
	"const { m: messages } = globalThis; messages.live()",
	"const { ['m']: messages } = globalThis; messages.live()",
	"const run = ({}).constructor.constructor; run('return m.live()')()",
	"Function.prototype.constructor('return m.live()')()",
])(
	"destructured namespaces and indirect constructors withhold findings: %s",
	async (code) => {
		expect((await analyze(code)).status).toBe("incomplete");
	}
);

test.each([
	"const key = 'm'; globalThis[key].live()",
	"const key = 'm'; const messages = globalThis[key]; messages.live()",
	"const key = 'm'; const {[key]: messages} = globalThis; messages.live()",
	"const key = 'eval'; const {[key]: execute} = globalThis; execute('m.live()')",
	"Reflect.get(globalThis, 'eval')('m.live()')",
	"Object.getOwnPropertyDescriptor(window, 'eval').value('m.live()')",
	"const browser = window; browser['m'].live()",
])("dynamic global lookups and escapes withhold findings: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});
test("static ordinary global members do not make usage incomplete", async () => {
	const result = await analyze(
		"globalThis.console.log(m.live()); window['location'].href; self?.location; const options = {window: 'name'}; typeof window;"
	);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["live"]);
});

test.each([
	"const key='m'; globalThis.window[key].live()",
	"const key='m'; globalThis.globalThis[key].live()",
	"const key='m'; const browser=globalThis.window; browser[key].live()",
	"const key='m'; globalThis['globalThis'][key].live()",
	"const key='m'; window.parent[key].live()",
	"const key='m'; iframe.contentWindow[key].live()",
	"const key='m'; document.defaultView[key].live()",
])("possible global member aliases withhold findings: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});

test.each([
	"const key='m'; parent[key].live()",
	"const key='m'; top[key].live()",
	"const key='m'; frames[key].live()",
	"const key='m'; opener[key].live()",
	"const key='m'; const browser=parent; browser[key].live()",
	"const key='m'; const {contentWindow: browser}=iframe; browser[key].live()",
	"const key='m'; const {defaultView: browser}=document; browser[key].live()",
	"const key='m'; const {parent: browser}=frame; browser[key].live()",
])(
	"browser global identifiers and destructured aliases withhold findings: %s",
	async (code) => {
		expect((await analyze(code)).status).toBe("incomplete");
	}
);

test.each([
	"setTimeout('m.live()', 0)",
	"setInterval('m.live()', 1000)",
	"window.setTimeout('m.live()', 0)",
	"window['setInterval']('m.live()', 1000)",
	"const execute=setTimeout; execute('m.live()', 0)",
	"const source='m.live()'; setTimeout(source, 0)",
])("unresolved timer handlers withhold findings: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});
test("inline timer callbacks remain supported", async () => {
	const result = await analyze(
		"setTimeout(() => m.live(), 0); window.setInterval(function() { m.repeat(); }, 1000); m.setTimeout();"
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["live", "repeat", "setTimeout"])
	);
});

test.each([
	"const {setTimeout: later}=thing; later('m.live()', 0)",
	"const {['setInterval']: repeat}=thing; repeat('m.live()', 1000)",
])("destructured timer aliases withhold findings: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});

test("reports where each message is used, covering the whole call", async () => {
	const result = await analyzeUsage({
		files: [
			{
				path: "src/app.ts",
				content:
					"import { m } from './paraglide/messages.js';\nconst a = m.welcome({ name });\nconst b = m.bye;\n",
			},
			{
				path: "src/Page.svelte",
				content:
					"<script>\n\timport { m } from '$lib/paraglide/messages';\n</script>\n<p>{m.hello()}</p>\n",
			},
		],
		settings: {} as never,
	});
	expect(result.status).toBe("complete");
	expect(result.references).toEqual(
		expect.arrayContaining([
			{
				bundleId: "welcome",
				path: "src/app.ts",
				start: { line: 2, column: 10 },
				end: { line: 2, column: 29 },
			},
			{
				bundleId: "bye",
				path: "src/app.ts",
				start: { line: 3, column: 10 },
				end: { line: 3, column: 15 },
			},
			{
				bundleId: "hello",
				path: "src/Page.svelte",
				start: { line: 4, column: 4 },
				end: { line: 4, column: 13 },
			},
		])
	);
});

test.each([
	// Vite: every message module, then a computed key - nothing names a message
	`const mods = import.meta.glob("./paraglide/messages/*.js", { eager: true }); Object.values(mods)[0][k]()`,
	`const mods = import.meta.globEager("./paraglide/messages/*.js")`,
	`const meta = import.meta; meta.glob("./paraglide/messages/*.js")`,
	`const load = import.meta["glob"]; load("./paraglide/messages/*.js")`,
	`const ctx = require.context("./paraglide/messages", true); ctx.keys()`,
	`const url = new URL("./paraglide/messages/" + k + ".js", import.meta.url); await import(url.href)`,
	`__webpack_require__(id)`,
	`Reflect.get(globalThis, "m").key()`,
	`Reflect.get(m, key)()`,
	`globalThis[name]()`,
])("module loaders and reflective lookups withhold unused findings: %s", async (code) => {
	const result = await analyze(`import { m } from './messages'; ${code}`, "src/app.ts");
	expect(result.status).toBe("incomplete");
});

test("ordinary import.meta properties keep the analysis complete", async () => {
	const result = await analyze(
		`import { m } from './messages'; const url = new URL("./logo.svg", import.meta.url); if (import.meta.env.DEV) m.dev(); import.meta.hot?.accept(); console.log(import.meta.dirname, import.meta.filename);`,
		"src/app.ts"
	);
	expect(result.issues).toEqual([]);
	expect(result.usedBundleIds).toEqual(["dev"]);
});

test("TypeScript files parse type assertions and decorators", async () => {
	const angular = `import { m } from './messages';
		@Component({ selector: "app-root", template: "" })
		export class App { constructor(@Inject(TOKEN) private token: string) {} title = m.title(); }
		const y = <string>value;`;
	const result = await analyze(angular, "src/app.ts");
	expect(result.issues).toEqual([]);
	expect(result.usedBundleIds).toEqual(["title"]);
	const lit = `import { m } from './messages';
		@customElement("my-el") export class El extends LitElement { @property() label = m.label(); }`;
	expect((await analyze(lit, "src/el.ts")).usedBundleIds).toEqual(["label"]);
	expect((await analyze(lit, "src/el.js")).usedBundleIds).toEqual(["label"]);
	// JSX stays available where it is valid
	expect((await analyze(`import { m } from './messages'; const v = <p>{m.jsx()}</p>;`, "src/a.jsx")).usedBundleIds).toEqual(["jsx"]);
});

test("typeof a message in a type position counts as a usage", async () => {
	const result = await analyze(
		`import { m } from './messages'; type Label = ReturnType<typeof m.label>; let x: typeof m["quoted"];`,
		"src/app.ts"
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["label", "quoted"]));
});

// Paraglide's messages.js has `export * as m from "./messages/_index.js"`, so a namespace import of
// it reaches the messages as `all.m.<id>`.
test.each([
	["all.m.hello()", "src/app.ts"],
	['all["m"].hello()', "src/app.ts"],
	["all?.m?.hello()", "src/app.ts"],
	["const view = <all.m.hello />;", "src/app.tsx"],
])("a namespace import's m is the message namespace: %s", async (code, path) => {
	const result = await analyze(
		`import * as all from './paraglide/messages.js'; ${code}`,
		path
	);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toContain("hello");
});

test("a namespace import of a barrel reaches the messages as all.m too", async () => {
	const result = await analyze(
		`import * as all from '$lib/i18n'; all.m.hello(); all.m["quoted"]();`,
		"src/app.ts"
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["m", "hello", "quoted"]));
});

test.each([
	"all.m[k]()",
	"const x = all.m; x.hello()",
	"const { hello } = all.m",
	"Reflect.get(all.m, k)()",
	"use(all.m)",
	"use(all)",
	"export { all }",
	"const view = <all.m />;",
])("a namespace import's m that escapes withholds unused findings: %s", async (code) => {
	const result = await analyze(
		`import * as all from './paraglide/messages.js'; ${code}`,
		"src/app.tsx"
	);
	expect(result.status).toBe("incomplete");
});

test("Svelte reaches the messages through a namespace import's m", async () => {
	const result = await analyze(
		`<script>import * as all from '$lib/paraglide/messages.js';</script>\n<p>{all.m.hello()}</p>\n<all.m.card />`,
		"src/Page.svelte"
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["m", "hello", "card"]));
	expect(
		(
			await analyze(
				`<script>import * as all from '$lib/paraglide/messages.js';</script>\n<all.m />`,
				"src/Page.svelte"
			)
		).status
	).toBe("incomplete");
});

test("import.meta.hot callbacks can receive message modules", async () => {
	const result = await analyze(
		`import { m } from './messages'; import.meta.hot?.accept("./paraglide/messages.js", (mod) => mod.hello());`,
		"src/app.ts"
	);
	expect(result.status).toBe("incomplete");
});

test("Lit 3 accessor decorators parse", async () => {
	const result = await analyze(
		`import { m } from './messages'; export class El extends LitElement { @property() accessor label = m.label(); }`,
		"src/el.js"
	);
	expect(result.issues).toEqual([]);
	expect(result.usedBundleIds).toEqual(["label"]);
});

test.each([
	"import * as all from './paraglide/messages.js'; const { m: messages } = all; messages.hello()",
	"import i18n from '$lib/i18n'; i18n.m.hello()",
	"import { i18n } from '$lib/i18n'; i18n.m.hello()",
	"export * as messages from './paraglide/messages.js'",
	"import * as all from './paraglide/messages.js'; export default all",
])("other ways a namespace of namespaces escapes withhold unused findings: %s", async (code) => {
	expect((await analyze(code, "src/app.ts")).status).toBe("incomplete");
});

test("typeof a namespace import's m.x in a type counts as a usage", async () => {
	const result = await analyze(
		`import * as all from './paraglide/messages.js'; all.m.used(); export type T = typeof all.m.old; type U = (typeof all.m)["quoted"];`,
		"src/app.ts"
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["m", "used", "old", "quoted"])
	);
});

test.each([
	"type T = typeof all",
	"type T = typeof all.m",
	"type T = (typeof all.m)[K]",
	"type T = typeof m",
	"type Keys = keyof typeof m",
])("other typeof uses of a namespace withhold unused findings: %s", async (code) => {
	const result = await analyze(
		`import * as all from './paraglide/messages.js'; import { m } from './paraglide/messages.js'; ${code};`,
		"src/app.ts"
	);
	expect(result.status).toBe("incomplete");
});

test("an aliased import.meta.hot withholds unused findings", async () => {
	const result = await analyze(
		`import { m } from './messages'; const hot = import.meta.hot; hot?.accept("./paraglide/messages.js", (mod) => mod.hello());`,
		"src/app.ts"
	);
	expect(result.status).toBe("incomplete");
});
