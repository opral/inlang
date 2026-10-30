import { parse } from "@babel/parser";
import type {
	AnalyzeUsage,
	UsageAnalysis,
	UsageIssue,
	UsageReference,
} from "@inlang/sdk";
import { PLUGIN_KEY } from "../pluginKey.js";
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";
import { extractMdx, type Segment } from "./mdx.js";

/**
 * Which messages a next-intl (or use-intl) app uses.
 *
 * A message `Home.title` is used by `useTranslations("Home")` or
 * `getTranslations("Home")` followed by `t("title")`, `t.rich("title")` or
 * `t.markup("title")`, or by `t("Home.title")` on a translator without a
 * namespace. Bundle IDs are the nested JSON keys joined with dots, as the
 * plugin imports them, so usages match bundle IDs exactly.
 *
 * Anything that can't be resolved makes the analysis incomplete, with the
 * construct's location: then no message is reported unused, and none is
 * deleted. That is the case when a translator, a message catalog or a
 * next-intl function escapes analysis (passed to a function or component,
 * returned, exported, stored), when a key or namespace is dynamic, when code
 * reads the catalog (`useMessages()`, an imported message file), and for
 * `t.raw()` and `t.has()`, which can read a whole namespace.
 *
 * The analysis is per file and flow-insensitive: a variable that is a
 * translator anywhere is one everywhere, which can only count more usages.
 */
export const analyzeUsage: AnalyzeUsage = ({ files, settings }) => {
	if (
		files.length > 10_000 ||
		files.reduce((size, file) => size + file.content.length, 0) > 50_000_000
	)
		return {
			usedBundleIds: [],
			status: "incomplete",
			issues: [
				{
					reason:
						"Source snapshot exceeds the 10,000-file or 50-million-character analysis limit.",
				},
			],
		};
	const used = new Set<string>();
	const issues: UsageIssue[] = [];
	const references: UsageReference[] = [];
	// `t.raw(key)` and `t.has(key)` read a whole namespace if `key` is one. A key that is also
	// translated with `t(key)` is a message, so the issue is only kept for the others.
	const subtreeReads: { bundleId: string; issue: UsageIssue }[] = [];
	const leaves = new Set<string>();
	const catalog = catalogFiles(settings as Record<string, unknown>);
	for (const file of files) {
		if (!SUPPORTED.test(file.path)) {
			issues.push({
				path: file.path,
				reason:
					"Unsupported source format. Supply JavaScript, TypeScript or MDX files.",
			});
			continue;
		}
		if (file.content.length > 2_000_000) {
			issues.push({
				path: file.path,
				reason: "Source exceeds the 2-million-character analysis limit.",
			});
			continue;
		}
		let program: Node;
		let segments: Segment[] | undefined;
		try {
			if (/\.mdx$/i.test(file.path)) {
				// micromark's offsets don't count a byte order mark
				const bom = file.content.startsWith("\uFEFF") ? 1 : 0;
				const extracted = extractMdx(file.content.slice(bom));
				segments = extracted.segments.map((segment) => ({
					...segment,
					original: segment.original + bom,
				}));
				program = (
					parse(extracted.code, {
						sourceType: "module",
						plugins: ["jsx"],
					}) as unknown as { program: Node }
				).program;
			} else program = parseScript(file.path, file.content);
		} catch (error) {
			// Babel: `pos` in the parsed code; micromark: `place.offset` in the MDX file
			const failure = error as {
				message?: string;
				pos?: unknown;
				place?: { offset?: unknown };
			};
			const bom = file.content.startsWith("\uFEFF") ? 1 : 0;
			const offset =
				typeof failure.place?.offset === "number"
					? failure.place.offset + bom
					: typeof failure.pos === "number"
						? toOriginal(segments, failure.pos, false)
						: undefined;
			const at =
				offset === undefined ? undefined : positions(file.content)(offset);
			issues.push({
				path: file.path,
				reason: `Cannot parse source: ${(error instanceof Error ? error.message : String(error)).replace(/ \(\d+:\d+\)$/, "")}`,
				...(at ? { start: at, end: at } : {}),
			});
			continue;
		}
		const result = analyzeFile({
			path: file.path,
			content: file.content,
			program,
			segments,
			catalog,
		});
		for (const id of result.used) used.add(id);
		for (const id of result.leaves) leaves.add(id);
		references.push(...result.references);
		subtreeReads.push(...result.subtreeReads);
		issues.push(...result.issues);
	}
	for (const read of subtreeReads)
		if (!leaves.has(read.bundleId)) issues.push(read.issue);
	return {
		usedBundleIds: [...used],
		status: issues.length ? "incomplete" : "complete",
		issues,
		references,
	} satisfies UsageAnalysis;
};

const SUPPORTED = /\.(?:[cm]?[jt]sx?|mdx)$/i;

type Node = {
	type: string;
	start?: number | null;
	end?: number | null;
	[key: string]: unknown;
};
const isNode = (value: unknown): value is Node =>
	value !== null &&
	typeof value === "object" &&
	typeof (value as { type?: unknown }).type === "string";
const identifierName = (value: unknown): string | undefined =>
	isNode(value) && value.type === "Identifier"
		? (value.name as string)
		: undefined;
const IGNORED_KEYS = new Set([
	"loc",
	"extra",
	"comments",
	"leadingComments",
	"trailingComments",
	"innerComments",
	"tokens",
]);
function children(node: Node): { child: Node; key: string }[] {
	const result: { child: Node; key: string }[] = [];
	for (const key in node) {
		if (IGNORED_KEYS.has(key)) continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) if (isNode(child)) result.push({ child, key });
		} else if (isNode(value)) result.push({ child: value, key });
	}
	return result;
}

type ParserPlugins = NonNullable<
	NonNullable<Parameters<typeof parse>[1]>["plugins"]
>;
/** JS/TS like the m-function matcher: JSX only where it is valid (`<string>x` is a TS cast). */
function parseScript(path: string, content: string): Node {
	const typescript = /\.(?:tsx?|mts|cts)$/i.test(path);
	const jsx = !/\.(?:ts|mts|cts)$/i.test(path);
	const script = /\.cjs$/i.test(path);
	const base: ParserPlugins = [
		// `import en from "./en.json" assert { type: "json" }` of older TypeScript and Node
		["importAttributes", { deprecatedAssertSyntax: true }],
		...(typescript ? (["typescript"] as const) : []),
		...(jsx ? (["jsx"] as const) : []),
	];
	let failure: unknown;
	const variants: ParserPlugins[] = [
		[...base, "decorators-legacy"],
		[
			...base,
			["decorators", { decoratorsBeforeExport: true }],
			"decoratorAutoAccessors",
		],
	];
	for (const plugins of variants) {
		try {
			return (
				parse(content, {
					sourceType: script ? "script" : "module",
					allowReturnOutsideFunction: script,
					plugins,
				}) as unknown as { program: Node }
			).program;
		} catch (error) {
			failure ??= error;
		}
	}
	throw failure;
}

/**
 * How to recognize the message files: the tails of their paths per locale
 * (`en.json` for `./messages/{locale}.json` and for
 * `./messages/{language}.json` if the locale is `en`, `en/home.json` for
 * `./messages/{locale}/home.json`) with the namespace a file of a namespaced
 * `pathPattern` holds, what follows the locale in a pattern (`/home.json`)
 * for paths built at runtime, and the directories that hold them
 * (`messages`). `undefined` without the plugin's settings: then any JSON
 * file can be a message file.
 */
type CatalogFiles = {
	files: { tail: string; namespace?: string }[];
	suffixes: { suffix: string; namespace?: string }[];
	directories: string[];
};
function catalogFiles(
	settings: Record<string, unknown>
): CatalogFiles | undefined {
	const plugin = settings[PLUGIN_KEY] as
		| { pathPattern?: unknown; sourceLanguageFilePath?: unknown }
		| undefined;
	const patterns: { pattern: string; namespace?: string }[] = [];
	const pathPattern = plugin?.pathPattern;
	if (typeof pathPattern === "string") patterns.push({ pattern: pathPattern });
	else if (pathPattern && typeof pathPattern === "object")
		for (const [namespace, pattern] of Object.entries(pathPattern))
			if (typeof pattern === "string") patterns.push({ pattern, namespace });
	if (patterns.length === 0) return undefined;
	const locales = [
		settings.baseLocale,
		...(Array.isArray(settings.locales) ? settings.locales : []),
	].filter((locale): locale is string => typeof locale === "string");
	const result: CatalogFiles = { files: [], suffixes: [], directories: [] };
	const placeholder = /\{(?:locale|languageTag|language)\}/;
	for (const { pattern, namespace } of patterns) {
		const segments = pattern
			.split("/")
			.filter((segment) => segment && segment !== "." && segment !== "..");
		const first = segments.findIndex((segment) => placeholder.test(segment));
		if (first === -1) return undefined;
		for (const locale of locales)
			result.files.push({
				tail: segments
					.slice(first)
					.join("/")
					.replace(
						new RegExp(placeholder.source, "g"),
						(match) =>
							match === "{language}"
								? getPrimaryLanguageSubtag(locale)
								: locale
					)
					.toLowerCase(),
				namespace,
			});
		const last = pattern.split(new RegExp(placeholder)).pop()!;
		result.suffixes.push({ suffix: last.toLowerCase(), namespace });
		for (const directory of segments.slice(0, first))
			if (!placeholder.test(directory))
				result.directories.push(directory.toLowerCase());
	}
	const source = plugin?.sourceLanguageFilePath;
	if (typeof source === "string") {
		const name = source.split("/").pop();
		if (name) result.files.push({ tail: name.toLowerCase() });
	}
	return result;
}

/** next-intl and use-intl, whose functions access messages. */
const INTL_MODULE = /^(?:next-intl|use-intl)(?:\/|$)/;
/** Modules of next-intl without message access: their default export isn't the API. */
const INTL_TOOLING =
	/^next-intl\/(?:plugin|middleware|navigation|routing|extractor)(?:\/|$)/;
/** Functions that return a translator, synchronously or as a promise. */
const TRANSLATOR_FACTORIES: Record<
	string,
	{ async: boolean; namespace: "first" | "object" | "second" | "none" }
