import type { AnalyzeUsage, UsageIssue } from "@inlang/sdk";
import { PLUGIN_KEY } from "../pluginKey.js";
import {
	isNode,
	keyName,
	location,
	parseScript,
	patternNames,
	propertyName,
	SCRIPT,
	stringValue,
	unwrap,
	walk,
	type Node,
} from "./ast.js";
import {
	createResolver,
	normalizePath,
	staticStrings,
	type Lookup,
} from "./constants.js";

/**
 * Finds the keys the source code translates, so `inlang check` can report the others.
 *
 * "Unused" findings can delete translations, so the analysis fails closed: a usage it
 * can't resolve (a dynamic key, a translator passed to another function, `keyPrefix`,
 * `returnObjects`, a translation file read directly, ...) makes the result `incomplete`
 * and names the file and line. Anything that is unclear but harmless to over-count
 * (namespace, a `_one` suffix) marks more bundles as used instead.
 */

/** Files that can call i18next but that the analyzer can't read. */
const UNREADABLE = /\.(?:vue|svelte|astro|mdx|svx|marko|html?|cjs|cts)$/i;
/** Text in a file that suggests i18next usage. */
const MARKER = /i18next|useTranslation|i18nKey|getFixedT|\bt\(|\$t\(/;
/** Text in a file that can reach a translation without the marker. */
const MAYBE = /\.t\b|\$te?\b|exists|\.json/;
/** Files that probably pass translators around, even without importing i18next. */
const TRANSLATION_FILE = /translat|i18n/i;

/** Functions that return a translator (or `{ t }`). Their first or second argument is the namespace. */
const FACTORIES = new Set([
	"useTranslation",
	"getFixedT",
	"getT",
	"useT",
	"getTranslation",
]);
/** Methods that read a key. `$t` is the global of i18next-vue. */
const KEY_METHODS = new Set(["t", "exists", "$t", "$te"]);
/** Reading translations without a key. */
const REFLECTION = new Set([
	"getResourceBundle",
	"getResource",
	"getDataByLanguage",
	"hasResourceBundle",
	"resourceStore",
]);
/** Init options that change how keys resolve to resources. */
const KEY_RESOLUTION = new Set([
	"fallbackNS",
	"nsSeparator",
	"contextSeparator",
	"pluralSeparator",
]);
/** Methods that hand a translation file to i18next, which is not reading it. */
const ADD_RESOURCES = new Set([
	"addResourceBundle",
	"addResources",
	"addResource",
]);
const CALLS = new Set(["CallExpression", "OptionalCallExpression"]);
const MEMBERS = new Set(["MemberExpression", "OptionalMemberExpression"]);

/** The names a pattern binds to a `t` property: `({ t: translate })`, `[{ t }]`. */
function translatorsIn(pattern: unknown): string[] {
	if (!isNode(pattern)) return [];
	switch (pattern.type) {
		case "AssignmentPattern":
			return translatorsIn(pattern.left);
		case "ArrayPattern":
			return (pattern.elements as unknown[]).flatMap(translatorsIn);
		case "ObjectPattern":
			return (pattern.properties as Node[]).flatMap((property) =>
				property.type !== "ObjectProperty"
					? []
					: keyName(property) === "t"
						? patternNames(property.value)
						: translatorsIn(property.value)
			);
		default:
			return [];
	}
}

const isI18nModule = (source: unknown) =>
	typeof source === "string" && /i18next/.test(source);

/** Namespaces a translator reads: names, or every namespace of the project. */
type Scope = Set<string> | "all";

/** The bundle ids i18next can resolve `key` to. Over-counts rather than risk a false "unused". */
function bundleIds(
	key: string,
	scope: Scope,
	namespaces: readonly string[]
): string[] {
	// `friend_male_one` is the key `friend_male_one`, or the plural `one` of `friend_male`, or the
	// context `male` of `friend`: every prefix up to an underscore can be the bundle.
	const stems = (value: string) => {
		const parts = value.split("_");
		return parts.map((_, index) => parts.slice(0, index + 1).join("_"));
	};
	const withNamespace = (stem: string, namespace: string) =>
		namespaces.length === 0 ? stem : `${namespace}:${stem}`;
	const ids = new Set<string>();
	const names = scope === "all" ? namespaces : [...scope];
	for (const stem of stems(key))
		for (const namespace of names.length ? names : [""])
			ids.add(withNamespace(stem, namespace));
	// `namespace:key`
	const separator = key.indexOf(":");
	if (separator > 0) {
		const namespace = key.slice(0, separator);
		for (const stem of stems(key.slice(separator + 1)))
			ids.add(withNamespace(stem, namespace));
	}
	return [...ids];
}

/** The namespaces of a namespaced `pathPattern`; none for a single `pathPattern`. */
function projectNamespaces(settings: Record<string, unknown>): string[] {
	const pathPattern = (
		settings[PLUGIN_KEY] as { pathPattern?: unknown } | undefined
	)?.pathPattern;
	return pathPattern && typeof pathPattern === "object"
		? Object.keys(pathPattern)
		: [];
}

/**
 * The paths that end a translation file's path, per locale: `en/common.json` for
 * `./locales/{locale}/common.json`. A string that ends with one of them (after a `/`)
 * names a translation file. A `sourceLanguageFilePath` without a locale is matched by
 * its file name.
 */
function catalogTails(settings: Record<string, unknown>): string[] {
	const pluginSettings = settings[PLUGIN_KEY] as
		| { pathPattern?: unknown; sourceLanguageFilePath?: unknown }
		| undefined;
	const paths = (value: unknown): string[] =>
		typeof value === "string"
			? [value]
			: value && typeof value === "object"
				? Object.values(value).filter(
						(path): path is string => typeof path === "string"
					)
				: [];
	const patterns = [
		...paths(pluginSettings?.pathPattern),
		...paths(pluginSettings?.sourceLanguageFilePath),
	];
	const locales = [
		settings.baseLocale,
		...(Array.isArray(settings.locales) ? settings.locales : []),
	].filter((locale): locale is string => typeof locale === "string");
	const placeholder = /\{(?:locale|languageTag)\}/;
	const tails = new Set<string>();
	for (const pattern of patterns) {
		const segments = pattern
			.split("/")
			.filter((segment) => segment && segment !== "." && segment !== "..");
		const first = segments.findIndex((segment) => placeholder.test(segment));
		if (first === -1) {
			const name = segments.at(-1);
			if (name) tails.add(name.toLowerCase());
			continue;
		}
		for (const locale of locales)
			tails.add(
				segments
					.slice(first)
					.join("/")
					.replace(new RegExp(placeholder.source, "g"), locale)
					.toLowerCase()
			);
	}
	return [...tails];
}

const OPAQUE_OPTIONS =
	"Options that aren't an object literal can change the keys, e.g. with returnObjects or keyPrefix.";

/**
 * The part of a `t()` option argument we can't see into: a variable, a call or a
 * spread can hold `returnObjects`, `keyPrefix` or `ns`. Object literals are checked
 * property by property elsewhere, and a string is a default value.
 */
function opaqueOption(option: Node): Node | undefined {
	const value = unwrap(option);
	if (!value) return option;
	if (value.type === "ObjectExpression") {
		return (value.properties as Node[]).find(
			(property) =>
				property.type === "SpreadElement" ||
				(property.computed === true && keyName(property) === undefined)
		);
	}
	if (
		value.type === "StringLiteral" ||
		value.type === "TemplateLiteral" ||
		value.type === "NumericLiteral" ||
		value.type === "BooleanLiteral" ||
		value.type === "NullLiteral" ||
		(value.type === "Identifier" && value.name === "undefined")
	)
		return undefined;
	return value;
}

/** What a reference to an identifier does with it. */
function referenceKind(
	parent: Node | undefined,
	key: string | undefined
): "callee" | "binding" | "reference" {
	if (parent && CALLS.has(parent.type) && key === "callee") return "callee";
	if (
		parent &&
		MEMBERS.has(parent.type) &&
		key === "property" &&
		!parent.computed
	)
		return "binding";
	if (
		(parent?.type === "ObjectProperty" || parent?.type === "ClassProperty") &&
		key === "key" &&
		!parent.computed
	)
		return "binding";
	if (
		(parent?.type === "VariableDeclarator" && key === "id") ||
		key === "params" ||
		parent?.type === "ImportSpecifier" ||
		parent?.type === "ImportDefaultSpecifier" ||
		parent?.type === "ImportNamespaceSpecifier"
	)
		return "binding";
	return "reference";
}

/** The name of `i18n` in `i18n.store` and `useTranslation().i18n.store`. */
const objectName = (node: unknown): string | undefined =>
	!isNode(node)
		? undefined
		: node.type === "Identifier"
			? (node.name as string)
			: MEMBERS.has(node.type)
				? propertyName(node)
				: undefined;

/** Conservative analysis of i18next usages in JavaScript and TypeScript. */
export const analyzeUsage: AnalyzeUsage = ({ files, settings }) => {
	if (
		files.length > 10_000 ||
		files.reduce((size, file) => size + file.content.length, 0) > 50_000_000
	) {
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
	}
	const namespaces = projectNamespaces(settings as Record<string, unknown>);
	const tails = catalogTails(settings as Record<string, unknown>);
	const isCatalog = (value: string) => {
		const lower = value.replace(/\\/g, "/").toLowerCase();
		return tails.some((tail) => lower === tail || lower.endsWith(`/${tail}`));
	};
	const resolver = createResolver(files);
	const used = new Set<string>();
	const issues: UsageIssue[] = [];

	for (const file of files) {
		const path = file.path;
		const issue = (reason: string, node?: Node) =>
			issues.push({ path, reason, ...(node ? location(node) : {}) });
		const isScript = SCRIPT.test(path) && !/\.c[jt]s$/i.test(path);
		if (!isScript) {
			if (UNREADABLE.test(path) && MARKER.test(file.content))
				issue(
					`${path.slice(path.lastIndexOf(".") + 1)} files and CommonJS can't be analyzed for i18next usages.`
				);
			continue;
		}
		if (!MARKER.test(file.content) && !MAYBE.test(file.content)) continue;
		let program: Node;
		try {
			program = parseScript(path, file.content);
		} catch {
			issue("The file could not be parsed.");
			continue;
		}
		/** Keys written as constants, in this file or in a file it imports. */
		const lookup: Lookup = resolver.scopeOf(
			normalizePath(path),
			program
		).lookup;

		// ---- pass 1: what is a translator in this file ----
		let aware = false;
		const factories = new Set(FACTORIES);
		const transNames = new Set<string>();
		const translationNames = new Set<string>();
		/** Names that hold a translator, with the namespaces it was created for. */
		const bound = new Map<string, Scope>();
		/** Names declared in some other way, e.g. as a prop: the namespace is unknown. */
		const other = new Set<string>();
		const parameters = new Set<string>();
		/** Names of imported or required translation files. */
		const catalogBindings = new Set<string>();
		/** Strings that are a translation file's path and are accounted for. */
		const handled = new Set<Node>();
		const bind = (name: string, scope: Scope) => {
			const current = bound.get(name);
			bound.set(
				name,
				current === "all" || scope === "all"
					? "all"
					: new Set([...(current ?? []), ...scope])
			);
		};
		const calleeName = (call: Node): string | undefined => {
			const callee = call.callee as Node;
			return callee.type === "Identifier"
				? (callee.name as string)
				: MEMBERS.has(callee.type)
					? propertyName(callee)
					: undefined;
		};
		const factoryScope = (call: Node): Scope => {
			const name = calleeName(call);
			const args = call.arguments as Node[];
			if (name === "getFixedT") {
				if (args.length > 2)
					issue("getFixedT with a keyPrefix changes the keys.", call);
				const names = args[1] ? staticStrings(args[1], lookup) : undefined;
				return names ? new Set(names) : "all";
			}
			if (name === "useTranslation") {
				const names = args[0] ? staticStrings(args[0], lookup) : undefined;
				return names ? new Set(names) : "all";
			}
			return "all";
		};
		const factoryCall = (node: unknown): Node | undefined => {
			const call = unwrap(node);
			if (!call || !CALLS.has(call.type)) return undefined;
			const name = calleeName(call);
			return name && (factories.has(name) || name === "getFixedT")
				? call
				: undefined;
		};
		/** `require("./en.json")` or `import("./en.json")`: the path argument. */
		const catalogLoad = (call: Node): Node | undefined => {
			const callee = call.callee as Node;
			const loads =
				callee.type === "Import" ||
				(callee.type === "Identifier" && callee.name === "require");
			const argument = (call.arguments as Node[])[0];
			const target = stringValue(argument);
			return loads && argument && target !== undefined && isCatalog(target)
				? argument
				: undefined;
		};

		walk(program, (node) => {
			switch (node.type) {
				case "ImportDeclaration": {
					const source = stringValue(node.source);
					if (source !== undefined && isCatalog(source)) {
						handled.add(node.source as Node);
						for (const specifier of node.specifiers as Node[]) {
							if (specifier.type === "ImportSpecifier")
								issue(
									"A message is read from a translation file directly, so its usages can't be resolved.",
									specifier
								);
							else
								catalogBindings.add((specifier.local as Node).name as string);
						}
						break;
					}
					if (!isI18nModule(source)) break;
					aware = true;
					for (const specifier of node.specifiers as Node[]) {
						if (specifier.type !== "ImportSpecifier") continue;
						const imported =
							(specifier.imported as Node).name ??
							(specifier.imported as Node).value;
						const local = (specifier.local as Node).name as string;
						if (FACTORIES.has(imported as string)) factories.add(local);
						else if (imported === "Trans") transNames.add(local);
						else if (imported === "Translation") translationNames.add(local);
						else if (imported === "t") {
							other.add(local);
							bind(local, "all");
						}
					}
					break;
				}
				case "CallExpression": {
					// require("i18next") is CommonJS
					const callee = node.callee as Node;
					if (callee.type === "Identifier" && callee.name === "require") {
						const target = (node.arguments as Node[])[0];
						if (isI18nModule(stringValue(target)))
							issue("CommonJS require of i18next.", node);
					}
					// a translation file loaded where it is read: `require("./en.json").title`
					const loaded = catalogLoad(node);
					if (loaded && !handled.has(loaded)) {
						handled.add(loaded);
						issue(
							"A translation file is loaded and read directly, so its usages can't be resolved.",
							node
						);
					}
					break;
				}
				case "VariableDeclarator": {
					const init = unwrap(node.init);
					const id = node.id as Node;
					// `const en = require("./en.json")`
					const loaded =
						init && init.type === "CallExpression"
							? catalogLoad(init)
							: undefined;
					if (loaded) {
						handled.add(loaded);
						if (id.type === "Identifier")
							catalogBindings.add(id.name as string);
						else
							issue(
								"A translation file is destructured, so its usages can't be resolved.",
								node
							);
						break;
					}
					const call = factoryCall(init);
					if (call) {
						const scope = factoryScope(call);
						if (id.type === "ObjectPattern") {
							for (const property of id.properties as Node[])
								if (
									property.type === "ObjectProperty" &&
									keyName(property) === "t"
								)
									for (const name of patternNames(property.value))
										bind(name, scope);
						} else if (id.type === "ArrayPattern") {
							const first = (id.elements as unknown[])[0];
							for (const name of patternNames(first)) bind(name, scope);
						} else if (calleeName(call) === "getFixedT")
							for (const name of patternNames(id)) bind(name, scope);
					} else if (id.type === "ObjectPattern") {
						// `const { t } = props`
						for (const property of id.properties as Node[])
							if (
								property.type === "ObjectProperty" &&
								keyName(property) === "t"
							)
								for (const name of patternNames(property.value)) {
									other.add(name);
									bind(name, "all");
								}
					} else if (
						id.type === "Identifier" &&
						init?.type === "MemberExpression" &&
						propertyName(init) === "t"
					) {
						other.add(id.name as string);
						bind(id.name as string, "all");
					} else if (
						id.type === "ArrayPattern" &&
						init?.type === "CallExpression"
					) {
						// a custom hook that returns `[t, ...]`
						for (const name of patternNames((id.elements as unknown[])[0])) {
							other.add(name);
							bind(name, "all");
						}
					}
					break;
				}
				case "ObjectProperty": {
					const name = keyName(node);
					if (name === "keyPrefix") issue("keyPrefix changes the keys.", node);
					else if (name === "returnObjects")
						issue("returnObjects reads every key below a key.", node);
					else if (name && KEY_RESOLUTION.has(name))
						issue(`${name} changes how keys resolve to translations.`, node);
					else if (name === "keySeparator") {
						const value = node.value as Node;
						if (!(value.type === "BooleanLiteral" && value.value === false))
							issue(
								"keySeparator changes how keys resolve to translations.",
								node
							);
					}
					break;
				}
				case "JSXAttribute": {
					const name = (node.name as Node).name;
					if (name === "keyPrefix") issue("keyPrefix changes the keys.", node);
					if (name === "returnObjects")
						issue("returnObjects reads every key below a key.", node);
					break;
				}
				case "MemberExpression":
				case "OptionalMemberExpression": {
					const name = propertyName(node);
					if (name && REFLECTION.has(name))
						issue(`${name} reads translations without a key.`, node);
					else if (
						name === "resources" &&
						objectName(node.object) === "options"
					)
						issue("i18n.options.resources holds every translation.", node);
					else if (
						name === "store" &&
						/i18n/i.test(objectName(node.object) ?? "")
					)
						issue("i18n.store holds every translation.", node);
					break;
				}
				case "JSXElement": {
					const opening = node.openingElement as Node;
					const element = (opening.name as Node).name as string | undefined;
					if (element && translationNames.has(element)) {
						// <Translation>{(t) => ...}</Translation>
						for (const child of node.children as Node[]) {
							const callback =
								child.type === "JSXExpressionContainer"
									? (child.expression as Node)
									: undefined;
							if (
								callback &&
								(callback.type === "ArrowFunctionExpression" ||
									callback.type === "FunctionExpression")
							) {
								for (const name of patternNames(
									(callback.params as unknown[])[0]
								)) {
									other.add(name);
									bind(name, "all");
								}
							}
						}
					}
					break;
				}
				case "ArrowFunctionExpression":
				case "FunctionExpression":
				case "FunctionDeclaration":
				case "ObjectMethod":
				case "ClassMethod": {
					// `({ t }) => ...` or `(t) => ...`: a translator from a caller, so its namespace is unknown
					for (const param of node.params as Node[]) {
						for (const name of patternNames(param)) parameters.add(name);
						for (const name of translatorsIn(param)) {
							other.add(name);
							bind(name, "all");
						}
					}
					break;
				}
				default:
					break;
			}
		});
		for (const name of bound.keys()) if (parameters.has(name)) other.add(name);
		const tracked = new Set([...bound.keys()]);
		const scopeOf = (name: string): Scope => {
			const scope = bound.get(name);
			return !scope || other.has(name) ? "all" : scope;
		};
		const translatorNames = new Set<string>(["t", "$t", "$te", ...tracked]);
		const translatesLikely =
			aware || tracked.size > 0 || TRANSLATION_FILE.test(file.content);

		// ---- pass 2: the keys that are read, and the translators that escape ----
		const addKeys = (call: Node, scope: Scope, method: string) => {
			const args = call.arguments as Node[];
			const first = args[0];
			if (!first || first.type === "SpreadElement") {
				issue(`${method}() without a static key.`, call);
				return;
			}
			const keys = staticStrings(first, lookup);
			if (!keys) {
				issue("Dynamic keys can't be resolved.", first);
				return;
			}
			// `t("key", opts)`: `opts` can hold returnObjects, keyPrefix or ns
			for (const option of args.slice(1)) {
				const opaque = opaqueOption(option);
				if (opaque) issue(OPAQUE_OPTIONS, opaque);
			}
			// `t("key", { ns: "other" })`
			let callScope = scope;
			for (const option of args.slice(1)) {
				if (option.type !== "ObjectExpression") continue;
				for (const property of option.properties as Node[]) {
					if (property.type !== "ObjectProperty" || keyName(property) !== "ns")
						continue;
					const names = staticStrings(property.value, lookup);
					callScope = names ? new Set(names) : "all";
				}
			}
			for (const text of keys)
				for (const id of bundleIds(text, callScope, namespaces)) used.add(id);
		};
		walk(program, (node, parent, key) => {
			if (node.type === "TSTypeQuery" || node.type === "TSInterfaceDeclaration")
				return false;
			// declarations are not references
			if (
				node.type === "ObjectPattern" ||
				node.type === "ArrayPattern" ||
				(node.type === "UnaryExpression" && node.operator === "typeof")
			)
				return false;

			if (CALLS.has(node.type)) {
				const callee = unwrap(node.callee);
				if (
					callee?.type === "Identifier" &&
					translatorNames.has(callee.name as string)
				) {
					addKeys(node, scopeOf(callee.name as string), callee.name as string);
				} else if (callee && MEMBERS.has(callee.type)) {
					const method = propertyName(callee);
					if (method && KEY_METHODS.has(method)) {
						// `i18n.t`, `props.t`, `this.$t`, `useTranslation().t`
						const args = node.arguments as Node[];
						const dynamicUnrelated =
							method === "t" &&
							!translatesLikely &&
							staticStrings(args[0], lookup) === undefined;
						if (!dynamicUnrelated) addKeys(node, "all", method);
					}
				}
			}

			// <Trans i18nKey="..." />
			if (node.type === "JSXOpeningElement") {
				const name = (node.name as Node).name as string | undefined;
				if (name && transNames.has(name)) {
					const attributes = (node.attributes as Node[]).filter(
						(attribute) => attribute.type === "JSXAttribute"
					);
					const attribute = (wanted: string) =>
						attributes.find((entry) => (entry.name as Node).name === wanted);
					const valueOf = (entry: Node | undefined) => {
						const value = entry?.value as Node | undefined;
						return value?.type === "JSXExpressionContainer"
							? staticStrings(value.expression, lookup)
							: staticStrings(value, lookup);
					};
					const i18nKey = attribute("i18nKey");
					const keys = valueOf(i18nKey);
					const tOptions = attribute("tOptions")?.value as Node | undefined;
					const opaque =
						tOptions &&
						opaqueOption(
							tOptions.type === "JSXExpressionContainer"
								? (tOptions.expression as Node)
								: tOptions
						);
					if (opaque) issue(OPAQUE_OPTIONS, opaque);
					if (
						(node.attributes as Node[]).some(
							(entry) => entry.type === "JSXSpreadAttribute"
						)
					)
						issue("<Trans> with spread props can't be resolved.", node);
					else if (!i18nKey)
						issue("<Trans> without i18nKey uses its text as the key.", node);
					else if (!keys) issue("Dynamic i18nKey can't be resolved.", i18nKey);
					else {
						const nsAttribute = attribute("ns");
						const nsNames = nsAttribute ? valueOf(nsAttribute) : undefined;
						const scope: Scope = nsNames ? new Set(nsNames) : "all";
						for (const text of keys)
							for (const id of bundleIds(text, scope, namespaces)) used.add(id);
					}
				}
			}
			// `t={t}` hands the translator to <Trans>, which reads the keys we see on it
			if (
				node.type === "JSXAttribute" &&
				(node.name as Node).name === "t" &&
				parent?.type === "JSXOpeningElement" &&
				transNames.has(((parent.name as Node).name as string) ?? "")
			)
				return false;

			// a translation file named in code that reads it: `fs.readFileSync("locales/en.json")`
			if (!handled.has(node)) {
				const text = stringValue(node);
				if (text !== undefined && isCatalog(text))
					issue(
						"A translation file is read directly, so its usages can't be resolved.",
						node
					);
			}
			// a translation file's contents, other than handed to i18next as a resource
			if (
				node.type === "Identifier" &&
				catalogBindings.has(node.name as string)
			) {
				const handedOver =
					(parent?.type === "ObjectProperty" && key === "value") ||
					(parent !== undefined &&
						CALLS.has(parent.type) &&
						key === "arguments" &&
						MEMBERS.has((parent.callee as Node).type) &&
						ADD_RESOURCES.has(propertyName(parent.callee as Node) ?? ""));
				if (referenceKind(parent, key) === "reference" && !handedOver)
					issue(
						`${node.name as string} is a translation file read directly, so its usages can't be resolved.`,
						node
					);
			}

			// `export const tr = i18n.t` can be imported, and called, under any name
			if (
				node.type === "ExportNamedDeclaration" &&
				(node.declaration as Node | undefined)?.type === "VariableDeclaration"
			) {
				for (const declarator of (node.declaration as Node)
					.declarations as Node[])
					if (patternNames(declarator.id).some((name) => tracked.has(name)))
						issue(
							"An exported translator can be called under any name, so its keys can't be resolved.",
							declarator
						);
			}

			// a translator that is passed on, so a key is read where we can't see it
			if (translatesLikely) {
				if (node.type === "Identifier" && tracked.has(node.name as string)) {
					if (referenceKind(parent, key) === "reference")
						issue(
							`The translator ${node.name as string} is passed on, so its keys can't be resolved.`,
							node
						);
				}
				if (
					MEMBERS.has(node.type) &&
					propertyName(node) === "t" &&
					!(parent && CALLS.has(parent.type) && key === "callee") &&
					!(parent?.type === "VariableDeclarator" && key === "init")
				)
					issue(
						"A translator is passed on, so its keys can't be resolved.",
						node
					);
			}
			return true;
		});
	}

	return {
		usedBundleIds: [...used],
		status: issues.length ? "incomplete" : "complete",
		...(issues.length ? { issues } : {}),
	};
};
