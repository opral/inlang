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
