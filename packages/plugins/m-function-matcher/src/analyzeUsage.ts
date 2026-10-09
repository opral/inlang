import { parse as parseSvelte } from "svelte/compiler";
import { parse } from "@babel/parser";
import type { AnalyzeUsage, UsageAnalysis, UsageReference } from "@inlang/sdk";

type Node = { type: string; [key: string]: unknown };
const isNode = (value: unknown): value is Node =>
	value !== null &&
	typeof value === "object" &&
	"type" in value &&
	typeof value.type === "string";
const identifier = (value: unknown): string | undefined =>
	isNode(value) && value.type === "Identifier"
		? (value.name as string)
		: undefined;
const staticMemberName = (node: Node): string | undefined => {
	if (!node.computed) return identifier(node.property);
	const property = node.property;
	if (!isNode(property)) return undefined;
	if (
		(property.type === "StringLiteral" || property.type === "Literal") &&
		typeof property.value === "string"
	)
		return property.value;
	if (
		property.type === "TemplateLiteral" &&
		(property.expressions as unknown[]).length === 0
	) {
		const quasi = (property.quasis as Node[])[0];
		return (quasi?.value as { cooked?: string })?.cooked;
	}
	return undefined;
};
const timers = new Set(["setTimeout", "setInterval"]);
const globalObjects = new Set([
	"globalThis",
	"window",
	"self",
	"global",
	"parent",
	"top",
	"frames",
	"opener",
]);
const globalAliases = new Set([
	...globalObjects,
	"parent",
	"top",
	"frames",
	"opener",
	"contentWindow",
	"defaultView",
]);
/**
 * `import.meta` properties that cannot load modules. Anything else (`glob`, `globEager`,
 * bundler-specific loaders, `import.meta` as a value) may load every message module behind a
 * computed key, so it makes the analysis incomplete.
 */
const importMetaProperties = new Set(["env", "url", "dirname", "filename", "hot"]);
/** Bundler module loaders that take computed module ids. */
const moduleLoaders = new Set([
	"__webpack_require__",
	"__non_webpack_require__",
	"__webpack_modules__",
	"importScripts",
]);
type ParserPlugins = NonNullable<NonNullable<Parameters<typeof parse>[1]>["plugins"]>;
/** Babel parser plugins per file type: JSX only where it is valid (`<string>x` is a TS cast). */
const parserPlugins = (path: string): ParserPlugins[] => {
	const typescript = /\.(?:tsx?|mts|cts)$/i.test(path);
	const jsx = /\.(?:jsx?|tsx|mjs)$/i.test(path);
	const base: ParserPlugins = [
		...(typescript ? (["typescript"] as const) : []),
		...(jsx ? (["jsx"] as const) : []),
	];
	// TypeScript's experimental decorators (Angular, Nest, Lit) first, then the standard ones.
	return [
		[...base, "decorators-legacy"],
[...base, ["decorators", { decoratorsBeforeExport: true }], "decoratorAutoAccessors"],
		[...base, ["decorators", { decoratorsBeforeExport: false }], "decoratorAutoAccessors"],
	];
};
const messageModule = (value: unknown): boolean =>
	typeof value === "string" &&
	/(?:^|\/)(?:messages(?:\/|\.|$)|paraglide(?:\/|$))/.test(value);

