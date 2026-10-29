import { expect, test } from "vitest";
import { analyzeUsage } from "./analyzeUsage.js";
const settings = { baseLocale: "en", locales: ["en"], modules: [] };
const analyze = (content: string) =>
	analyzeUsage({
		files: [{ path: "src/Page.astro", content }],
		settings,
	});

test("analyzes frontmatter, template and attribute expressions", async () => {
	const result = await analyze(`---
import { m } from './messages';
const label = m.frontmatter();
---
<p title={m.attribute()}>{m.template()}</p>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["frontmatter", "attribute", "template"])
	);
});

test.each([
	{ name: "byte-order mark", prefix: "\uFEFF" },
	{ name: "leading newlines", prefix: "\n\n" },
	{ name: "leading spaces and newlines", prefix: "  \n" },
])("detects the frontmatter fence after a $name", async ({ prefix }) => {
	const result = await analyze(`${prefix}---
import { m } from './messages';
const title = m.fenced();
---
<h1>{m.template()}</h1>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["fenced", "template"])
	);
});

test("keeps the frontmatter open across fence lines in template literals", async () => {
	const result = await analyze(`---
import { m } from './messages';
const md = \`
---
section
\`;
const title = m.markdown();
---
<p>{m.body()}</p>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["markdown", "body"])
	);
});

test.each(["Style", "STYLE", "sTyLe"])(
	"treats capitalized %s tags as components with expression children",
	async (tag) => {
		const result = await analyze(`<${tag}>{m.slot()}</${tag}><p>{m.body()}</p>`);
		expect(result.status).toBe("complete");
		expect(new Set(result.usedBundleIds)).toEqual(new Set(["slot", "body"]));
	},
);

test("analyzes inline scripts, set:html and define:vars expressions", async () => {
	const result = await analyze(`---
import { m } from './messages';
const label = m.script();
---
<title>Home</title>
<article set:html={m.html()} define:vars={{ title: m.vars() }} />
<script>
import { m as messages } from './messages';
const label = messages.inline();
</script>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["script", "html", "vars", "inline"])
	);
});

test("quoted attribute values, CSS and HTML comments are literal", async () => {
	const result = await analyze(`---
import { m } from './messages';
---
<div title="literal {m.never()}" data-x='m.never()'>
	<!-- {m.commented()} -->
	<p>{m.real()}</p>
</div>
<style>p::after { content: "{m.styled()}"; font-family: m; }</style>`);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["real"]);
});

test("tracks strings, template literals, comments and nesting in expressions", async () => {
	const result = await analyze(`---
import { m } from './messages';
---
<p>{m.msg({ text: "a}b" })}</p>
<p>{\`pre \${m.tpl()} post\`}</p>
<p>{
	/* a } comment */
	cond ? { label: m.nested() } : null
}</p>
<p>{m.multi.line({
	count: 1,
 })}</p>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["msg", "tpl", "nested", "multi"])
	);
});

test("analyzes JSX fragments inside template expressions", async () => {
	const result = await analyze(`---
import { m } from './messages';
---
<ul>{items.map((item) => (
	<li title={m.item_title()} key={item.id}>{m.item_label(item.name)}</li>
))}</ul>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["item_title", "item_label"])
	);
});

test("analyzes template-literal attributes without treating quoted or escaped text as usages", async () => {
	const content = [
		"---",
		"import { m } from './messages';",
		"---",
		'<p title=`${m.title({ text: "}" })} \\${m.literal()}`',
		' data-nested=`outer ${`inner ${m.nested()}`}`',
		' data-quoted="${m.quoted()}">{m.body()}</p>',
	].join("\n");
	const result = await analyze(content);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["title", "nested", "body"]),
	);
	expect(result.references).toContainEqual({
		bundleId: "nested",
		path: "src/Page.astro",
		start: { line: 5, column: 31 },
		end: { line: 5, column: 41 },
	});
});

test("normalizes nested Astro markup while preserving message reference locations", async () => {
	const content = [
		"---",
		"import { m } from './messages';",
		"---",
		"<ul>{items.map(item => <li {item}",
		' title=`${m.title()}` data-static=plain>',
		'<!-- } " {m.commented()}',
		"still literal -->",
		"Don't skip {m.body()}",
		"</li>)}</ul>",
		"<p>{m.after()}</p>",
	].join("\n");
	const result = await analyze(content);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["title", "body", "after"]),
	);
	expect(result.references).toEqual(
		expect.arrayContaining([
			{
				bundleId: "title",
				path: "src/Page.astro",
				start: { line: 5, column: 10 },
				end: { line: 5, column: 19 },
			},
			{
				bundleId: "body",
				path: "src/Page.astro",
				start: { line: 8, column: 12 },
				end: { line: 8, column: 20 },
			},
			{
				bundleId: "after",
				path: "src/Page.astro",
				start: { line: 10, column: 4 },
				end: { line: 10, column: 13 },
			},
		]),
	);
});

