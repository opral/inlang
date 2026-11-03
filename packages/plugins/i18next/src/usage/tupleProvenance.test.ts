import { expect, test } from "vitest";
import type { ProjectSettings } from "@inlang/sdk";
import { analyzeUsage } from "./analyzeUsage.js";
import { PLUGIN_KEY } from "../pluginKey.js";

const settings = {
	baseLocale: "en",
	locales: ["en"],
	[PLUGIN_KEY]: { pathPattern: "./locales/{locale}.json" },
} as unknown as ProjectSettings;
const run = (
	content: string,
	extra: { path: string; content: string }[] = []
) =>
	analyzeUsage({
		settings,
		files: [{ path: "src/App.tsx", content }, ...extra],
	});

test.each([
	`function useGetData() { return ["hello", 42]; }`,
	`function useGetData() { return [{ title: "hello" }]; }`,
	`function useGetData() { const value = "hello"; return [value]; }`,
	`function useGetData() { return flag ? ["light"] : ["dark"]; }`,
	`function useGetData() { if (flag) return ["light"]; return ["dark"]; }`,
	`const useGetData = () => [false];`,
	`function inner() { return ["hello"]; } function useGetData() { return inner(); }`,
	`const hooks = { useGetData() { return ["hello"]; } }; const useGetData = hooks.useGetData;`,
])("proves local custom hook data from source: %s", async (source) => {
	const result = await run(
		`${source} const [data] = useGetData(); consume(data);`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test.each([
	`import { useGetData } from "./hooks.js";`,
	`import { useGetData as get } from "./hooks"; const useGetData = get;`,
	`import * as hooks from "./hooks"; const useGetData = hooks.useGetData;`,
])("follows snapshot imports for data hooks: %s", async (source) => {
	const result = await run(
		`${source} const [data] = useGetData(); consume(data);`,
		[
			{
				path: "src/hooks.ts",
				content: `export function useGetData() { return ["hello"]; }`,
			},
		]
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test("known custom translator wrappers retain aliases and over-count namespaces", async () => {
	const result = await run(
		`import { useTranslation } from "react-i18next"; function useCustom() { return useTranslation(); } const [translate] = useCustom(); translate("live");`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: ["live"] });
});

test.each([
	`import { useTheme } from "./i18next/hooks";`,
	`import { useTheme as themeHook } from "./i18next/hooks"; const useTheme = themeHook;`,
	`import * as hooks from "./i18next/hooks"; const useTheme = hooks.useTheme;`,
])(
	"relative i18next paths resolve as source rather than package APIs: %s",
	async (source) => {
		const result = await run(
			`${source} const [theme] = useTheme(); consume(theme);`,
			[
				{
					path: "src/i18next/hooks.ts",
					content: `export function useTheme() { return ["dark"]; }`,
				},
			]
		);
		expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
	}
);

test.each([
	`const [translate] = useOpaque();`,
	`const [translate] = useOpaque?.();`,
	`const result = useOpaque(); const [translate] = result;`,
	`const [\n translate\n]: [any] = useOpaque();`,
	`function useData() { return [undefined]; } const [translate = external] = useData();`,
	`function useData() { return []; } const [translate = external] = useData();`,
	`function useData() { return [{ translate: external }]; } const [{translate}] = useData();`,
	`function useData() { return [[external]]; } const [[translate]] = useData();`,
	`function useData() { const result = ["hello"]; result[0] = external; return result; } const [translate] = useData();`,
	`function useData() { const result = ["hello"]; const alias = result; alias[0] = external; return result; } const [translate] = useData();`,
	`function useData() { const result = ["hello"]; mutate(result); return result; } const [translate] = useData();`,
	`function useData() { return ["hello"]; } let [translate] = useData(); for (translate of values) {}`,
	`function useData() { return ["hello"]; } let [translate] = useData(); ({ fn: translate } = external);`,
	`function* useData() { yield external; return ["hello"]; } const [translate] = useData();`,
	`function useData() { return flag ? [{ translate: "data", other: external }] : [{ translate: external, other: external }]; } const [{translate}] = useData();`,
	`function useData() { if (flag) return [{ translate: "data", other: external }]; return [{ translate: external, other: external }]; } const [{translate}] = useData();`,
])("ambiguous tuple values cannot enable deletion: %s", async (source) => {
	const result = await run(`${source} translate("live");`);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test.each([
	`const [translate] = useState(() => getFixedT("en"));`,
	`const [translate, setTranslate] = useState("hello"); setTranslate(() => getFixedT("en"));`,
	`const result = useState("hello"); const [translate, setTranslate] = result; setTranslate(() => getFixedT("en"));`,
	`const [translate] = useReducer(() => getFixedT("en"), "hello");`,
])("state can hold translators: %s", async (source) => {
	const result = await run(
		`import { useState, useReducer } from "react"; import { getFixedT } from "i18next"; ${source} translate("live");`
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test("exported mutable tuples cannot be treated as immutable data", async () => {
	const result = await run(
		`import { useData, tuple } from "./hooks"; tuple[0] = external; const [translate] = useData(); translate("live");`,
		[
			{
				path: "src/hooks.ts",
				content: `export const tuple = ["hello"]; export function useData() { return tuple; }`,
			},
		]
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test("cyclic hook return graphs fail closed", async () => {
	const result = await run(
		`function first() { return second(); } function second() { return first(); } const [translate] = first(); consume(translate);`
	);
	expect(result.status).toBe("incomplete");
});

test("shared captured aggregates can change between hook calls", async () => {
	const result = await run(
		`const shared = ["hello"]; function useData() { return shared; } const first = useData(); first[0] = external; const [translate] = useData(); translate("live");`
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test("snapshot file ordering does not change hook data classification", async () => {
	const files = [
		{
			path: "src/App.tsx",
			content: `import { useData } from "./hooks"; const [value] = useData(); consume(value);`,
		},
		{
			path: "src/hooks.ts",
			content: `import { useState } from "react"; export function useData() { const [value] = useState("hello"); consume(value); return [value]; }`,
		},
	];
	for (const ordered of [files, [...files].reverse()]) {
		const result = await analyzeUsage({ settings, files: ordered });
		expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
	}
});

test.each([
	`const holder = { source }; holder.source[0] = external;`,
	`const holder = [source]; holder[0][0] = external;`,
	`let holder; holder = source; holder[0] = external;`,
])(
	"aggregates captured by another object can be mutated: %s",
	async (mutation) => {
		const result = await run(
			`function useData() { const source = ["hello"]; ${mutation} return source; } const [translate] = useData(); translate("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test("a fresh returned data object can be consumed without losing its non-callable proof", async () => {
	const result = await run(
		`function useTheme() { const theme = { mode: "dark" }; return [theme]; } const [theme] = useTheme(); consume(theme);`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test("escaped selected aggregates lose property proofs", async () => {
	const result = await run(
		`import {useState} from "react"; const [shared] = useState({translate: "data"}); function useTheme() { return [shared]; } const [first] = useTheme(); first.translate = external; const [{translate}] = useTheme(); translate("live");`
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test.each([
	`import { useState } from "react"; class Reader { constructor(private useState: Hook) { const [translate] = useState(); translate("live"); } }`,
	`import { useState } from "react"; namespace Example { const useState = external; const [translate] = useState(); translate("live"); }`,
])(
	"TypeScript shadow bindings cannot inherit React data evidence: %s",
	async (source) => {
		const result = await run(source);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test.each([
	`useState({ translate: "data" })`,
	`useReducer(() => ({ translate: "data" }), { translate: "data" })`,
])(
	"persistent React aggregates cannot retain property proofs: %s",
	async (initial) => {
		const result = await run(
			`import { useState, useReducer } from "react"; function useData() { const [source] = ${initial}; return [source]; } const [{translate}] = useData(); translate("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test.each([
	`const result = ["data"]; result.unshift(getFixedT("en")); return result;`,
	`const result = ["data"]; result.splice(0, 1, getFixedT("en")); return result;`,
	`const result = ["data", getFixedT("en")]; result.reverse(); return result;`,
	`const result = ["data"]; result["unshift"](getFixedT("en")); return result;`,
	`const result = ["data"]; result.unshift?.(getFixedT("en")); return result;`,
	`const result = ["data"]; const alias = result; alias.unshift(getFixedT("en")); return result;`,
	`const result = { tuple: ["data"] }; result.tuple.unshift(getFixedT("en")); return result.tuple;`,
	`const result = { tuple: ["data"], mutate() { this.tuple.unshift(getFixedT("en")); } }; result.mutate(); return result.tuple;`,
])(
	"aggregate method calls cannot leave stale tuple proofs: %s",
	async (body) => {
		const result = await run(
			`import { getFixedT } from "i18next"; function useHook() { ${body} } const [translate] = useHook(); translate("live");`
		);
		expect(result.status).toBe("incomplete");
	}
);

test("readonly array receiver methods remain conservatively opaque", async () => {
	const result = await run(
		`function useData() { const result = ["data"]; result.slice(); return result; } const [data] = useData(); consume(data);`
	);
	expect(result.status).toBe("incomplete");
});

test.each([
	`const alias = result as any; alias.unshift(getFixedT("en"));`,
	`const alias = result satisfies unknown; alias.splice(0, 1, getFixedT("en"));`,
	`const alias = result!; alias[0] = getFixedT("en");`,
	`const alias = (result as any)<any>; alias[0] = getFixedT("en");`,
	`const alias = ((result as any)!) satisfies unknown; alias.reverse();`,
	`mutate(result as any);`,
	`mutate((result satisfies unknown)!);`,
	`let alias; alias = result as any; alias.unshift(getFixedT("en"));`,
	`const holder = { tuple: result as any }; holder.tuple.unshift(getFixedT("en"));`,
	`const holder = [result!]; holder[0].unshift(getFixedT("en"));`,
	`mutate(...(result as any));`,
	`new Mutator(result as any);`,
	"mutate`${result as any}`;",
	`const alias = flag ? result : result; alias[0] = getFixedT("en");`,
	`const alias = result || []; alias[0] = getFixedT("en");`,
	`const alias = (0, result); alias[0] = getFixedT("en");`,
	`render(<Mutator value={result} />);`,
	`try { throw result; } catch (alias) { alias[0] = getFixedT("en"); }`,
])("wrapped aggregate references cannot hide escapes: %s", async (mutation) => {
	const result = await run(
		`import { getFixedT } from "i18next"; function useHook() { const result = ["data", getFixedT("en")]; ${mutation} return result; } const [translate] = useHook(); translate("live");`
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test.each([
	`result as unknown`,
	`result!`,
	`(result satisfies unknown)!`,
	`flag ? result : result`,
])(
	"wrapped fresh data returns preserve their proof: %s",
	async (expression) => {
		const result = await run(
			`function useData() { const result = ["data"]; return ${expression}; } const [data] = useData(); consume(data);`
		);
		expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
	}
);

test.each([
	`const alias = result.tuple; alias[0] = getFixedT("en");`,
	`const alias = result.tuple as any; alias[0] = getFixedT("en");`,
	`mutate(result.tuple as any);`,
	`mutate((result as any).tuple);`,
	`let alias; alias = (result.tuple as any)!; alias[0] = getFixedT("en");`,
])(
	"selected aggregate aliases cannot retain owner proofs: %s",
	async (mutation) => {
		const result = await run(
			`import { getFixedT } from "i18next"; function useHook() { const result = { tuple: ["data"] }; ${mutation} return result.tuple; } const [translate] = useHook(); translate("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test("angle-bracket assertions cannot hide escapes in TypeScript files", async () => {
	const result = await run(
		`import { useHook } from "./hook"; const [translate] = useHook(); translate("live");`,
		[
			{
				path: "src/hook.ts",
				content: `import { getFixedT } from "i18next"; export function useHook() { const result = ["data"]; const alias = <any>result; alias[0] = getFixedT("en"); return result; }`,
			},
		]
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test("fresh returned member data remains complete", async () => {
	const result = await run(
		`function useData() { const result = { tuple: ["data"] }; return [result.tuple as unknown]; } const [data] = useData(); consume(data);`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test("a React setter method cannot inherit direct-call update evidence", async () => {
	const result = await run(
		`import { useState } from "react"; import { getFixedT } from "i18next"; const [translate, setTranslate] = useState("data"); setTranslate.call(null, () => getFixedT("en")); translate("live");`
	);
	expect(
		result.status === "incomplete" || result.usedBundleIds.includes("live")
	).toBe(true);
});

test.each([
	[`const tuple = ["data"]; export default tuple;`, "tuple"],
	[`export default ["data"];`, "tuple"],
	[`const tuple = ["data"]; export default (tuple as unknown);`, "tuple"],
	[`export default { tuple: ["data"] };`, "tuple.tuple"],
])(
	"default-exported aggregates cannot retain element proofs: %s",
	async (source, selection) => {
		const result = await run(
			`import tuple from "./tuple"; import { mutate } from "./mutator"; mutate(); const [translate] = ${selection}; translate("live");`,
			[
				{ path: "src/tuple.ts", content: source },
				{
					path: "src/mutator.ts",
					content: `import tuple from "./tuple"; import { getFixedT } from "i18next"; export function mutate() { ${selection}[0] = getFixedT("en"); }`,
				},
			]
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test("a default-exported local aggregate is unsafe in its declaring file too", async () => {
	const result = await run(
		`const tuple = ["data"]; export default tuple; const [translate] = tuple; translate("live");`
	);
	expect(result.status).toBe("incomplete");
});

test.each([
	`for (const item of result) { item.nested.fn = getFixedT("en"); }`,
	`for (const item of result as any) { item.nested.fn = getFixedT("en"); }`,
	`for (const { nested } of result) { nested.fn = getFixedT("en"); }`,
	`const holder = new (class { value = result })(); holder.value[0].nested.fn = getFixedT("en");`,
	`const holder = new (class { #value = result; mutate() { this.#value[0].nested.fn = getFixedT("en"); } })(); holder.mutate();`,
	`const Holder = class { static value = result }; Holder.value[0].nested.fn = getFixedT("en");`,
])(
	"loop and class-field aliases invalidate nested proofs: %s",
	async (mutation) => {
		const result = await run(
			`import { getFixedT } from "i18next"; function useHook() { const result = [{ nested: { fn: "data" } }]; ${mutation} return result; } const [{ nested: { fn: translate } }] = useHook(); translate("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test("JSX spread attributes can expose nested tuple elements", async () => {
	const result = await run(
		`function useHook() { const result = { tuple: ["data"] }; const element = <Mutator {...result} />; return [result.tuple, element]; } const [[translate]] = useHook(); translate("live");`
	);
	expect(result.status).toBe("incomplete");
});

test("default-exported hook functions still resolve from source", async () => {
	const result = await run(
		`import useData from "./hook"; const [data] = useData(); consume(data);`,
		[
			{
				path: "src/hook.ts",
				content: `export default function useData() { return ["data"]; }`,
			},
		]
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test.each([
	`function useHook() { return useState(null); }`,
	`const useHook = () => useState(null);`,
	`function useHook() { const tuple = useState(null); return tuple; }`,
	`function useHook() { const [value, setter] = useState(null); return [value, setter]; }`,
	`function inner() { return useState(null); } function useHook() { return inner(); }`,
])(
	"exposed React setters invalidate wrapper state proofs: %s",
	async (source) => {
		const result = await run(
			`import { useState } from "react"; import { getFixedT } from "i18next"; ${source} const [value, setValue] = useHook(); setValue(() => getFixedT("en")); value("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test.each([
	`const /* hook result */ [translate] = useOpaque();`,
	`let // hook result\n[translate] = useOpaque();`,
	`var /* first */ /* second */ [translate] = useOpaque();`,
	`const other = 1, [translate] = useOpaque();`,
])(
	"tuple prefilter tolerates comments and multiple declarations: %s",
	async (source) => {
		const result = await run(`${source} translate("live");`);
		expect(result.status).toBe("incomplete");
	}
);

test("a wrapper returning only locally destructured state data remains complete", async () => {
	const result = await run(
		`import { useState } from "react"; function useHook() { const [value] = useState("data"); return [value]; } const [value] = useHook(); consume(value);`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});

test.each([
	`const [value, ...setters] = useState(null); setters[0](() => getFixedT("en"));`,
	`const [value, setter = fallback] = useState(null); setter(() => getFixedT("en"));`,
	`var [value, setter] = useState(null); var setter; const update = setter; update(() => getFixedT("en"));`,
])(
	"indirect setter captures cannot preserve state proof: %s",
	async (source) => {
		const result = await run(
			`import { useState } from "react"; import { getFixedT } from "i18next"; ${source} value("live");`
		);
		expect(
			result.status === "incomplete" || result.usedBundleIds.includes("live")
		).toBe(true);
	}
);

test("source-visible receiver-free namespace methods preserve data proof", async () => {
	const result = await run(
		`const hooks = { useData() { return ["data"]; } }; const [data] = hooks.useData(); consume(data);`
	);
	expect(result).toMatchObject({ status: "complete", usedBundleIds: [] });
});
