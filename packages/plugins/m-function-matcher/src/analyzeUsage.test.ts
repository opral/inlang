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
		const s = "m.fake()"; const r = /m.fake()/; type Keys = keyof typeof m; m.real();`);
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