test.each(["{m}", "{...m}"])(
	"retains namespace escapes in nested Astro attributes: %s",
	async (attribute) => {
		const content = `{items.map(item => <li ${attribute} title={m[key]()} />)}`;
		const result = await analyze(content);
		expect(result.status).toBe("incomplete");
		expect(result.issues).toEqual(
			expect.arrayContaining([
				{
					path: "src/Page.astro",
					reason: "Dynamic message access cannot be resolved.",
					start: { line: 1, column: content.indexOf("m[key]") },
					end: { line: 1, column: content.indexOf("m[key]") + 6 },
				},
			]),
		);
		expect(result.issues).toHaveLength(2);
	},
);

test.each([
	"{count < limit ? m.less() : m.more()}",
	"{(<T,>(value: T) => m.less())(item)}",
	"{(<T extends string>(value: T) => m.less())(item)}",
])("preserves JavaScript comparisons and TypeScript generics: %s", async (content) => {
	const result = await analyze(content);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toContain("less");
});

test.each([
	'<script src="./external.js"></script>',
	"<script src=./external.js></script>",
	'<script src={"./external.js"}></script>',
	'<script src=`./external.js`></script>',
	'<script src="./external.js" />',
	"<script src=./external.js />",
	'<script src={"./external.js"} />',
	'<script src=`./external.js` />',
])("withholds unused fixes for every external script form: %s", async (script) => {
	const result = await analyze(script);
	expect(result.status).toBe("incomplete");
	expect(result.issues).toEqual([
		{
			path: "src/Page.astro",
			reason: "External Astro scripts cannot be analyzed.",
			start: { line: 1, column: 0 },
			end: { line: 1, column: script.indexOf(">") + 1 },
		},
	]);
});

test.each([
	'{true && <script>import * as m from "./messages"; document.title = m.foo();</script>}',
	'{true && <script src="./external.js" />}',
	'{true && <script src={"./external.js"}></script>}',
	'{true && <div><script src=`./external.js` /></div>}',
	'{true && <div>{true && <script src=./external.js />}</div>}',
	'<Component content={true && <script src="./external.js" />} />',
	'<Component content=`${true && <script src="./external.js" />}` />',
])("withholds unused fixes for nested scripts: %s", async (content) => {
	const result = await analyze(content);
	const start = content.indexOf("<script");
	expect(result.status).toBe("incomplete");
	expect(result.issues).toContainEqual({
		path: "src/Page.astro",
		reason: "Nested Astro scripts cannot be analyzed.",
		start: { line: 1, column: start },
		end: { line: 1, column: start + "<script".length },
	});
});

test("does not treat script text in strings or comments as nested scripts", async () => {
	const result = await analyze(`---
import { m } from "./messages";
---
<p>{m.real({ text: "<script>" })}</p>
<p title=\`literal <script>\` />
{true && <div><!-- <script>m.commented()</script> -->{m.nested()}</div>}`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["real", "nested"]));
});

test("analyzes top-level returns in the frontmatter", async () => {
	const result = await analyze(`---
import { m } from './messages';
if (!Astro.props.ok) {
	return Astro.redirect("/404");
}
---
<p>{m.page()}</p>`);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["page"]);
});