> = {
	useTranslations: { async: false, namespace: "first" },
	getTranslations: { async: true, namespace: "first" },
	// next-intl 2: getTranslator(locale, namespace)
	getTranslator: { async: true, namespace: "second" },
	createTranslator: { async: false, namespace: "object" },
};
/** Functions that return every message. */
const CATALOG_FACTORIES: Record<string, { async: boolean }> = {
	useMessages: { async: false },
	getMessages: { async: true },
};
/** Translators whose keys are hashes of the source text: can't be mapped to bundle IDs. */
const EXTRACTED = new Set(["useExtracted", "getExtracted", "_useExtracted"]);
/** Types whose values are message keys. */
const KEY_TYPES = new Set(["MessageKeys", "NamespaceKeys", "NestedKeyOf"]);
const PROVIDERS = new Set(["NextIntlClientProvider", "IntlProvider"]);
/** The next-intl functions that read messages. */
const MESSAGE_API = new Set([
	...Object.keys(TRANSLATOR_FACTORIES),
	...Object.keys(CATALOG_FACTORIES),
	...EXTRACTED,
]);
const API = new Set([
	...Object.keys(TRANSLATOR_FACTORIES),
	...Object.keys(CATALOG_FACTORIES),
	...EXTRACTED,
	...KEY_TYPES,
	...PROVIDERS,
	"getRequestConfig",
]);
/** Translator methods that take a message key. */
const METHODS = new Set(["rich", "markup", "raw", "has"]);
/** Array methods that pass each element to the callback and can't add elements. */
const ITERATING = new Set([
	"map",
	"forEach",
	"flatMap",
	"filter",
	"some",
	"every",
	"find",
	"findIndex",
	"findLast",
	"findLastIndex",
]);
const READING = new Set([
	...ITERATING,
	"length",
	"includes",
	"indexOf",
	"lastIndexOf",
	"at",
	"join",
	"slice",
	"toSorted",
	"toReversed",
]);
/** React hooks whose dependency array only compares the translator. */
const DEPENDENCY_HOOKS: Record<string, number> = {
	useMemo: 1,
	useCallback: 1,
	useEffect: 1,
	useLayoutEffect: 1,
	useInsertionEffect: 1,
	useImperativeHandle: 2,
};
/** `import.meta` properties that can't load modules (like the m-function matcher). */
const IMPORT_META = new Set([
	"env",
	"url",
	"dirname",
	"filename",
	"hot",
	"resolve",
]);
/** TypeScript nodes that are (or contain) runtime code. Other `TS*` nodes are types. */
const RUNTIME_TS = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSTypeAssertion",
	"TSInstantiationExpression",
	"TSExportAssignment",
	"TSModuleDeclaration",
	"TSModuleBlock",
	"TSEnumDeclaration",
	"TSEnumBody",
	"TSEnumMember",
	"TSParameterProperty",
	"TSImportEqualsDeclaration",
	"TSExternalModuleReference",
]);
const WRAPPERS = new Set([
	"ParenthesizedExpression",
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSTypeAssertion",
	"TSInstantiationExpression",
]);
const FUNCTIONS = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
	"ObjectMethod",
	"ClassMethod",
	"ClassPrivateMethod",
	"TSDeclareFunction",
	"TSDeclareMethod",
]);
const isMember = (node: Node | undefined): node is Node =>
	!!node &&
	(node.type === "MemberExpression" ||
		node.type === "OptionalMemberExpression");
const isCall = (node: Node | undefined): node is Node =>
	!!node &&
	(node.type === "CallExpression" || node.type === "OptionalCallExpression");
/** The name of `a.b`, `a["b"]` and ``a[`b`]``, else undefined. */
function propertyName(node: Node): string | undefined {
	const property = node.property ?? node.key;
	if (!node.computed) {
		if (isNode(property) && property.type === "Identifier")
			return property.name as string;
		if (isNode(property) && property.type === "StringLiteral")
			return property.value as string;
		if (isNode(property) && property.type === "NumericLiteral")
			return String(property.value);
		return undefined;
	}
	if (!isNode(property)) return undefined;
	if (property.type === "StringLiteral") return property.value as string;
	if (property.type === "NumericLiteral") return String(property.value);
	if (
		property.type === "TemplateLiteral" &&
		(property.expressions as unknown[]).length === 0
	)
		return (
			(property.quasis as Node[])[0]?.value as { cooked?: string } | undefined
		)?.cooked;
	return undefined;
}
const unwrap = (node: Node): Node =>
	WRAPPERS.has(node.type) && isNode(node.expression)
		? unwrap(node.expression)
		: node;

/*
 * Abstract values, as strings so that sets compare them:
 * - `t:<namespace>` a translator (`t:` without a namespace), `t?` one with an unknown namespace
 * - `m:<method>:<translator>` a translator method such as `t.rich`
 * - `p:<value>` a promise of a value
 * - `api:<name>` a next-intl function, component or type
 * - `mod` the next-intl module object, `cat` a message catalog, `catmod` a message file module
 * - `merge` a deep merge function: merging catalogs gives a catalog
 */
type Values = Set<string>;
type Primitive = string | number;
const EMPTY: Values = new Set();
const translator = (namespace: string | null) =>
	namespace === null ? "t:" : `t:${namespace}`;
const namespaceOf = (value: string): string | undefined =>
	value.startsWith("t:") ? value.slice(2) : undefined;

type Binding = {
	name: string;
	kind: string;
	/** Expressions assigned to it, destructured along `path` (`undefined`: a computed key). */
	writes: { value?: Node; path: (string | undefined)[]; forOf?: Node }[];
	/** Assigned after its declaration. */
	reassigned: boolean;
	preset: Values;
	references: { node: Node; parent: Node; key: string }[];
	/** The function whose parameter it is, and the position. */
	parameterOf?: { fn: Node; index: number };
	/** Where it is exported. */
	exported?: Node;
	/** The module it is imported from. */
	importedFrom?: string;
};
type Scope = {
	parent?: Scope;
	isFunction: boolean;
	bindings: Map<string, Binding>;
};

