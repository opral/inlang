import { expect, test } from "vitest";
import { analyzeUsage } from "./analyzeUsage.js";
const settings = { baseLocale: "en", locales: ["en"], modules: [] };
const analyze = (content: string) =>
	analyzeUsage({
		files: [{ path: "src/Component.svelte", content }],
		settings,
	});

test("analyzes JS scripts, reactive statements, template text and attributes", async () => {
	const result = await analyze(
		`<script>import { m } from './messages'; let label = m.script(); $: label = m.reactive();</script><p title={m['attribute']()}>{m.template()}</p><button onclick={() => m.event()}>Text</button>`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["script", "reactive", "attribute", "template", "event"])
	);
});
test("shares module/instance import aliases with template expressions and TypeScript", async () => {
	const result = await analyze(
		`<script module lang="ts">import { m as translations } from './messages'; export const label: string = translations.module();</script><script lang="ts">import * as labels from './custom-generated'; const label: string = labels.instance();</script><p>{translations.template()}{labels['quoted\\u005fid']()}</p>`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["module", "instance", "template", "quoted_id"])
	);
});
test("analyzes legacy module scripts and Svelte 5 runes", async () => {
	const legacy = await analyze(
		`<script context="module">import { m as t } from './messages'; export const label = t.module();</script>{t.template()}`
	);
	expect(legacy.status).toBe("complete");
	expect(new Set(legacy.usedBundleIds)).toEqual(
		new Set(["module", "template"])
	);
	const runes = await analyze(
		`<script lang="ts">import { m } from './messages'; let label = $derived(m.derived());</script>{label}`
	);
	expect(runes.status).toBe("complete");
	expect(runes.usedBundleIds).toEqual(["derived"]);
});
test("visits control flow, snippets, render/html tags, spreads and directives", async () => {
	const result =
		await analyze(`<script>import { m } from './messages'; let items = []; let promise; let snippet;</script>
 {#if m.condition()}{@const label = m.constant()}{m.if_body()}{:else}{m.else_body()}{/if}
 {#each items as item (m.each_key())}{m.each_body()}{/each}
 {#await promise}{m.pending()}{:then value}{m.resolved()}{:catch error}{m.rejected()}{/await}
 {#key m.keyed()}{m.key_body()}{/key}
 {#snippet row(value)}{m.snippet_body()}{/snippet}{@render snippet(m.render_arg())}{@html m.html()}
 <div {...{title: m.spread()}} class:active={m.directive()} use:action={m.action()} />`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set([
			"condition",
			"constant",
			"if_body",
			"else_body",
			"each_key",
			"each_body",
			"pending",
			"resolved",
			"rejected",
			"keyed",
			"key_body",
			"snippet_body",
			"render_arg",
			"html",
			"spread",
			"directive",
			"action",
		])
	);
});
test("ignores markup, script comments, strings and CSS", async () => {
	const result =
		await analyze(`<script>import { m } from './messages'; // m.fake()
 const text = "m.fake()";</script><!-- {m.fake()} --><p>m.fake() {m.real()}</p><style>p::after { content: 'm.fake()'; font-family: m; }</style>`);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["real"]);
});
test.each([
	`<script>import { m } from './messages'; let key;</script>{m[key]()}`,
	`<script>import { m as t } from './messages'; let key;</script>{t[\`${"${key}"}_label\`]()}`,
	`<script>import { m } from './messages';</script><Child messages={m} />`,
	`<script>import { m } from './messages'; const alias = m;</script>{alias.key()}`,
	`<script>const t = await import('./custom-generated');</script>{t.key()}`,
	`<script module>export { m as t } from './custom-generated';</script><p />`,
	`<script src="./external.js"></script><p />`,
	`<script lang="coffee">const label = 1;</script><p />`,
	`<script>import { m } from './messages'; m.</script>`,
	`<p>{m.key()}</div>`,
])("unresolved or invalid Svelte input withholds fixes: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});
test("retains dotted component references", async () => {
	const result = await analyze(
		`<script>import { m } from './messages';</script><m.component />`
	);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toContain("component");
});

test("retains dotted directive references", async () => {
	const result = await analyze(
		`<script>import { m } from './messages';</script><div use:m.action transition:m.transition animate:m.animate />`
	);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["action", "transition", "animate"])
	);
});