test("extracts every inline script and ignores closing tags in attribute strings", async () => {
	const result = await analyze(`---
---
<div title="</style>">first</div>
<style>p { color: red }</style>
<script>
import { m } from './messages';
const a = m.first_script();
</script>
<p>{m.template()}</p>
<script>
import { m } from './messages';
const b = m.second_script();
</script>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["first_script", "second_script", "template"]),
	);
});

test.each([
	`---
import { m } from './messages';
let key;
---
<p>{m[key]()}</p>`,
	`---
import { m } from './messages';
const label = m[\`template_\${key}_label\`]();
---
<p />`,
	`---
import { m } from './messages';
---
<Comp label={m} />`,
	`---
import { m } from './messages';
---
<div {...m} />`,
	`---
import { m } from './messages';
---
<script src="./external.js"></script>`,
	`---
import { m } from './messages';
<p>{m.unterminated(</p>`,
	`---
const label = 'no closing fence';`,
])("unresolved or invalid Astro input withholds fixes: %s", async (code) => {
	expect((await analyze(code)).status).toBe("incomplete");
});

test("locates unresolved constructs in frontmatter and templates", async () => {
	const template = await analyze(`---
import { m } from './messages';
let key;
---
<p>{m[key]()}</p>`);
	expect(template.status).toBe("incomplete");
	expect(template.issues).toEqual([
		{
			path: "src/Page.astro",
			reason: "Dynamic message access cannot be resolved.",
			start: { line: 5, column: 4 },
			end: { line: 5, column: 10 },
		},
	]);
	const external = await analyze(`<script src="./external.js"></script>`);
	expect(external.issues).toEqual([
		{
			path: "src/Page.astro",
			reason: "External Astro scripts cannot be analyzed.",
			start: { line: 1, column: 0 },
			end: { line: 1, column: 28 },
		},
	]);
});

test.each([
	'<img alt={m.photo()} src="photo.png">',
	"<div><br>{m.photo()}</div>",
	"<input placeholder={m.photo()}>",
])("normalizes void HTML elements inside expressions: %s", async (markup) => {
	const content = `{true && ${markup}}<p>{m.after()}</p>`;
	const result = await analyze(content);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(new Set(["photo", "after"]));
	for (const ref of result.references ?? []) {
		expect(content.slice(ref.start.column, ref.end.column)).toBe(
			`m.${ref.bundleId}()`
		);
	}
});

test.each([
	'type="application/ld+json"',
	"type='application/json'",
	"type=application/ld+json",
	'type="importmap"',
	'type="speculationrules"',
])("treats non-executable scripts as literal data: %s", async (attribute) => {
	const result = await analyze(
		`<script ${attribute}>{"value":"{m.literal()}","tag":"</scripture>"}</script><p>{m.real()}</p>`
	);
	expect(result.status).toBe("complete");
	expect(result.usedBundleIds).toEqual(["real"]);
});

test.each(["Script", "SCRIPT", "sCript"])(
	"keeps %s component children as Astro markup",
	async (name) => {
		const result = await analyze(`<${name}><div>{m.real()}</div></${name}>`);
		expect(result.status).toBe("complete");
		expect(result.usedBundleIds).toEqual(["real"]);
	}
);

test.each([
	String.raw`/}/.test(value) ? m.yes() : m.no()`,
	String.raw`/[{}'"/]/.test(value) ? m.yes() : m.no()`,
	String.raw`/\/}/.test(value) ? m.yes() : m.no()`,
	String.raw`total / 2 + (/}/.test(value) ? m.yes() : m.no())`,
	String.raw`(() => { return /}/.test(value) ? m.yes() : m.no(); })()`,
])(
	"delimits regex literals without confusing division: %s",
	async (expression) => {
		const result = await analyze(`<p>{${expression}}</p>`);
		expect(result.status).toBe("complete");
		expect(new Set(result.usedBundleIds)).toEqual(new Set(["yes", "no"]));
	}
);

test("frontmatter regex quotes and comment markers cannot hide the fence", async () => {
	const result = await analyze(String.raw`---
const regex = /['"/*{}]/;
const ratio = total / 2;
const label = m.frontmatter();
---
<p>{m.body()}</p>`);
	expect(result.status).toBe("complete");
	expect(new Set(result.usedBundleIds)).toEqual(
		new Set(["frontmatter", "body"])
	);
});

test.each([
	'type="module"',
	'type="text/javascript"',
	'type="unknown"',
	"type={scriptType}",
])(
	"continues to analyze executable and unknown script types: %s",
	async (attribute) => {
		const result = await analyze(`<script ${attribute}>m.client();</script>`);
		expect(result.status).toBe("complete");
		expect(result.usedBundleIds).toEqual(["client"]);
	}
);


test("dynamic script attributes cannot hide executable code behind a static data type", async () => {
 const result = await analyze('<script {...attributes} type="application/json">m.client();</script>');
 expect(result.status).toBe("incomplete");
 expect(result.usedBundleIds).toEqual(["client"]);
});

test("duplicate script types cannot hide executable code", async () => {
 const result = await analyze('<script TYPE="module" type="application/json">m.client();</script>');
 expect(result.usedBundleIds).toEqual(["client"]);
});