function analyzeFile(args: {
	path: string;
	content: string;
	program: Node;
	segments: Segment[] | undefined;
	catalog: CatalogFiles | undefined;
}) {
	const { path, content, program, segments, catalog } = args;
	const used = new Set<string>();
	const leaves = new Set<string>();
	const references: UsageReference[] = [];
	const subtreeReads: { bundleId: string; issue: UsageIssue }[] = [];
	const unresolved = new Map<string, UsageIssue>();

	const position = positions(content);
	const original = (offset: number, end: boolean) =>
		toOriginal(segments, offset, end);
	const located = (node: Node) =>
		typeof node.start === "number" && typeof node.end === "number"
			? {
					start: position(original(node.start, false)),
					end: position(original(node.end, true)),
				}
			: undefined;
	const unresolve = (reason: string, at: Node) => {
		const location = located(at);
		const id = `${at.start}:${at.end}:${reason}`;
		if (!unresolved.has(id))
			unresolved.set(id, { path, reason, ...(location ?? {}) });
	};
	const refer = (bundleId: string, at: Node) => {
		const location = located(at);
		if (location) references.push({ bundleId, path, ...location });
	};
	/**
	 * The catalog a module path loads: `cat` all messages, `cat:Home` the file of
	 * namespace `Home`, `cat?` messages of unknown place; `undefined` for no
	 * message file. Relative paths are also resolved against this file.
	 */
	const catalogValue = (
		specifier: string,
		module = true
	): string | undefined => {
		const file = specifier.replace(/[?#].*$/, "").toLowerCase();
		if (catalog === undefined)
			return file.endsWith(".json") ? "cat" : undefined;
		const candidates = [file];
		if (/^\.\.?\//.test(file)) {
			const resolved: string[] = [];
			for (const segment of [
				...path.toLowerCase().split("/").slice(0, -1),
				...file.split("/"),
			])
				if (segment === "..") resolved.pop();
				else if (segment !== ".") resolved.push(segment);
			candidates.push(resolved.join("/"));
		}
		// webpack and TypeScript resolve `../messages/en` to `en.json`
		if (!file.endsWith(".json")) {
			if (!module) return undefined;
			if (file.includes("/"))
				candidates.push(...candidates.map((candidate) => `${candidate}.json`));
			else candidates.length = 0;
		}
		const namespaces = new Set<string | undefined>();
		for (const { tail, namespace } of catalog.files)
			if (
				candidates.some(
					(candidate) => candidate === tail || candidate.endsWith(`/${tail}`)
				)
			)
				namespaces.add(namespace);
		if (namespaces.size === 1) {
			const [namespace] = namespaces;
			return namespace === undefined ? "cat" : `cat:${namespace}`;
		}
		if (namespaces.size > 1) return "cat?";
		if (!module) return undefined;
		// the directory of the message files, e.g. an alias `@messages`
		const last = file
			.replace(/\/+$/, "")
			.split("/")
			.pop()!
			.replace(/^[@~#]+/, "");
		return catalog.directories.includes(last.replace(/\.json$/, ""))
			? "cat?"
			: undefined;
	};
	const isCatalogPath = (specifier: string, module = true) =>
		catalogValue(specifier, module) !== undefined;
	/** The catalog a path built at runtime can load, e.g. `../messages/${locale}.json`. */
	const dynamicCatalog = (last: string): string => {
		if (catalog === undefined) return "cat";
		const file = last.replace(/[?#].*$/, "").toLowerCase();
		const namespaces = new Set(
			catalog.suffixes
				.filter(({ suffix }) => file.endsWith(suffix))
				.map(({ namespace }) => namespace)
		);
		if (namespaces.size !== 1) return "cat?";
		const [namespace] = namespaces;
		return namespace === undefined ? "cat" : `cat:${namespace}`;
	};
	const asModule = (value: string) => value.replace(/^cat/, "catmod");

	const wrapperReason =
		"A next-intl function from another module (a wrapper or a workspace package) can't be resolved; its usages are unknown.";

	// ---- 1. Scopes, bindings and references ----
	const parents = new Map<Node, { parent: Node; key: string }>();
	const scopeOf = new Map<Node, Scope>();
	const valueNodes: Node[] = [];
	const pendingReferences: {
		node: Node;
		scope: Scope;
		parent: Node;
		key: string;
	}[] = [];
	const pendingWrites: {
		node: Node;
		scope: Scope;
		write: Binding["writes"][number] | undefined;
	}[] = [];
	const typeNodes: { node: Node; scope: Scope }[] = [];
	const typeDeclarations: { node: Node; scope: Scope }[] = [];
	/** Names exported with `export { … }`, also types. */
	const exportedNames = new Set<string>();
	const jsxNames: { node: Node; scope: Scope }[] = [];
	const exportedDeclarations: Node[] = [];
	/** Destructured properties, to find next-intl functions taken from other objects. */
	const apiPatterns: {
		property: Node;
		write: Binding["writes"][number] | undefined;
	}[] = [];
	const bindingOf = new Map<Node, Binding>();

	const newScope = (parent: Scope | undefined, isFunction: boolean): Scope => ({
		parent,
		isFunction,
		bindings: new Map(),
	});
	const functionScope = (scope: Scope): Scope => {
		let current = scope;
		while (!current.isFunction && current.parent) current = current.parent;
		return current;
	};
	const declare = (
		identifier: Node,
		scope: Scope,
		kind: string,
		write?: Binding["writes"][number],
		parameterOf?: Binding["parameterOf"]
	): Binding => {
		const name = identifier.name as string;
		const target = kind === "var" ? functionScope(scope) : scope;
		// `catch (t) { var t = x }` assigns the catch parameter `t`
		if (kind === "var" && write)
			for (
				let current: Scope | undefined = scope;
				current && current !== target;
				current = current.parent
			) {
				const parameter = current.bindings.get(name);
				if (parameter?.kind === "catch") {
					parameter.writes.push(write);
					parameter.reassigned = true;
				}
			}
		let binding = target.bindings.get(name);
		if (!binding) {
			binding = {
				name,
				kind,
				writes: [],
				reassigned: false,
				preset: new Set(),
				references: [],
				...(parameterOf ? { parameterOf } : {}),
			};
			target.bindings.set(name, binding);
		} else {
			// a redeclaration (`var`, function overloads): any of them can hold the value
			binding.reassigned = true;
		}
		if (write) binding.writes.push(write);
		bindingOf.set(identifier, binding);
		return binding;
	};
	const lookup = (scope: Scope, name: string): Binding | undefined => {
		for (
			let current: Scope | undefined = scope;
			current;
			current = current.parent
		) {
			const binding = current.bindings.get(name);
			if (binding) return binding;
		}
		return undefined;
	};

	/** Declares the identifiers of a binding pattern; walks its defaults and computed keys. */
	const declarePattern = (
		pattern: Node,
		parent: Node,
		key: string,
		scope: Scope,
		kind: string,
		write: Binding["writes"][number] | undefined,
		parameterOf?: Binding["parameterOf"]
	) => {
		parents.set(pattern, { parent, key });
		scopeOf.set(pattern, scope);
		const path = write?.path ?? [];
		const nested = (part: string | undefined) =>
			write ? { ...write, path: [...path, part] } : undefined;
		switch (pattern.type) {
			case "Identifier":
				declare(pattern, scope, kind, write, parameterOf);
				if (isNode(pattern.typeAnnotation))
					walk(pattern.typeAnnotation, pattern, "typeAnnotation", scope, true);
				return;
			case "ObjectPattern":
				for (const property of pattern.properties as Node[]) {
					parents.set(property, { parent: pattern, key: "properties" });
					scopeOf.set(property, scope);
					if (property.type === "RestElement")
						declarePattern(
							property.argument as Node,
							property,
							"argument",
							scope,
							kind,
							nested(undefined)
						);
					else {
						apiPatterns.push({ property, write });
						if (property.computed)
							walk(property.key as Node, property, "key", scope, false);
						declarePattern(
							property.value as Node,
							property,
							"value",
							scope,
							kind,
							nested(propertyName(property))
						);
					}
				}
				break;
			case "ArrayPattern":
				for (const element of pattern.elements as (Node | null)[])
					if (element)
						declarePattern(
							element.type === "RestElement"
								? (element.argument as Node)
								: element,
							pattern,
							"elements",
							scope,
							kind,
							nested(undefined)
						);
				break;
			case "RestElement":
				declarePattern(
					pattern.argument as Node,
					pattern,
					"argument",
					scope,
					kind,
					nested(undefined)
				);
				break;
			case "AssignmentPattern":
				declarePattern(
					pattern.left as Node,
					pattern,
					"left",
					scope,
					kind,
					write,
					parameterOf
				);
				// the default flows into the binding too
				declarePattern(pattern.left as Node, pattern, "left", scope, kind, {
					value: pattern.right as Node,
					path: [],
				});
				walk(pattern.right as Node, pattern, "right", scope, false);
				break;
			case "TSParameterProperty":
				declarePattern(
					pattern.parameter as Node,
					pattern,
					"parameter",
					scope,
					kind,
					write,
					parameterOf
				);
				break;
			default:
				// e.g. a member expression in a for-of head of an assignment
				walk(pattern, parent, key, scope, false);
		}
		if (isNode(pattern.typeAnnotation))
			walk(pattern.typeAnnotation, pattern, "typeAnnotation", scope, true);
	};

	/** Records the identifiers an assignment pattern writes; walks the rest as expressions. */
	const assignPattern = (
		pattern: Node,
		parent: Node,
		key: string,
		scope: Scope,
		write: Binding["writes"][number] | undefined
	) => {
		parents.set(pattern, { parent, key });
		scopeOf.set(pattern, scope);
		const path = write?.path ?? [];
		const nested = (part: string | undefined) =>
			write ? { ...write, path: [...path, part] } : undefined;
		switch (pattern.type) {
			case "Identifier":
				pendingWrites.push({ node: pattern, scope, write });
				return;
			case "ObjectPattern":
				for (const property of pattern.properties as Node[]) {
					parents.set(property, { parent: pattern, key: "properties" });
					scopeOf.set(property, scope);
					if (property.type === "RestElement")
						assignPattern(
							property.argument as Node,
							property,
							"argument",
							scope,
							nested(undefined)
						);
					else {
						apiPatterns.push({ property, write });
						if (property.computed)
							walk(property.key as Node, property, "key", scope, false);
						assignPattern(
							property.value as Node,
							property,
							"value",
							scope,
							nested(propertyName(property))
						);
					}
				}
				return;
			case "ArrayPattern":
				for (const element of pattern.elements as (Node | null)[])
					if (element)
						assignPattern(
							element.type === "RestElement"
								? (element.argument as Node)
								: element,
							pattern,
							"elements",
							scope,
							nested(undefined)
						);
				return;
			case "RestElement":
				assignPattern(
					pattern.argument as Node,
					pattern,
					"argument",
					scope,
					nested(undefined)
				);
				return;
			case "AssignmentPattern":
				assignPattern(pattern.left as Node, pattern, "left", scope, write);
				assignPattern(pattern.left as Node, pattern, "left", scope, {
					value: pattern.right as Node,
					path: [],
				});
				walk(pattern.right as Node, pattern, "right", scope, false);
				return;
			default:
				// `obj.prop = value`, `(t as any) = value`
				walk(pattern, parent, key, scope, false);
		}
	};

	const declareFunction = (fn: Node, scope: Scope) => {
		const inner = newScope(scope, true);
		scopeOf.set(fn, inner);
		if (fn.type === "FunctionExpression" && isNode(fn.id))
			declare(fn.id, inner, "function");
		(fn.params as Node[]).forEach((parameter, index) =>
			declarePattern(parameter, fn, "params", inner, "param", undefined, {
				fn,
				index,
			})
		);
		for (const key of ["typeParameters", "returnType", "predicate"])
			if (isNode(fn[key])) walk(fn[key] as Node, fn, key, inner, true);
		for (const decorator of (fn.decorators as Node[] | undefined) ?? [])
			walk(decorator, fn, "decorators", scope, false);
		if (fn.computed && isNode(fn.key)) walk(fn.key, fn, "key", scope, false);
		const body = fn.body;
		if (!isNode(body)) return;
		parents.set(body, { parent: fn, key: "body" });
		scopeOf.set(body, inner);
		if (body.type === "BlockStatement") {
			valueNodes.push(body);
			for (const statement of body.body as Node[])
				walk(statement, body, "body", inner, false);
		} else walk(body, fn, "body", inner, false);
	};

	const walk = (
		node: Node,
		parent: Node | undefined,
		key: string | undefined,
		scope: Scope,
		typeMode: boolean
	): void => {
		if (parent && key) parents.set(node, { parent, key });
		scopeOf.set(node, scope);
		if (
			!typeMode &&
			(FUNCTIONS.has(node.type)
				? node.type === "TSDeclareFunction" ||
					node.type === "TSDeclareMethod" ||
					node.declare === true
				: (node.type.startsWith("TS") && !RUNTIME_TS.has(node.type)) ||
					(node.type === "VariableDeclaration" && node.declare === true) ||
					(node.type === "ClassDeclaration" && node.declare === true) ||
					node.type === "InterfaceDeclaration")
		)
			typeMode = true;
		if (typeMode) {
			if (
				node.type === "TSTypeQuery" ||
				node.type === "TSTypeReference" ||
				node.type === "TSImportType"
			)
				typeNodes.push({ node, scope });
			if (
				node.type === "TSTypeAliasDeclaration" ||
				node.type === "TSInterfaceDeclaration"
			)
				typeDeclarations.push({ node, scope });
			// identifiers of `typeof a.b` and type names are resolved by the type checks
			for (const { child, key: childKey } of children(node))
				walk(child, node, childKey, scope, true);
			return;
		}
		valueNodes.push(node);
		switch (node.type) {
			case "Program": {
				for (const statement of node.body as Node[])
					walk(statement, node, "body", scope, false);
				return;
			}
			case "ImportDeclaration": {
				const source = (node.source as Node).value as string;
				parents.set(node.source as Node, { parent: node, key: "source" });
				for (const specifier of node.specifiers as Node[]) {
					parents.set(specifier, { parent: node, key: "specifiers" });
					const local = specifier.local as Node;
					parents.set(local, { parent: specifier, key: "local" });
					const binding = declare(local, scope, "import");
					binding.importedFrom = source;
					if (
						!INTL_MODULE.test(source) &&
						specifier.type === "ImportSpecifier" &&
						MESSAGE_API.has(
							identifierName(specifier.imported) ??
								((specifier.imported as Node).value as string)
						)
					)
						unresolve(wrapperReason, specifier);
					const imported =
						specifier.type === "ImportSpecifier"
							? (identifierName(specifier.imported) ??
								((specifier.imported as Node).value as string))
							: undefined;
					for (const value of importValues(
						source,
						specifier.type,
						imported,
						specifier
					))
						binding.preset.add(value);
				}
				return;
			}
			case "ExportNamedDeclaration":
			case "ExportAllDeclaration": {
				const source = isNode(node.source)
					? (node.source.value as string)
					: undefined;
				if (source !== undefined) {
					if (node.type === "ExportAllDeclaration")
						checkReexport(source, undefined, node);
					else
						for (const specifier of node.specifiers as Node[])
							checkReexport(
								source,
								specifier.type === "ExportSpecifier"
									? (identifierName(specifier.local) ??
											((specifier.local as Node).value as string))
									: undefined,
								specifier
							);
					return;
				}
				if (isNode(node.declaration)) {
					exportedDeclarations.push(node.declaration);
					walk(node.declaration, node, "declaration", scope, false);
				}
				for (const specifier of (node.specifiers as Node[]) ?? []) {
					parents.set(specifier, { parent: node, key: "specifiers" });
					scopeOf.set(specifier, scope);
					const local = specifier.local;
					if (identifierName(local)) exportedNames.add(identifierName(local)!);
					if (isNode(local) && local.type === "Identifier")
						walk(local, specifier, "local", scope, false);
				}
				return;
			}
			case "VariableDeclaration": {
				const kind = node.kind as string;
				for (const declarator of node.declarations as Node[]) {
					parents.set(declarator, { parent: node, key: "declarations" });
					scopeOf.set(declarator, scope);
					valueNodes.push(declarator);
					const forOf = forOfHead(node);
					declarePattern(
						declarator.id as Node,
						declarator,
						"id",
						scope,
						kind === "var" ? "var" : kind,
						forOf
							? { forOf, path: [] }
							: isNode(declarator.init)
								? { value: declarator.init, path: [] }
								: undefined
					);
					if (isNode(declarator.init))
						walk(declarator.init, declarator, "init", scope, false);
				}
				return;
			}
			case "FunctionDeclaration": {
				if (isNode(node.id)) declare(node.id, scope, "function");
				declareFunction(node, scope);
				return;
			}
			case "FunctionExpression":
			case "ArrowFunctionExpression":
			case "ObjectMethod":
			case "ClassMethod":
			case "ClassPrivateMethod": {
				declareFunction(node, scope);
				return;
			}
			case "ClassDeclaration":
			case "ClassExpression": {
				let inner = scope;
				if (isNode(node.id)) {
					if (node.type === "ClassDeclaration")
						declare(node.id, scope, "class");
					else {
						inner = newScope(scope, false);
						declare(node.id, inner, "class");
					}
				}
				for (const { child, key: childKey } of children(node)) {
					if (childKey === "id") continue;
					if (childKey === "body") {
						parents.set(child, { parent: node, key: childKey });
						scopeOf.set(child, inner);
						for (const member of child.body as Node[]) {
							if (
								member.type === "ClassProperty" ||
								member.type === "ClassPrivateProperty" ||
								member.type === "ClassAccessorProperty"
							) {
								parents.set(member, { parent: child, key: "body" });
								scopeOf.set(member, inner);
								valueNodes.push(member);
								if (member.computed && isNode(member.key))
									walk(member.key, member, "key", inner, false);
								for (const decorator of (member.decorators as
									| Node[]
									| undefined) ?? [])
									walk(decorator, member, "decorators", inner, false);
								if (isNode(member.typeAnnotation))
									walk(
										member.typeAnnotation,
										member,
										"typeAnnotation",
										inner,
										true
									);
								if (isNode(member.value))
									walk(
										member.value,
										member,
										"value",
										newScope(inner, true),
										false
									);
							} else if (member.type === "StaticBlock") {
								parents.set(member, { parent: child, key: "body" });
								const block = newScope(inner, true);
								scopeOf.set(member, block);
								for (const statement of member.body as Node[])
									walk(statement, member, "body", block, false);
							} else walk(member, child, "body", inner, false);
						}
						continue;
					}
					walk(child, node, childKey, inner, false);
				}
				return;
			}
			case "BlockStatement":
			case "StaticBlock":
			case "TSModuleBlock": {
				const inner = newScope(scope, node.type !== "BlockStatement");
				scopeOf.set(node, inner);
				for (const statement of node.body as Node[])
					walk(statement, node, "body", inner, false);
				return;
			}
			case "TSModuleDeclaration": {
				if (isNode(node.body)) walk(node.body, node, "body", scope, false);
				return;
			}
			case "TSEnumDeclaration": {
				if (isNode(node.id)) declare(node.id, scope, "const");
				const inner = newScope(scope, false);
				for (const { child, key: childKey } of children(node))
					if (childKey !== "id") walk(child, node, childKey, inner, false);
				return;
			}
			case "TSEnumMember": {
				if (isNode(node.initializer))
					walk(node.initializer, node, "initializer", scope, false);
				return;
			}
			case "TSImportEqualsDeclaration": {
				if (isNode(node.id)) declare(node.id, scope, "import");
				const reference = node.moduleReference;
				if (
					isNode(reference) &&
					reference.type === "TSExternalModuleReference"
				) {
					const source = (reference.expression as Node).value as string;
					if (INTL_MODULE.test(source) || isCatalogPath(source))
						unresolve(
							"CommonJS TypeScript imports of next-intl or message files are unsupported.",
							node
						);
				}
				return;
			}
			case "ForStatement":
			case "ForInStatement":
			case "ForOfStatement": {
				const inner = newScope(scope, false);
				scopeOf.set(node, inner);
				for (const { child, key: childKey } of children(node)) {
					if (
						(childKey === "left" || childKey === "init") &&
						child.type !== "VariableDeclaration" &&
						node.type !== "ForStatement"
					) {
						assignPattern(
							child,
							node,
							childKey,
							inner,
							node.type === "ForOfStatement"
								? { forOf: node.right as Node, path: [] }
								: undefined
						);
						continue;
					}
					walk(child, node, childKey, inner, false);
				}
				return;
			}
			case "CatchClause": {
				const inner = newScope(scope, false);
				scopeOf.set(node, inner);
				if (isNode(node.param))
					declarePattern(node.param, node, "param", inner, "catch", undefined);
				walk(node.body as Node, node, "body", inner, false);
				return;
			}
			case "SwitchStatement": {
				walk(node.discriminant as Node, node, "discriminant", scope, false);
				const inner = newScope(scope, false);
				for (const switchCase of node.cases as Node[])
					walk(switchCase, node, "cases", inner, false);
				return;
			}
			case "AssignmentExpression": {
				const left = node.left as Node;
				walk(node.right as Node, node, "right", scope, false);
				if (
					left.type === "Identifier" ||
					left.type === "ObjectPattern" ||
					left.type === "ArrayPattern"
				)
					assignPattern(
						left,
						node,
						"left",
						scope,
						node.operator === "=" ||
							node.operator === "||=" ||
							node.operator === "&&=" ||
							node.operator === "??="
							? { value: node.right as Node, path: [] }
							: undefined
					);
				else walk(left, node, "left", scope, false);
				return;
			}
			case "UpdateExpression": {
				const argument = node.argument as Node;
				if (argument.type === "Identifier")
					pendingWrites.push({ node: argument, scope, write: undefined });
				walk(argument, node, "argument", scope, false);
				return;
			}
			case "Identifier": {
				pendingReferences.push({ node, scope, parent: parent!, key: key! });
				if (isNode(node.typeAnnotation))
					walk(node.typeAnnotation, node, "typeAnnotation", scope, true);
				return;
			}
			case "MemberExpression":
			case "OptionalMemberExpression": {
				walk(node.object as Node, node, "object", scope, false);
				if (node.computed)
					walk(node.property as Node, node, "property", scope, false);
				return;
			}
			case "ObjectProperty": {
				if (node.computed) walk(node.key as Node, node, "key", scope, false);
				walk(node.value as Node, node, "value", scope, false);
				return;
			}
			case "ClassProperty":
			case "ClassPrivateProperty":
			case "ClassAccessorProperty": {
				// outside a class body (not expected); treat like the class body does
				if (node.computed && isNode(node.key))
					walk(node.key, node, "key", scope, false);
				if (isNode(node.value))
					walk(node.value, node, "value", newScope(scope, true), false);
				return;
			}
			case "LabeledStatement": {
				walk(node.body as Node, node, "body", scope, false);
				return;
			}
			case "BreakStatement":
			case "ContinueStatement":
			case "MetaProperty":
			case "PrivateName":
			case "JSXClosingElement":
				return;
			case "JSXOpeningElement": {
				jsxNames.push({ node, scope });
				for (const attribute of node.attributes as Node[])
					walk(attribute, node, "attributes", scope, false);
				if (isNode(node.typeArguments ?? node.typeParameters))
					walk(
						(node.typeArguments ?? node.typeParameters) as Node,
						node,
						"typeArguments",
						scope,
						true
					);
				return;
			}
			case "JSXAttribute": {
				if (isNode(node.value)) walk(node.value, node, "value", scope, false);
				return;
			}
			case "WithStatement": {
				unresolve("A with statement makes names unresolvable.", node);
				break;
			}
		}
		for (const { child, key: childKey } of children(node))
			walk(child, node, childKey, scope, false);
	};

	const forOfHead = (declaration: Node): Node | undefined => {
		const parent = parents.get(declaration);
		return parent?.parent.type === "ForOfStatement" && parent.key === "left"
			? (parent.parent.right as Node)
			: undefined;
	};

	/** The values an import binding has. */
	function importValues(
		source: string,
		type: string,
		imported: string | undefined,
		at: Node
	): string[] {
		if (INTL_MODULE.test(source)) {
			if (/^next-intl\/config(?:\/|$)/.test(source)) {
				unresolve(
					"next-intl/config is the request configuration, which can read every message.",
					at
				);
				return [];
			}
			if (type === "ImportSpecifier")
				return imported === "Messages" || imported === "AppConfig"
					? ["cattype"]
					: imported !== undefined && API.has(imported)
						? [`api:${imported}`]
						: [];
			return INTL_TOOLING.test(source) ? [] : ["mod"];
		}
		if (source === "deepmerge" && type === "ImportDefaultSpecifier")
			return ["merge"];
		if (
			/^(?:lodash|lodash-es)$/.test(source) &&
			type === "ImportSpecifier" &&
			imported === "merge"
		)
			return ["merge"];
		if (
			/^(?:lodash[./]merge|lodash-es\/merge)$/.test(source) &&
			type === "ImportDefaultSpecifier"
		)
			return ["merge"];
		const file = catalogValue(source);
		if (file)
			return [
				type === "ImportNamespaceSpecifier"
					? asModule(file)
					: type === "ImportDefaultSpecifier"
						? file
						: // a named export of a JSON file is part of it
							"cat?",
			];
		return [];
	}
	function checkReexport(source: string, name: string | undefined, at: Node) {
		if (
			(INTL_MODULE.test(source) &&
				!INTL_TOOLING.test(source) &&
				(name === undefined || name === "default" || API.has(name))) ||
			isCatalogPath(source)
		)
			unresolve(
				"next-intl functions or messages are re-exported; their usage elsewhere can't be resolved.",
				at
			);
	}

	const rootScope = newScope(undefined, true);
	walk(program, undefined, undefined, rootScope, false);

	const resolved = new Map<Node, Binding>();
	for (const { node, scope, parent, key } of pendingReferences) {
		const binding = lookup(scope, node.name as string);
		if (!binding) continue;
		resolved.set(node, binding);
		binding.references.push({ node, parent, key });
	}
	for (const { node, scope, write } of pendingWrites) {
		const binding = lookup(scope, node.name as string);
		if (!binding) continue;
		resolved.set(node, binding);
		binding.reassigned = true;
		binding.writes.push(write ?? { path: [] });
	}
	for (const [node, binding] of bindingOf) resolved.set(node, binding);
	for (const declaration of exportedDeclarations) {
		const mark = (pattern: unknown) => {
			if (!isNode(pattern)) return;
			if (pattern.type === "Identifier") {
				const binding = bindingOf.get(pattern);
				if (binding) binding.exported = pattern;
			} else if (pattern.type === "ObjectPattern")
				for (const property of pattern.properties as Node[])
					mark(
						property.type === "RestElement" ? property.argument : property.value
					);
			else if (pattern.type === "ArrayPattern")
				for (const element of pattern.elements as Node[]) mark(element);
			else if (pattern.type === "RestElement") mark(pattern.argument);
			else if (pattern.type === "AssignmentPattern") mark(pattern.left);
		};
		if (declaration.type === "VariableDeclaration")
			for (const declarator of declaration.declarations as Node[])
				mark(declarator.id);
		else mark(declaration.id);
	}

	// ---- 2. Values of bindings (flow-insensitive fixpoint) ----
	const bindingValues = new Map<Binding, Values>();
	let memo = new Map<Node, Values>();
	const valuesOf = (binding: Binding): Values =>
		bindingValues.get(binding) ?? binding.preset;
	const member = (values: Values, name: string | undefined): Values => {
		const result: Values = new Set();
		for (const value of values) {
			if (value === "mod" && name !== undefined) {
				if (name === "default") result.add("mod");
				else if (API.has(name)) result.add(`api:${name}`);
			} else if (value.startsWith("catmod"))
				result.add(
					name === "default" ? value.replace(/^catmod/, "cat") : "cat?"
				);
			else if (value.startsWith("t") && name !== undefined && METHODS.has(name))
				result.add(`m:${name}:${value}`);
		}
		return result;
	};
	const evaluate = (node: Node): Values => {
		let result = memo.get(node);
		if (result) return result;
		memo.set(node, EMPTY); // cycles (a = b = a) settle in the fixpoint
		result = compute(node);
		memo.set(node, result);
		return result;
	};
	const compute = (node: Node): Values => {
		switch (node.type) {
			case "Identifier": {
				const binding = resolved.get(node);
				if (binding) return valuesOf(binding);
				return EMPTY;
			}
			case "ParenthesizedExpression":
			case "TSAsExpression":
			case "TSSatisfiesExpression":
			case "TSNonNullExpression":
			case "TSTypeAssertion":
			case "TSInstantiationExpression":
				return evaluate(node.expression as Node);
			case "SequenceExpression": {
				const expressions = node.expressions as Node[];
				return evaluate(expressions[expressions.length - 1]!);
			}
			case "ConditionalExpression":
				return union(
					evaluate(node.consequent as Node),
					evaluate(node.alternate as Node)
				);
			case "LogicalExpression":
				return union(evaluate(node.left as Node), evaluate(node.right as Node));
			case "AssignmentExpression":
				return node.operator === "="
					? evaluate(node.right as Node)
					: union(evaluate(node.left as Node), evaluate(node.right as Node));
			case "AwaitExpression": {
				const result: Values = new Set();
				for (const value of evaluate(node.argument as Node))
					result.add(value.startsWith("p:") ? value.slice(2) : value);
				return result;
			}
			case "MemberExpression":
			case "OptionalMemberExpression":
				return member(evaluate(node.object as Node), propertyName(node));
			case "ObjectProperty": {
				// `{ Home: homeMessages }` nests the file of namespace Home where it belongs
				const name = propertyName(node);
				return name !== undefined &&
					name !== "messages" &&
					evaluate(node.value as Node).has(`cat:${name}`)
					? new Set(["cat"])
					: EMPTY;
			}
			case "SpreadElement":
				return evaluate(node.argument as Node).has("cat")
					? new Set(["cat"])
					: EMPTY;
			case "ObjectExpression": {
				for (const property of node.properties as Node[])
					if (property.type !== "ObjectMethod" && evaluate(property).has("cat"))
						return new Set(["cat"]);
				return EMPTY;
			}
			case "CallExpression":
			case "OptionalCallExpression":
			case "NewExpression": {
				const callee = node.callee as Node;
				const callArguments = node.arguments as Node[];
				if (callee.type === "Import") return importValuesOf(callArguments[0]);
				if (
					callee.type === "Identifier" &&
					callee.name === "require" &&
					!resolved.has(callee)
				)
					return requireValues(callArguments[0]);
				const result: Values = new Set();
				for (const value of evaluate(callee)) {
					const name = value.startsWith("api:") ? value.slice(4) : undefined;
					if (name && TRANSLATOR_FACTORIES[name]) {
						const factory = TRANSLATOR_FACTORIES[name]!;
						for (const namespace of namespaces(
							factory.namespace,
							callArguments
						))
							result.add(
								(factory.async ? "p:" : "") +
									(namespace === undefined ? "t?" : translator(namespace))
							);
					} else if (name && CATALOG_FACTORIES[name])
						result.add(CATALOG_FACTORIES[name]!.async ? "p:cat" : "cat");
					else if (value === "merge") {
						const catalogs = callArguments.flatMap((argument) =>
							[...evaluate(argument)].filter((v) => v.startsWith("cat"))
						);
						if (catalogs.length)
							result.add(catalogs.every((v) => v === "cat") ? "cat" : "cat?");
					}
				}
				return result;
			}
			case "ImportExpression":
				return importValuesOf(node.source as Node);
			default:
				return EMPTY;
		}
	};
	const importValuesOf = (specifier: Node | undefined): Values => {
		const strings = specifier ? staticStrings(specifier) : undefined;
		if (strings)
			return new Set(
				strings.flatMap((source) =>
					INTL_MODULE.test(source)
						? INTL_TOOLING.test(source)
							? []
							: ["p:mod"]
						: catalogValue(source)
							? [`p:${asModule(catalogValue(source)!)}`]
							: []
				)
			);
		const suffix = jsonSuffix(specifier);
		return suffix === undefined
			? EMPTY
			: new Set([`p:${asModule(dynamicCatalog(suffix))}`]);
	};
	const requireValues = (specifier: Node | undefined): Values => {
		const strings = specifier ? staticStrings(specifier) : undefined;
		if (strings)
			return new Set(
				strings.flatMap((source) =>
					INTL_MODULE.test(source)
						? INTL_TOOLING.test(source)
							? []
							: ["mod"]
						: catalogValue(source)
							? [catalogValue(source)!]
							: []
				)
			);
		return EMPTY;
	};
	/** The static end of a path like `../messages/${locale}.json`, if it is a JSON file. */
	const jsonSuffix = (specifier: Node | undefined): string | undefined => {
		if (!specifier) return undefined;
		const node = unwrap(specifier);
		let last: string | undefined;
		if (node.type === "TemplateLiteral") {
			const quasis = node.quasis as Node[];
			last = (quasis[quasis.length - 1]?.value as { cooked?: string })?.cooked;
		} else if (node.type === "BinaryExpression" && node.operator === "+") {
			const right = staticStrings(node.right as Node);
			last = right?.length === 1 ? right[0] : undefined;
		}
		return typeof last === "string" && /\.json(?:[?#].*)?$/i.test(last)
			? last
			: undefined;
	};
	const dynamicJson = (specifier: Node | undefined) =>
		jsonSuffix(specifier) !== undefined;
	/** A dynamic module specifier whose module can't be next-intl or a message file. */
	const harmlessSpecifier = (specifier: Node | undefined): boolean => {
		if (!specifier) return false;
		const node = unwrap(specifier);
		let last: string | undefined;
		if (node.type === "TemplateLiteral") {
			const quasis = node.quasis as Node[];
			last = (quasis[quasis.length - 1]?.value as { cooked?: string })?.cooked;
		} else if (node.type === "BinaryExpression" && node.operator === "+") {
			const right = staticStrings(node.right as Node);
			last = right?.length === 1 ? right[0] : undefined;
		}
		// `./content/${slug}.mdx`: a source file, analyzed on its own
		return typeof last === "string" && /\.(?!json\b)[a-z]+$/i.test(last);
	};

	/** Namespaces of a translator factory call: `null` for none, `undefined` for unknown. */
	const namespaces = (
		kind: "first" | "object" | "second" | "none",
		callArguments: Node[]
	): (string | null | undefined)[] => {
		if (kind === "none") return [null];
		const argument = callArguments[kind === "second" ? 1 : 0];
		if (callArguments.some((node) => node.type === "SpreadElement"))
			return [undefined];
		if (!argument) return [null];
		const node = unwrap(argument);
		if (
			node.type === "Identifier" &&
			node.name === "undefined" &&
			!resolved.has(node)
		)
			return [null];
		if (
			node.type === "ObjectExpression" &&
			(kind === "object" || kind === "first")
		) {
			let namespace: (string | null | undefined)[] = [null];
			for (const property of node.properties as Node[]) {
				if (property.type !== "ObjectProperty") return [undefined];
				const name = propertyName(property);
				// `__proto__: { namespace }` provides the namespace through the prototype
				if (name === undefined || name === "__proto__") return [undefined];
				if (name === "namespace") {
					const value = unwrap(property.value as Node);
					namespace =
						value.type === "Identifier" &&
						value.name === "undefined" &&
						!resolved.has(value)
							? [null]
							: (staticStrings(value) ?? [undefined]);
				}
			}
			return namespace;
		}
		if (kind === "object") return [undefined];
		return staticStrings(node) ?? [undefined];
	};

	/** The strings an expression can be, if they are known. */
	const staticStrings = (
		node: Node,
		seen = new Set<Binding>()
	): string[] | undefined => {
		const values = staticValues(node, seen);
		return values && [...new Set(values.map(String))];
	};
	/**
	 * The strings and numbers an expression can be, if they are known. `+`
	 * and templates follow JavaScript: `${i + 1}` of 0 is "1", not "01".
	 */
	const staticValues = (
		node: Node,
		seen: Set<Binding>
	): Primitive[] | undefined => {
		const limit = (values: Primitive[] | undefined) =>
			values && values.length <= 256 ? [...new Set(values)] : undefined;
		switch (node.type) {
			case "StringLiteral":
				return [node.value as string];
			case "NumericLiteral":
				return [node.value as number];
			case "TemplateLiteral": {
				const quasis = node.quasis as Node[];
				const expressions = node.expressions as Node[];
				let result: Primitive[] | undefined = [""];
				for (let index = 0; index < quasis.length; index++) {
					const cooked = (quasis[index]!.value as { cooked?: string | null })
						.cooked;
					if (typeof cooked !== "string") return undefined;
					result = result.map((prefix) => `${prefix}${cooked}`);
					const expression = expressions[index];
					if (expression) {
						const values = staticValues(expression, seen);
						if (!values) return undefined;
						result = limit(
							result.flatMap((prefix) =>
								values.map((value) => `${prefix}${value}`)
							)
						);
						if (!result) return undefined;
					}
				}
				return result;
			}
			case "BinaryExpression": {
				if (node.operator !== "+") return undefined;
				const left = staticValues(node.left as Node, seen);
				const right = left && staticValues(node.right as Node, seen);
				if (!left || !right) return undefined;
				return limit(
					left.flatMap((a) =>
						right.map((b) =>
							typeof a === "number" && typeof b === "number"
								? a + b
								: `${a}${b}`
						)
					)
				);
			}
			case "ConditionalExpression": {
				const consequent = staticValues(node.consequent as Node, seen);
				const alternate =
					consequent && staticValues(node.alternate as Node, seen);
				return consequent && alternate
					? limit([...consequent, ...alternate])
					: undefined;
			}
			case "LogicalExpression": {
				// `a ?? "b"` is one of them when both are known
				const left = staticValues(node.left as Node, seen);
				const right = left && staticValues(node.right as Node, seen);
				return left && right ? limit([...left, ...right]) : undefined;
			}
			case "SequenceExpression": {
				const expressions = node.expressions as Node[];
				return staticValues(expressions[expressions.length - 1]!, seen);
			}
			case "ParenthesizedExpression":
			case "TSAsExpression":
			case "TSSatisfiesExpression":
			case "TSNonNullExpression":
			case "TSTypeAssertion":
				return staticValues(node.expression as Node, seen);
			case "Identifier": {
				const binding = resolved.get(node);
				if (!binding || seen.has(binding) || binding.writes.length !== 1)
					return undefined;
				if (binding.reassigned) return undefined;
				const next = new Set(seen).add(binding);
				const write = binding.writes[0]!;
				if (write.path.length) return undefined;
				if (write.forOf) return staticArray(write.forOf, next);
				if (write.value) return staticValues(write.value, next);
				return undefined;
			}
			default:
				return undefined;
		}
	};
	/** The values of an array that is never changed, e.g. `const keys = ["a", "b"] as const`. */
	const staticArray = (
		node: Node,
		seen: Set<Binding>
	): Primitive[] | undefined => {
		const target = unwrap(node);
		if (target.type === "ArrayExpression") {
			const result: Primitive[] = [];
			for (const element of target.elements as (Node | null)[]) {
				if (!element || element.type === "SpreadElement") return undefined;
				const values = staticValues(element, seen);
				if (!values) return undefined;
				result.push(...values);
			}
			return result;
		}
		if (target.type !== "Identifier") return undefined;
		const binding = resolved.get(target);
		if (
			!binding ||
			seen.has(binding) ||
			binding.reassigned ||
			binding.exported ||
			binding.writes.length !== 1 ||
			!binding.writes[0]!.value ||
			binding.writes[0]!.path.length
		)
			return undefined;
		// only read: never passed on or changed (`keys.map = …`, `keys.length = 0`)
		for (const reference of binding.references) {
			const context = climbWrappers(reference.node);
			const member = context.parent;
			if (
				!(
					(isMember(member) &&
						context.key === "object" &&
						READING.has(propertyName(member) ?? "") &&
						!isWritten(member)) ||
					(context.parent?.type === "ForOfStatement" && context.key === "right")
				)
			)
				return undefined;
		}
		return staticArray(binding.writes[0]!.value!, new Set(seen).add(binding));
	};
	/** Whether an expression is assigned to, updated or deleted. */
	const isWritten = (node: Node): boolean => {
		const { parent, key } = climbWrappers(node);
		return (
			(parent?.type === "AssignmentExpression" && key === "left") ||
			parent?.type === "UpdateExpression" ||
			(parent?.type === "UnaryExpression" && parent.operator === "delete") ||
			((parent?.type === "ForOfStatement" ||
				parent?.type === "ForInStatement") &&
				key === "left") ||
			parent?.type === "ArrayPattern" ||
			(parent?.type === "ObjectProperty" &&
				parents.get(parent)?.parent.type === "ObjectPattern")
		);
	};
	/** The innermost non-arrow function around a node, whose `arguments` it is. */
	const enclosingNonArrow = (node: Node): Node | undefined => {
		for (
			let current = parents.get(node);
			current;
			current = parents.get(current.parent)
		)
			if (
				FUNCTIONS.has(current.parent.type) &&
				current.parent.type !== "ArrowFunctionExpression"
			)
				return current.parent;
		return undefined;
	};
	const climbWrappers = (
		node: Node
	): { node: Node; parent?: Node; key?: string } => {
		let current = node;
		for (;;) {
			const parent = parents.get(current);
			if (!parent || !WRAPPERS.has(parent.parent.type))
				return { node: current, ...parent };
			current = parent.parent;
		}
	};

	// Callback parameters of `keys.map((key) => …)` over a static array. Only when nothing else
	// can call the callback with other values or change the array while it is iterated.
	const argumentsUsers = new Set<Node>();
	for (const { node } of pendingReferences)
		if (node.name === "arguments" && !resolved.has(node)) {
			const fn = enclosingNonArrow(node);
			if (fn) argumentsUsers.add(fn);
		}
	for (const binding of new Set(bindingOf.values())) {
		const owner = binding.parameterOf;
		if (!owner || owner.index !== 0 || binding.writes.length) continue;
		const fn = owner.fn;
		const params = fn.params as Node[];
		const arrayParameter = params[2] && bindingOf.get(params[2]);
		if (
			argumentsUsers.has(fn) ||
			(isNode(fn.id) && (bindingOf.get(fn.id)?.references.length ?? 0) > 0) ||
			(params[2] &&
				(!arrayParameter || arrayParameter.references.length > 0)) ||
			params.length > 3 ||
			params[0]!.type !== "Identifier"
		)
			continue;
		const context = climbWrappers(fn);
		if (
			isCall(context.parent) &&
			context.key === "arguments" &&
			(context.parent.arguments as Node[])[0] === context.node &&
			isMember(context.parent.callee as Node) &&
			ITERATING.has(propertyName(context.parent.callee as Node) ?? "")
		)
			binding.writes.push({
				forOf: (context.parent.callee as Node).object as Node,
				path: [],
			});
	}

	const allBindings = new Set(bindingOf.values());
	for (let iteration = 0; ; iteration++) {
		memo = new Map();
		let changed = false;
		for (const binding of allBindings) {
			const current = valuesOf(binding);
			const next = new Set(current);
			for (const write of binding.writes) {
				if (!write.value) continue;
				let values = evaluate(write.value);
				for (const part of write.path) values = member(values, part);
				for (const value of values) next.add(value);
			}
			if (next.size !== current.size) {
				bindingValues.set(binding, next);
				changed = true;
			}
		}
		if (!changed) break;
		if (iteration > 100) {
			unresolve("Usage analysis did not converge.", program);
			break;
		}
	}
	memo = new Map();

	// ---- 3. Usages and escapes ----
	const interesting = (value: string) =>
		value.startsWith("t") ||
		value.startsWith("m:") ||
		value.startsWith("p:") ||
		value === "mod" ||
		value.startsWith("cat") ||
		(value.startsWith("api:") &&
			!PROVIDERS.has(value.slice(4)) &&
			value !== "api:getRequestConfig");
	const kindOf = (value: string) =>
		value.startsWith("p:")
			? "promise"
			: value.startsWith("m:")
				? "method"
				: value.startsWith("t")
					? "translator"
					: value.startsWith("api:")
						? "api"
						: value.startsWith("catmod")
							? "catmod"
							: value.startsWith("cat")
								? "cat"
								: value;

	/** Whether `parent` passes the value of its child `key` on as its own value. */
	const transparent = (
		child: Node,
		parent: Node,
		key: string,
		kind: string,
		value: string
	): boolean => {
		if (WRAPPERS.has(parent.type)) return true;
		switch (parent.type) {
			case "SequenceExpression": {
				const expressions = parent.expressions as Node[];
				return expressions[expressions.length - 1] === child;
			}
			case "ConditionalExpression":
				return key !== "test";
			case "LogicalExpression":
			case "AwaitExpression":
				return true;
			case "AssignmentExpression":
				// `a = t` names it; `obj.t = t`, `({ x } = t)` and a global `t = …` are checked as assignments
				return (
					key === "right" &&
					(parent.left as Node).type === "Identifier" &&
					resolved.has(parent.left as Node)
				);
			case "ObjectProperty":
				return (
					key === "value" &&
					propertyName(parent) !== "messages" &&
					value === `cat:${propertyName(parent)}`
				);
			case "SpreadElement":
				return (
					value === "cat" &&
					parents.get(parent)?.parent.type === "ObjectExpression"
				);
			case "ObjectExpression":
				return value === "cat";
			case "MemberExpression":
			case "OptionalMemberExpression":
				return (
					kind === "catmod" &&
					key === "object" &&
					propertyName(parent) !== undefined
				);
			case "CallExpression":
			case "OptionalCallExpression":
				return (
					kind === "cat" &&
					key === "arguments" &&
					evaluate(parent.callee as Node).has("merge")
				);
			default:
				return false;
		}
	};

	const isProvider = (element: Node): boolean => {
		const name = element.name as Node;
		const scope = scopeOf.get(element)!;
		if (name.type === "JSXIdentifier") {
			const binding = lookup(scope, name.name as string);
			return (
				!!binding &&
				[...valuesOf(binding)].some((value) => PROVIDERS.has(value.slice(4)))
			);
		}
		if (
			name.type === "JSXMemberExpression" &&
			isNode(name.object) &&
			name.object.type === "JSXIdentifier"
		) {
			const binding = lookup(scope, name.object.name as string);
			return (
				!!binding &&
				valuesOf(binding).has("mod") &&
				PROVIDERS.has((name.property as Node).name as string)
			);
		}
		return false;
	};
	/** The function a node is directly in. */
	const enclosingFunction = (node: Node): Node | undefined => {
		for (
			let current = parents.get(node);
			current;
			current = parents.get(current.parent)
		)
			if (FUNCTIONS.has(current.parent.type)) return current.parent;
		return undefined;
	};
	const callsApi = (call: Node | undefined, name: string) =>
		isCall(call) && evaluate(call.callee as Node).has(`api:${name}`);
	/** `createTranslator({ messages })` or the object a `getRequestConfig` callback returns. */
	const isConfigObject = (object: Node): boolean => {
		const context = climbWrappers(object);
		if (
			context.key === "arguments" &&
			(context.parent?.arguments as Node[] | undefined)?.[0] === context.node &&
			callsApi(context.parent, "createTranslator")
		)
			return true;
		let fn: Node | undefined;
		if (context.parent?.type === "ReturnStatement")
			fn = enclosingFunction(context.parent);
		else if (
			context.parent?.type === "ArrowFunctionExpression" &&
			context.key === "body"
		)
			fn = context.parent;
		if (!fn) return false;
		const call = climbWrappers(fn);
		return (
			call.key === "arguments" &&
			(call.parent?.arguments as Node[] | undefined)?.[0] === call.node &&
			callsApi(call.parent, "getRequestConfig")
		);
	};
	const hookDependencies = (array: Node): boolean => {
		const context = climbWrappers(array);
		if (!isCall(context.parent) || context.key !== "arguments") return false;
		// React's hooks only: `useMemo` from "react", or `React.useMemo`
		const callee = context.parent.callee as Node;
		const fromReact = (node: Node) =>
			node.type === "Identifier" &&
			resolved.get(node)?.importedFrom === "react";
		const name =
			callee.type === "Identifier" && fromReact(callee)
				? (callee.name as string)
				: isMember(callee) && fromReact(callee.object as Node)
					? propertyName(callee)
					: undefined;
		const index = name === undefined ? undefined : DEPENDENCY_HOOKS[name];
		return (
			index !== undefined &&
			(context.parent.arguments as Node[])[index] === context.node
		);
	};

	/** Whether a value of `kind` may be at `node` without escaping. */
	const allowed = (
		node: Node,
		parent: Node | undefined,
		key: string | undefined,
		kind: string,
		value: string
	): boolean => {
		if (!parent || !key) return false;
		// a named binding or a discarded value: the binding's uses are checked
		if (parent.type === "VariableDeclarator" && key === "init")
			return (
				(parent.id as Node).type === "Identifier" ||
				(kind === "mod" && staticPattern(parent.id as Node))
			);
		if (parent.type === "AssignmentExpression" && key === "right") {
			const left = parent.left as Node;
			return (
				(left.type === "Identifier" && resolved.has(left)) ||
				(kind === "mod" && staticPattern(left))
			);
		}
		if (parent.type === "ExpressionStatement") return true;
		if (
			parent.type === "UnaryExpression" &&
			(parent.operator === "typeof" || parent.operator === "void")
		)
			return true;
		if (
			(parent.type === "IfStatement" ||
				parent.type === "ConditionalExpression") &&
			key === "test"
		)
			return true;
		if (parent.type === "ArrayExpression" && hookDependencies(parent))
			return true;
		switch (kind) {
			case "translator":
				return (
					(isCall(parent) && key === "callee") ||
					(isMember(parent) &&
						key === "object" &&
						METHODS.has(propertyName(parent) ?? ""))
				);
			case "method":
			case "api":
				return isCall(parent) && key === "callee";
			case "promise":
				return parent.type === "AwaitExpression";
			case "mod":
				return (
					isMember(parent) &&
					key === "object" &&
					propertyName(parent) !== undefined
				);
			case "cat": {
				// only all messages, as they are: a namespace file or nested messages change the keys
				if (value !== "cat") return false;
				if (parent.type === "JSXExpressionContainer") {
					const attribute = parents.get(parent)?.parent;
					const element = attribute && parents.get(attribute)?.parent;
					return (
						attribute?.type === "JSXAttribute" &&
						(attribute.name as Node).name === "messages" &&
						element?.type === "JSXOpeningElement" &&
						isProvider(element)
					);
				}
				if (
					parent.type === "ObjectProperty" &&
					key === "value" &&
					propertyName(parent) === "messages"
				) {
					const object = parents.get(parent)?.parent;
					return (
						!!object &&
						object.type === "ObjectExpression" &&
						isConfigObject(object)
					);
				}
				return false;
			}
			default:
				return false;
		}
	};
	const staticPattern = (pattern: Node): boolean =>
		pattern.type === "ObjectPattern" &&
		(pattern.properties as Node[]).every(
			(property) =>
				property.type === "ObjectProperty" &&
				propertyName(property) !== undefined
		);

	// next-intl functions of other objects, e.g. `i18n.useTranslations` of a wrapper package
	for (const node of valueNodes) {
		// a changed `Array.prototype.map` calls the callback of `keys.map` with other keys
		if (
			isMember(node) &&
			propertyName(node) === "prototype" &&
			identifierName(node.object) === "Array" &&
			!resolved.has(node.object as Node)
		)
			unresolve(
				"Array.prototype is used; array callbacks can't be resolved.",
				node
			);
		if (
			isMember(node) &&
			MESSAGE_API.has(propertyName(node) ?? "") &&
			!evaluate(node.object as Node).has("mod")
		)
			unresolve(wrapperReason, node);
	}
	for (const { property, write } of apiPatterns) {
		if (!MESSAGE_API.has(propertyName(property) ?? "")) continue;
		let values = write?.value ? evaluate(write.value) : EMPTY;
		for (const part of write?.path ?? []) values = member(values, part);
		if (!values.has("mod")) unresolve(wrapperReason, property);
	}

	const escapeReason: Record<string, string> = {
		translator:
			"A translator is passed on, returned or stored; the messages it reads can't be resolved.",
		method:
			"A translator method is passed on or stored; the messages it reads can't be resolved.",
		api: "A next-intl function is passed on, re-exported or stored; its usages can't be resolved.",
		promise:
			"A promised translator or message catalog is used without await; its usages can't be resolved.",
		mod: "The next-intl module is used dynamically; its usages can't be resolved.",
		cat: "Messages are read directly from the catalog (useMessages, getMessages or a message file); which ones can't be resolved.",
		catmod:
			"A message file is used dynamically; which messages are read can't be resolved.",
	};

	const use = (bundleId: string, at: Node) => {
		used.add(bundleId);
		refer(bundleId, at);
	};
	const bundleId = (namespace: string, key: string) =>
		namespace === "" ? key : `${namespace}.${key}`;

	for (const node of valueNodes) {
		// a next-intl call: record the messages it uses
		if (isCall(node)) {
			const callArguments = node.arguments as Node[];
			const keyArgument = callArguments[0];
			for (const value of evaluate(node.callee as Node)) {
				let method: string | undefined;
				let target = value;
				if (value.startsWith("m:")) {
					method = value.slice(2, value.indexOf(":", 2));
					target = value.slice(value.indexOf(":", 2) + 1);
				}
				if (target === "t?") continue; // reported where the translator is created
				const namespace = namespaceOf(target);
				if (namespace === undefined) {
					const name = value.startsWith("api:") ? value.slice(4) : undefined;
					if (name && EXTRACTED.has(name))
						unresolve(
							"Extracted messages (useExtracted, getExtracted) are keyed by their text; their bundles can't be resolved.",
							node
						);
					if (name && TRANSLATOR_FACTORIES[name])
						for (const namespace of namespaces(
							TRANSLATOR_FACTORIES[name]!.namespace,
							callArguments
						))
							if (namespace === undefined)
								unresolve(
									"The namespace of a translator can't be resolved statically.",
									node
								);
					continue;
				}
				if (!keyArgument) continue;
				const keys =
					keyArgument.type === "SpreadElement"
						? undefined
						: staticStrings(keyArgument);
				if (!keys) {
					unresolve(
						"A dynamic message key can't be resolved statically.",
						keyArgument
					);
					continue;
				}
				for (const key of keys) {
					const id = bundleId(namespace, key);
					use(id, node);
					if (method === "raw" || method === "has") {
						const location = located(node);
						subtreeReads.push({
							bundleId: id,
							issue: {
								path,
								reason: `t.${method}() can read a whole namespace; the messages under "${id}" can't be resolved.`,
								...(location ?? {}),
							},
						});
					} else leaves.add(id);
				}
			}
		}
		// `require(x)` and `import(x)` of something that can be next-intl or a message file
		if (
			(isCall(node) && (node.callee as Node).type === "Import") ||
			node.type === "ImportExpression" ||
			(isCall(node) &&
				(node.callee as Node).type === "Identifier" &&
				(node.callee as Node).name === "require" &&
				!resolved.has(node.callee as Node))
		) {
			const specifier =
				node.type === "ImportExpression"
					? (node.source as Node)
					: (node.arguments as Node[])[0];
			if (
				!(specifier && staticStrings(specifier)) &&
				!dynamicJson(specifier) &&
				!harmlessSpecifier(specifier)
			)
				unresolve(
					"A module loaded by a computed path could be next-intl or a message file.",
					node
				);
		}
		if (node.type === "Identifier" && !resolved.has(node)) {
			const name = node.name as string;
			const parent = parents.get(node);
			if (name === "eval" || name === "Function")
				unresolve("Dynamically evaluated code can't be analyzed.", node);
			if (
				(name === "require" &&
					!(isCall(parent?.parent) && parent!.key === "callee") &&
					!(
						isMember(parent?.parent) &&
						parent!.key === "object" &&
						propertyName(parent!.parent) === "resolve"
					)) ||
				name === "__webpack_require__" ||
				name === "__non_webpack_require__" ||
				name === "__webpack_modules__"
			)
				unresolve(
					"Module loaders can load next-intl or message files by computed names.",
					node
				);
		}
		if (
			node.type === "MetaProperty" &&
			identifierName(node.meta) === "import" &&
			identifierName(node.property) === "meta"
		) {
			const parent = parents.get(node);
			const property =
				parent && isMember(parent.parent) && parent.key === "object"
					? propertyName(parent.parent)
					: undefined;
			if (!property || !IMPORT_META.has(property))
				unresolve(
					"import.meta.glob and other import.meta loaders can load message files by computed names.",
					node
				);
		}
		// a message file read by path, e.g. fetch("/messages/en.json") or readFile(`${locale}.json`)
		if (node.type === "StringLiteral" || node.type === "TemplateLiteral") {
			const parent = parents.get(node);
			const specifier =
				parent &&
				((parent.key === "source" &&
					/^(?:Import|Export\w+)Declaration$|^ImportExpression$/.test(
						parent.parent.type
					)) ||
					(isCall(parent.parent) &&
						parent.key === "arguments" &&
						((parent.parent.callee as Node).type === "Import" ||
							((parent.parent.callee as Node).type === "Identifier" &&
								(parent.parent.callee as Node).name === "require"))) ||
					parent.parent.type === "TSExternalModuleReference" ||
					parent.parent.type === "TemplateLiteral" ||
					(parent.parent.type === "ObjectProperty" && parent.key === "key") ||
					parent.parent.type === "ImportAttribute");
			if (!specifier) {
				const strings = staticStrings(node);
				// an argument such as readdirSync("messages") or join(cwd, "messages", file)
				const argument =
					!!parent &&
					parent.key === "arguments" &&
					/^(?:Optional)?CallExpression$|^NewExpression$/.test(
						parent.parent.type
					);
				const messageDirectory = (text: string) => {
					const directory = text
						.toLowerCase()
						.replace(/^(?:\.\.?\/)+/, "")
						.replace(/\/+$/, "");
					return (catalog?.directories ?? []).some(
						(name) => directory === name || directory.endsWith(`/${name}`)
					);
				};
				if (
					strings
						? strings.some(
								(text) =>
									text.trim().toLowerCase() === ".json" ||
									/[*?{[].*json/i.test(text.trim()) ||
									isCatalogPath(text.trim(), false) ||
									(argument && messageDirectory(text.trim()))
							)
						: dynamicJson(node)
				)
					unresolve(
						"A message file is referenced by path; messages may be read from it directly.",
						node
					);
			}
		}
		// escapes
		const values = evaluate(node);
		if (values.size === 0) continue;
		const parent = parents.get(node);
		for (const value of values) {
			if (!interesting(value)) continue;
			const kind = kindOf(value);
			if (parent && transparent(node, parent.parent, parent.key, kind, value))
				continue;
			if (!allowed(node, parent?.parent, parent?.key, kind, value))
				unresolve(escapeReason[kind]!, node);
		}
	}

	// Exported bindings: other modules can use them.
	for (const binding of allBindings)
		if (binding.exported && [...valuesOf(binding)].some(interesting))
			unresolve(
				escapeReason[kindOf([...valuesOf(binding)].find(interesting)!)]!,
				binding.exported
			);

	// JSX elements named by a translator or a next-intl function, e.g. `<T />`.
	for (const { node, scope } of jsxNames) {
		const name = node.name as Node;
		const root =
			name.type === "JSXIdentifier"
				? name
				: name.type === "JSXMemberExpression"
					? (() => {
							let object = name.object as Node;
							while (object.type === "JSXMemberExpression")
								object = object.object as Node;
							return object;
						})()
					: undefined;
		if (!root || root.type !== "JSXIdentifier") continue;
		const binding = lookup(scope, root.name as string);
		if (!binding) continue;
		const values = [...valuesOf(binding)].filter(
			(value) =>
				interesting(value) &&
				!(value === "mod" && name.type === "JSXMemberExpression")
		);
		if (values.length) unresolve(escapeReason[kindOf(values[0]!)]!, name);
	}

	// Types. A type of all messages may only type next-intl (`Messages` of `AppConfig`, a
	// local alias, an interface such as `IntlMessages` extending it): `keyof`, indexing or
	// passing it to a generic can turn message keys into types that break when one is deleted.
	const keyTypeReason =
		"A type depends on message keys (keyof, an indexed message type, MessageKeys or typeof a translator).";
	const catalogTypes = new Set<string>();
	const isCatalogValue = (values: Values) =>
		[...values].some((value) => value.startsWith("cat"));
	/** Whether a type node is the type of all messages. */
	const isCatalogType = (type: Node, scope: Scope): boolean => {
		if (type.type === "TSParenthesizedType")
			return isCatalogType(type.typeAnnotation as Node, scope);
		if (type.type === "TSTypeQuery") {
			const name = type.exprName as Node;
			if (name.type === "TSImportType") {
				const source = importTypeSource(name);
				return !name.qualifier && source !== undefined && isCatalogPath(source);
			}
			if (name.type !== "Identifier") return false;
			const binding = lookup(scope, name.name as string);
			return !!binding && isCatalogValue(valuesOf(binding));
		}
		if (
			type.type === "TSTypeReference" ||
			type.type === "TSExpressionWithTypeArguments" ||
			type.type === "TSInterfaceHeritage"
		)
			return isCatalogName((type.typeName ?? type.expression) as Node, scope);
		return false;
	};
	const isCatalogName = (name: Node, scope: Scope): boolean => {
		if (name.type === "Identifier") {
			if (catalogTypes.has(name.name as string)) return true;
			const binding = lookup(scope, name.name as string);
			if (binding) return valuesOf(binding).has("cattype");
			return name.name === "IntlMessages";
		}
		if (name.type === "TSQualifiedName") {
			const root = name.left as Node;
			const binding =
				root.type === "Identifier"
					? lookup(scope, root.name as string)
					: undefined;
			return (
				!!binding &&
				valuesOf(binding).has("mod") &&
				["Messages", "AppConfig"].includes(identifierName(name.right) ?? "")
			);
		}
		return false;
	};
	const heritage = (declaration: Node): Node[] =>
		declaration.type === "TSInterfaceDeclaration"
			? ((declaration.extends as Node[] | undefined) ?? [])
			: [];
	for (let changed = true; changed; ) {
		changed = false;
		for (const { node, scope } of typeDeclarations) {
			const name = identifierName(node.id);
			if (!name || catalogTypes.has(name)) continue;
			if (
				node.type === "TSTypeAliasDeclaration"
					? isCatalogType(node.typeAnnotation as Node, scope)
					: heritage(node).some((parent) => isCatalogType(parent, scope))
			) {
				catalogTypes.add(name);
				changed = true;
			}
		}
	}
	const exportedDeclaration = (declaration: Node) =>
		parents.get(declaration)?.parent.type === "ExportNamedDeclaration" ||
		parents.get(declaration)?.parent.type === "ExportDefaultDeclaration" ||
		exportedNames.has(identifierName(declaration.id) ?? "");
	/** Where a type of all messages may be. */
	const allowedCatalogType = (type: Node): boolean => {
		let { parent, key } = parents.get(type) ?? {};
		while (parent?.type === "TSParenthesizedType")
			({ parent, key } = parents.get(parent) ?? {});
		if (!parent) return false;
		if (parent.type === "TSTypeAliasDeclaration" && key === "typeAnnotation")
			return !exportedDeclaration(parent);
		if (
			(parent.type === "TSInterfaceDeclaration" && key === "extends") ||
			((type.type === "TSExpressionWithTypeArguments" ||
				type.type === "TSInterfaceHeritage") &&
				parent.type === "TSInterfaceDeclaration")
		)
			return !exportedDeclaration(parent);
		// interface AppConfig { Messages: typeof messages }
		if (parent.type === "TSTypeAnnotation") {
			const property = parents.get(parent)?.parent;
			const body = property && parents.get(property)?.parent;
			const declaration = body && parents.get(body)?.parent;
			return (
				property?.type === "TSPropertySignature" &&
				propertyName(property) === "Messages" &&
				declaration?.type === "TSInterfaceDeclaration" &&
				identifierName(declaration.id) === "AppConfig"
			);
		}
		return false;
	};
	for (const { node, scope } of typeDeclarations)
		for (const parent of heritage(node))
			if (isCatalogType(parent, scope) && !allowedCatalogType(parent))
				unresolve(keyTypeReason, parent);
	for (const { node, scope } of typeNodes) {
		if (node.type === "TSTypeQuery") {
			if (isCatalogType(node, scope)) {
				if (!allowedCatalogType(node)) unresolve(keyTypeReason, node);
				continue;
			}
			let name = node.exprName as Node;
			if (name.type === "TSImportType") {
				const source = importTypeSource(name);
				if (source !== undefined && isCatalogPath(source))
					unresolve(keyTypeReason, node);
				continue;
			}
			while (name.type === "TSQualifiedName") name = name.left as Node;
			if (name.type !== "Identifier") continue;
			const binding = lookup(scope, name.name as string);
			// `typeof en.Home`, `Parameters<typeof t>[0]`, `typeof useTranslations`
			if (binding && [...valuesOf(binding)].some(interesting))
				unresolve(keyTypeReason, node);
		} else if (node.type === "TSTypeReference") {
			if (isCatalogType(node, scope)) {
				if (!allowedCatalogType(node)) unresolve(keyTypeReason, node);
				continue;
			}
			let name = node.typeName as Node;
			const path: string[] = [];
			while (name.type === "TSQualifiedName") {
				path.unshift(identifierName(name.right) ?? "");
				name = name.left as Node;
			}
			if (name.type !== "Identifier") continue;
			const binding = lookup(scope, name.name as string);
			if (!binding) continue;
			const values = valuesOf(binding);
			const keyType =
				path.length === 0
					? [...KEY_TYPES].some((type) => values.has(`api:${type}`))
					: path.length === 1 && values.has("mod") && KEY_TYPES.has(path[0]!);
			if (keyType) unresolve(keyTypeReason, node);
		} else if (node.type === "TSImportType") {
			const source = importTypeSource(node);
			const qualifier = identifierName(node.qualifier);
			if (
				source !== undefined &&
				INTL_MODULE.test(source) &&
				qualifier !== undefined &&
				(KEY_TYPES.has(qualifier) ||
					qualifier === "Messages" ||
					qualifier === "AppConfig")
			)
				unresolve(keyTypeReason, node);
		}
	}

	return {
		used,
		leaves,
		references,
		subtreeReads,
		issues: [...unresolved.values()].sort(
			(a, b) =>
				(a.start?.line ?? 0) - (b.start?.line ?? 0) ||
				(a.start?.column ?? 0) - (b.start?.column ?? 0)
		),
	};
}

/** 1-based line and 0-based column of an offset in `content`. */
function positions(content: string) {
	let lineStarts: number[] | undefined;
	return (offset: number) => {
		lineStarts ??= [
			0,
			...[...content.matchAll(/\n/g)].map((match) => match.index! + 1),
		];
		let low = 0,
			high = lineStarts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (lineStarts[middle]! <= offset) low = middle;
			else high = middle - 1;
		}
		return { line: low + 1, column: offset - lineStarts[low]! };
	};
}

/** The source offset of a generated offset: MDX code maps back through its segments. */
function toOriginal(
	segments: Segment[] | undefined,
	offset: number,
	end: boolean
): number {
	if (!segments) return offset;
	let result: number | undefined;
	for (const segment of segments) {
		const from = segment.generated;
		const to = segment.generated + segment.length;
		if (offset >= from && offset <= to)
			return segment.original + (offset - from);
		if (!end && offset < from) return segment.original;
		if (end && offset > to) result = segment.original + segment.length;
	}
	return result ?? segments[0]?.original ?? 0;
}

/** The module of `import("x")` in a type. */
function importTypeSource(node: Node): string | undefined {
	const argument = node.argument as Node;
	const source =
		(argument.literal as Node | undefined)?.value ?? argument.value;
	return typeof source === "string" ? source : undefined;
}

function union(a: Values, b: Values): Values {
	if (a.size === 0) return b;
	if (b.size === 0) return a;
	return new Set([...a, ...b]);
}