/** Conservative JS/TS/Svelte analysis. Unsupported files and object escapes withhold unused fixes. */
export const analyzeUsage: AnalyzeUsage = ({ files }) => {
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
	const used = new Set<string>();
	const issues: { path: string; reason: string }[] = [];
	const references: UsageReference[] = [];
	for (const file of files) {
		// Line starts for turning AST offsets into 1-based lines and 0-based columns.
		let lineStarts: number[] | undefined;
		const position = (offset: number) => {
			lineStarts ??= [
				0,
				...[...file.content.matchAll(/\n/g)].map((match) => match.index! + 1),
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
		/** Records where a message is used: the whole call when the reference is called. */
		const refer = (
			bundleId: string,
			node: Node,
			parent?: Node,
			key?: string
		) => {
			const target =
				parent &&
				(parent.type === "CallExpression" ||
					parent.type === "OptionalCallExpression") &&
				key === "callee"
					? parent
					: node;
			if (typeof target.start === "number" && typeof target.end === "number")
				references.push({
					bundleId,
					path: file.path,
					start: position(target.start),
					end: position(target.end),
				});
		};
		const unresolved = new Set<string>();
		if (!/\.(?:[jt]sx?|m[jt]s|svelte)$/i.test(file.path)) {
			issues.push({
				path: file.path,
				reason:
					"Unsupported source format. Supply ESM JavaScript, TypeScript or Svelte files.",
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
		let root: Node;
		let programs: Node[];
		try {
			if (/\.svelte$/i.test(file.path)) {
				root = parseSvelte(file.content, { modern: true }) as unknown as Node;
				const scripts = [root.module, root.instance].filter(isNode);
				programs = scripts.map((script) => script.content as Node);
				for (const script of scripts) {
					for (const attribute of script.attributes as Node[]) {
						if (attribute.name === "src")
							unresolved.add("External Svelte scripts cannot be analyzed.");
						if (attribute.name === "lang") {
							const value =
								Array.isArray(attribute.value) && attribute.value.length === 1
									? attribute.value[0]
									: undefined;
							if (
								!isNode(value) ||
								value.type !== "Text" ||
								!["js", "javascript", "ts", "typescript"].includes(
									value.data as string
								)
							)
								unresolved.add("Unsupported Svelte script language.");
						}
					}
				}
} else {
				let ast: Node | undefined;
				let failure: unknown;
				for (const plugins of parserPlugins(file.path)) {
					try {
						ast = parse(file.content, {
							sourceType: "module",
							plugins,
						}) as unknown as Node;
						break;
					} catch (error) {
						failure ??= error;
					}
				}
				if (!ast) throw failure;
				root = ast.program as Node;
				programs = [root];
			}
		} catch (error) {
			issues.push({
				path: file.path,
				reason: `Cannot parse source: ${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}
		// Overcounting shadowed names is intentional: it can retain a message,
		// whereas ignoring an ambiguous binding could delete one still in use.
const namespaces = new Set<string>(["m"]);
		// `import * as all`: Paraglide's messages.js has `export * as m from "./messages/_index.js"`,
		// so `all.m` is the message namespace too (and `all.hello` a message).
		const moduleNamespaces = new Set<string>();
		for (const statement of programs.flatMap(
			(program) => program.body as Node[]
		)) {
			if (statement.type === "ImportDeclaration") {
				const source = (statement.source as Node).value;
				if (statement.importKind === "type") continue;
				for (const specifier of statement.specifiers as Node[]) {
					if (specifier.importKind === "type") continue;
					const local = identifier(specifier.local);
					const imported =
						identifier(specifier.imported) ??
						(isNode(specifier.imported) ? specifier.imported.value : undefined);
					if (
						imported === "require" ||
						imported === "createRequire" ||
						source === "node:module" ||
						source === "module"
					)
						unresolved.add("CommonJS loader references are unsupported.");
if (
						local &&
						(imported === "m" || specifier.type === "ImportNamespaceSpecifier")
					) {
						namespaces.add(local);
						if (specifier.type === "ImportNamespaceSpecifier")
							moduleNamespaces.add(local);
					}
					// Retain imported function names even from custom module paths.
					// This can retain unrelated/unused imports but cannot delete a use.
					else if (
						specifier.type === "ImportSpecifier" &&
						typeof imported === "string"
					)
						used.add(imported);
					else if (messageModule(source))
						unresolved.add("Unsupported message import.");
				}
			}
			if (
				statement.type === "ExportAllDeclaration" ||
				(statement.type === "ExportNamedDeclaration" &&
					isNode(statement.source))
			)
				unresolved.add(
					"Messages are re-exported; downstream usage cannot be resolved."
				);
		}
		const stack: { node: Node; parent?: Node; key?: string }[] = [
			{ node: root },
		];
		while (stack.length) {
			const { node, parent, key } = stack.pop()!;
			if (node.type === "ImportDeclaration") continue;
			const staticProperty =
				parent &&
				(parent.type === "MemberExpression" ||
					parent.type === "OptionalMemberExpression") &&
				key === "property" &&
				!parent.computed;
			if (
				node.type === "Identifier" &&
				globalObjects.has(node.name as string)
			) {
				const isStaticMemberObject =
					parent &&
					(parent.type === "MemberExpression" ||
						parent.type === "OptionalMemberExpression") &&
					key === "object" &&
					staticMemberName(parent) !== undefined;
				if (
					!isStaticMemberObject &&
					!(
						parent?.type === "UnaryExpression" && parent.operator === "typeof"
					) &&
					!staticProperty &&
					!(parent && key === "key" && !parent.computed && !parent.shorthand)
				)
					unresolved.add(
						"A global object is accessed dynamically or passed as a value."
					);
			}
			const memberObject = isNode(node.object)
				? identifier(node.object)
				: undefined;
			const timerReference =
				(node.type === "Identifier" &&
					timers.has(node.name as string) &&
					!staticProperty &&
					!(
						parent &&
						key === "key" &&
						!parent.computed &&
						!parent.shorthand
					)) ||
				((node.type === "MemberExpression" ||
					node.type === "OptionalMemberExpression") &&
					timers.has(staticMemberName(node) ?? "") &&
					(!memberObject || !namespaces.has(memberObject)));
			if (timerReference) {
				const directCall =
					parent &&
					(parent.type === "CallExpression" ||
						parent.type === "OptionalCallExpression") &&
					key === "callee";
				const handler = directCall
					? (parent.arguments as Node[])[0]
					: undefined;
				if (
					!isNode(handler) ||
					!["FunctionExpression", "ArrowFunctionExpression"].includes(
						handler.type
					)
				)
					unresolved.add(
						"Timer handlers may evaluate source strings; only inline function handlers can be resolved."
					);
			}
			const objectKey =
				parent && key === "key" && !parent.computed && !parent.shorthand;
			if (
				node.type === "Identifier" &&
				!staticProperty &&
				!objectKey &&
				[
					"require",
					"createRequire",
					"module",
					"exports",
					"eval",
					"Function",
				].includes(node.name as string)
			)
				unresolved.add(
					"CommonJS loader or dynamically evaluated code cannot be analyzed."
				);
			if (
				node.type === "TSImportEqualsDeclaration" ||
				node.type === "TSExportAssignment"
			)
				unresolved.add(
					"CommonJS TypeScript imports and exports are unsupported."
				);
			// Type-level references do not execute. Keep all runtime TS constructs,
			// including namespaces, enums and parameter-property initializers.
			if (
				node.type.startsWith("TS") &&
				![
					"TSAsExpression",
					"TSSatisfiesExpression",
					"TSNonNullExpression",
					"TSTypeAssertion",
					"TSInstantiationExpression",
					"TSExportAssignment",
					"TSModuleDeclaration",
					"TSModuleBlock",
					"TSEnumDeclaration",
					"TSEnumMember",
					"TSParameterProperty",
					"TSImportEqualsDeclaration",
				].includes(node.type)
			) {
				// `typeof m.label` in a type keeps the message: deleting it breaks the build. So do
				// `typeof all.m.label` and `(typeof m)["label"]`; any other `typeof` of a message
				// namespace (`keyof typeof m`, `typeof all`) can depend on every message.
				const types: { type: Node; parent?: Node; key?: string }[] = [{ type: node }];
				while (types.length) {
					const { type, parent: typeParent, key: typeKey } = types.pop()!;
					if (type.type === "TSTypeQuery" && isNode(type.exprName)) {
						// the identifiers of `typeof a.b.c`, root first
						const path: (string | undefined)[] = [];
						let name: unknown = type.exprName;
						while (isNode(name) && name.type === "TSQualifiedName") {
							path.unshift(identifier(name.right));
							name = name.left;
						}
						path.unshift(identifier(name));
						const [root, first] = path;
						if (root !== undefined && namespaces.has(root)) {
							// the members after the message namespace: `m.x` -> [x], `all.m.x` -> [x]
							const nested = moduleNamespaces.has(root) && first === "m";
							const members = nested ? path.slice(2) : path.slice(1);
							if (first !== undefined) used.add(first);
							const indexed =
								typeParent?.type === "TSIndexedAccessType" &&
								typeKey === "objectType" &&
								isNode(typeParent.indexType) &&
								typeParent.indexType.type === "TSLiteralType" &&
								isNode(typeParent.indexType.literal) &&
								typeof typeParent.indexType.literal.value === "string"
									? (typeParent.indexType.literal.value as string)
									: undefined;
							if (members.length === 1 && members[0] !== undefined) {
								used.add(members[0]);
								refer(members[0], type.exprName as Node);
							} else if (members.length === 0 && indexed !== undefined) {
								used.add(indexed);
								refer(indexed, typeParent!);
							} else
								unresolved.add(
									"A type depends on a message namespace (keyof typeof m, typeof all, …)."
								);
						}
					}
					for (const [childKey, value] of Object.entries(type))
						for (const child of Array.isArray(value) ? value : [value])
							if (isNode(child))
								// `(typeof m)["x"]`: parentheses are transparent
								types.push(
									type.type === "TSParenthesizedType"
										? { type: child, parent: typeParent, key: typeKey }
										: { type: child, parent: type, key: childKey }
								);
				}
				continue;
			}
			if (node.type === "ObjectPattern") {
				for (const property of node.properties as Node[]) {
					const name = staticMemberName({
						type: "MemberExpression",
						computed: property.computed,
						property: property.key,
					});
					if (
						name === "m" ||
						(name !== undefined &&
							(globalAliases.has(name) || timers.has(name))) ||
						[
							"require",
							"createRequire",
							"eval",
							"Function",
							"constructor",
						].includes(name ?? "")
					)
						unresolved.add(
							"A destructured message namespace, loader or evaluator cannot be resolved."
						);
				}
			}
if (
				node.type === "MetaProperty" &&
				identifier(node.meta) === "import" &&
				identifier(node.property) === "meta"
			) {
				const property =
					parent &&
					(parent.type === "MemberExpression" ||
						parent.type === "OptionalMemberExpression") &&
					key === "object"
						? staticMemberName(parent)
						: undefined;
				if (!property || !importMetaProperties.has(property))
					unresolved.add(
						"import.meta.glob and other import.meta loaders can load message modules by computed names."
					);
			}
			if (
				node.type === "Identifier" &&
				moduleLoaders.has(node.name as string) &&
				!staticProperty &&
				!objectKey
			)
				unresolved.add("Bundler module loaders cannot be resolved.");
			// `import.meta.hot.accept("./paraglide/messages.js", (mod) => …)` hands the callback the
			// modules it names; accepting itself (`accept()`, `accept(cb)`) does not.
			if (
				(node.type === "CallExpression" ||
					node.type === "OptionalCallExpression") &&
				isNode(node.callee) &&
				(node.callee.type === "MemberExpression" ||
					node.callee.type === "OptionalMemberExpression") &&
				staticMemberName(node.callee) === "accept" &&
				isNode(node.callee.object) &&
				(node.callee.object.type === "MemberExpression" ||
					node.callee.object.type === "OptionalMemberExpression") &&
				staticMemberName(node.callee.object) === "hot" &&
				isNode(node.callee.object.object) &&
				node.callee.object.object.type === "MetaProperty"
			) {
				const first = (node.arguments as Node[])[0];
				if (
					isNode(first) &&
					!["FunctionExpression", "ArrowFunctionExpression"].includes(first.type)
				)
					unresolved.add(
						"import.meta.hot.accept with dependencies hands their modules to a callback."
					);
			}
			if (node.type === "ImportExpression")
				unresolved.add("Dynamic message imports cannot be resolved.");
			if (
				node.type === "CallExpression" &&
				(identifier(node.callee) === "require" ||
					(isNode(node.callee) && node.callee.type === "Import"))
			) {
				unresolved.add(
					"Dynamic ESM imports cannot be resolved; CommonJS require is unsupported."
				);
			}
			if (
				[
					"Component",
					"UseDirective",
					"TransitionDirective",
					"AnimateDirective",
				].includes(node.type) &&
				typeof node.name === "string"
			) {
const [namespace, member, nested] = node.name.split(".");
				if (namespace && namespaces.has(namespace)) {
					if (member) {
						used.add(member);
						refer(member, node);
					}
					// `<all.m.card />`: the message namespace of a namespace import
					const isNested = member === "m" && moduleNamespaces.has(namespace);
					if (isNested && nested) {
						used.add(nested);
						refer(nested, node);
					}
					if (!member || (isNested && !nested))
						unresolved.add(
							"A Svelte message namespace escapes through a component or directive."
						);
				}
			}
if (
				node.type === "JSXMemberExpression" &&
				isNode(node.object) &&
				node.object.type === "JSXIdentifier" &&
				namespaces.has(node.object.name as string)
			) {
				if (isNode(node.property)) {
					used.add(node.property.name as string);
					refer(node.property.name as string, node);
					// `<all.m />` passes the message namespace of a namespace import as a component
					if (
						node.property.name === "m" &&
						moduleNamespaces.has(node.object.name as string) &&
						!(parent?.type === "JSXMemberExpression" && key === "object")
					)
						unresolved.add("A JSX message namespace cannot be resolved.");
				}
			}
			// `<all.m.card />`
			if (
				node.type === "JSXMemberExpression" &&
				isNode(node.object) &&
				node.object.type === "JSXMemberExpression" &&
				isNode(node.object.object) &&
				node.object.object.type === "JSXIdentifier" &&
				moduleNamespaces.has(node.object.object.name as string) &&
				isNode(node.object.property) &&
				node.object.property.name === "m" &&
				isNode(node.property)
			) {
				used.add(node.property.name as string);
				refer(node.property.name as string, node);
			}
			if (
				node.type === "JSXIdentifier" &&
				namespaces.has(node.name as string) &&
				// the object of a member is handled above, a property or attribute name is no reference
				parent?.type !== "JSXMemberExpression" &&
				!(parent?.type === "JSXAttribute" && key === "name")
			)
				unresolved.add("A JSX message namespace cannot be resolved.");
			if (
				node.type === "MemberExpression" ||
				node.type === "OptionalMemberExpression"
			) {
				const object = identifier(node.object);
				const propertyName = staticMemberName(node);
				if (
					(!object || !namespaces.has(object)) &&
					propertyName !== undefined &&
					[
						"require",
						"createRequire",
						"eval",
						"Function",
						"constructor",
					].includes(propertyName)
				)
					unresolved.add(
						"CommonJS loader or dynamically evaluated code references are unsupported."
					);
				if (
					propertyName &&
					globalAliases.has(propertyName) &&
					(!object || !namespaces.has(object))
				)
					unresolved.add("A possible global object alias cannot be resolved.");
if (object && namespaces.has(object)) {
					const id = propertyName;
					if (id === undefined)
						unresolved.add("Dynamic message access cannot be resolved.");
					else {
						used.add(id);
						refer(id, node, parent, key);
					}
					// `all.m` of a namespace import is the message namespace: its members are
					// messages (below); used any other way (aliased, destructured, passed) it escapes.
					const isMember =
						parent &&
						(parent.type === "MemberExpression" ||
							parent.type === "OptionalMemberExpression") &&
						key === "object";
					const isCallee =
						parent &&
						(parent.type === "CallExpression" ||
							parent.type === "OptionalCallExpression") &&
						key === "callee";
					if (id === "m" && moduleNamespaces.has(object) && !isMember && !isCallee)
						unresolved.add(
							"A message namespace is aliased, exported, destructured, or passed as a value."
						);
				}
				// `import.meta.hot` only as `import.meta.hot.x`: an alias could call accept(deps, cb) unseen
				if (
					isNode(node.object) &&
					node.object.type === "MetaProperty" &&
					propertyName === "hot" &&
					!(
						parent &&
						(parent.type === "MemberExpression" ||
							parent.type === "OptionalMemberExpression") &&
						key === "object"
					)
				)
					unresolved.add(
						"An aliased import.meta.hot can hand message modules to a callback."
					);
				// `all.m.hello`, `all.m["hello"]`, `all?.m?.hello`
				const inner = node.object;
				if (
					isNode(inner) &&
					(inner.type === "MemberExpression" ||
						inner.type === "OptionalMemberExpression") &&
					moduleNamespaces.has(identifier(inner.object) ?? "") &&
					staticMemberName(inner) === "m"
				) {
					if (propertyName === undefined)
						unresolved.add("Dynamic message access cannot be resolved.");
					else {
						used.add(propertyName);
						refer(propertyName, node, parent, key);
					}
				}
				// Nested/global message namespaces require binding graph analysis.
				if (propertyName === "m" && (!object || !namespaces.has(object)))
					unresolved.add("An indirect message namespace cannot be resolved.");
			}
			if (node.type === "Identifier" && namespaces.has(node.name as string)) {
				const isMemberObject =
					parent &&
					(parent.type === "MemberExpression" ||
						parent.type === "OptionalMemberExpression") &&
					key === "object";
				const isPropertyName =
					parent && !parent.computed && key === "key" && !parent.shorthand;
				const isMemberProperty =
					parent &&
					(parent.type === "MemberExpression" ||
						parent.type === "OptionalMemberExpression") &&
					key === "property" &&
					!parent.computed;
				if (!isMemberObject && !isPropertyName && !isMemberProperty)
					unresolved.add(
						"A message namespace is aliased, exported, destructured, or passed as a value."
					);
			}
			for (const [childKey, value] of Object.entries(node)) {
				if (
					childKey === "css" ||
					childKey === "loc" ||
					childKey === "comments" ||
					childKey.endsWith("Comments")
				)
					continue;
				if (isNode(value))
					stack.push({ node: value, parent: node, key: childKey });
				else if (Array.isArray(value))
					for (const child of value)
						if (isNode(child))
							stack.push({ node: child, parent: node, key: childKey });
			}
		}
		for (const reason of unresolved) issues.push({ path: file.path, reason });
	}
	return {
		usedBundleIds: [...used],
		status: issues.length ? "incomplete" : "complete",
		issues,
		references,
	} satisfies UsageAnalysis;
};
