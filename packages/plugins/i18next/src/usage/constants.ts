import type { SourceFile } from "@inlang/sdk";
import {
	isNode,
	keyName,
	parseScript,
	patternNames,
	propertyName,
	SCRIPT,
	stringValue,
	walk,
	type Node,
} from "./ast.js";

/**
 * Resolves keys that are written as constants:
 *
 * ```ts
 * const TITLE = "home.title";
 * export const KEYS = { save: "actions.save" } as const;
 * t(TITLE);
 * t(KEYS.save);
 * t(`${PREFIX}.title`);
 * ```
 *
 * A name resolves only when every binding of it in the file is a `const` with a static
 * value, or a named import of such a `const` from a file of the source snapshot. Anything
 * else (`let`, a parameter, a call, a package, a barrel re-export) is dynamic.
 */

/** What a constant holds: strings, or an object of constants. */
export type Tree =
	| { type: "strings"; values: string[] }
	| { type: "object"; props: Map<string, Tree> };
/** The constants a name can stand for. `undefined`: it can be anything. */
export type Lookup = (name: string) => Tree[] | undefined;

/** Template literals and conditionals can multiply: more than this is treated as dynamic. */
const MAX_STRINGS = 64;

const MEMBER = new Set(["MemberExpression", "OptionalMemberExpression"]);
const TS_WRAPPERS = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"ParenthesizedExpression",
	"TypeCastExpression",
]);

/** The constants an identifier or a member chain such as `KEYS.nav.home` stands for. */
function referenced(node: unknown, lookup: Lookup): Tree[] | undefined {
	if (!isNode(node)) return undefined;
	if (TS_WRAPPERS.has(node.type)) return referenced(node.expression, lookup);
	if (node.type === "Identifier") return lookup(node.name as string);
	if (!MEMBER.has(node.type)) return undefined;
	const objects = referenced(node.object, lookup);
	const name = propertyName(node);
	if (!objects || name === undefined) return undefined;
	const result: Tree[] = [];
	for (const object of objects) {
		const value = object.type === "object" ? object.props.get(name) : undefined;
		if (!value) return undefined;
		result.push(value);
	}
	return result;
}

/** The value of an expression that can only be one of a few strings. `undefined`: it is dynamic. */
export function staticStrings(
	node: unknown,
	lookup?: Lookup
): string[] | undefined {
	if (!isNode(node)) return undefined;
	const text = stringValue(node);
	if (text !== undefined) return [text];
	if (TS_WRAPPERS.has(node.type)) return staticStrings(node.expression, lookup);
	switch (node.type) {
		case "ArrayExpression": {
			const parts = (node.elements as unknown[]).map((element) =>
				staticStrings(element, lookup)
			);
			return parts.some((part) => part === undefined)
				? undefined
				: (parts.flat() as string[]);
		}
		case "ConditionalExpression": {
			const a = staticStrings(node.consequent, lookup);
			const b = staticStrings(node.alternate, lookup);
			return a && b ? [...a, ...b] : undefined;
		}
		case "LogicalExpression": {
			const a = staticStrings(node.left, lookup);
			const b = staticStrings(node.right, lookup);
			return a && b ? [...a, ...b] : undefined;
		}
		case "TemplateLiteral": {
			const quasis = node.quasis as Node[];
			const expressions = node.expressions as unknown[];
			let results = [""];
			for (let index = 0; index < quasis.length; index++) {
				const cooked = (quasis[index]!.value as { cooked?: string }).cooked;
				if (cooked === undefined) return undefined;
				results = results.map((result) => result + cooked);
				if (index < expressions.length) {
					const values = staticStrings(expressions[index], lookup);
					if (!values) return undefined;
					results = results.flatMap((result) =>
						values.map((value) => result + value)
					);
					if (results.length > MAX_STRINGS) return undefined;
				}
			}
			return results;
		}
		case "Identifier":
		case "MemberExpression":
		case "OptionalMemberExpression": {
			const trees = lookup ? referenced(node, lookup) : undefined;
			if (!trees) return undefined;
			const values: string[] = [];
			for (const tree of trees) {
				if (tree.type !== "strings") return undefined;
				values.push(...tree.values);
			}
			return values.length > MAX_STRINGS ? undefined : values;
		}
		default:
			return undefined;
	}
}

/** What a `const` or an `enum` declares. */
function treeOf(node: unknown, lookup: Lookup, depth = 0): Tree | undefined {
	if (!isNode(node) || depth > 6) return undefined;
	const values = staticStrings(node, lookup);
	if (values) return { type: "strings", values };
	if (TS_WRAPPERS.has(node.type)) return treeOf(node.expression, lookup, depth);
	if (node.type === "ObjectExpression") {
		const props = new Map<string, Tree>();
		for (const property of node.properties as Node[]) {
			if (property.type !== "ObjectProperty") continue;
			const name = keyName(property);
			const tree =
				name === undefined
					? undefined
					: treeOf(property.value, lookup, depth + 1);
			if (name !== undefined && tree) props.set(name, tree);
		}
		return { type: "object", props };
	}
	if (node.type === "TSEnumDeclaration") {
		const props = new Map<string, Tree>();
		for (const member of node.members as Node[]) {
			const id = member.id as Node;
			const name =
				id.type === "Identifier" ? (id.name as string) : stringValue(id);
			const strings = staticStrings(member.initializer, lookup);
			if (name !== undefined && strings)
				props.set(name, { type: "strings", values: strings });
		}
		return { type: "object", props };
	}
	return undefined;
}

type Bindings = {
	/** `const` names with the nodes that initialize them (an enum is its own node). */
	declarations: Map<string, Node[]>;
	/** Names with a binding that is not a static `const`: `let`, parameters, imports of anything else. */
	dynamic: Set<string>;
	/** Named imports: local name to the module and the name it exports. */
	imports: Map<string, { source: string; name: string }>;
	/** Top-level exports: exported name to local name. */
	exported: Map<string, string>;
};

function collectBindings(program: Node): Bindings {
	const bindings: Bindings = {
		declarations: new Map(),
		dynamic: new Set(),
		imports: new Map(),
		exported: new Map(),
	};
	const declare = (name: string, node: Node) =>
		bindings.declarations.set(name, [
			...(bindings.declarations.get(name) ?? []),
			node,
		]);
	const dynamicNames = (pattern: unknown) => {
		for (const name of patternNames(pattern)) bindings.dynamic.add(name);
	};
	walk(program, (node) => {
		switch (node.type) {
			case "VariableDeclaration":
				for (const declarator of node.declarations as Node[]) {
					const id = declarator.id as Node;
					if (
						node.kind === "const" &&
						id.type === "Identifier" &&
						declarator.init
					)
						declare(id.name as string, declarator.init as Node);
					else dynamicNames(id);
				}
				break;
			case "TSEnumDeclaration":
				declare((node.id as Node).name as string, node);
				break;
			case "FunctionDeclaration":
			case "FunctionExpression":
			case "ClassDeclaration":
			case "ClassExpression":
				if (isNode(node.id)) dynamicNames(node.id);
				break;
			case "CatchClause":
				dynamicNames(node.param);
				break;
			case "ImportDeclaration":
				for (const specifier of node.specifiers as Node[]) {
					const local = (specifier.local as Node).name as string;
					if (specifier.type === "ImportSpecifier") {
						const imported = specifier.imported as Node;
						bindings.imports.set(local, {
							source: stringValue(node.source) ?? "",
							name: (imported.name ?? imported.value) as string,
						});
					} else bindings.dynamic.add(local);
				}
				break;
			default:
				break;
		}
		if (Array.isArray(node.params))
			for (const param of node.params as unknown[]) dynamicNames(param);
	});
	for (const statement of program.body as Node[]) {
		if (statement.type !== "ExportNamedDeclaration") continue;
		const declaration = statement.declaration as Node | null | undefined;
		if (
			declaration?.type === "VariableDeclaration" &&
			declaration.kind === "const"
		) {
			for (const declarator of declaration.declarations as Node[])
				for (const name of patternNames(declarator.id))
					bindings.exported.set(name, name);
		} else if (declaration?.type === "TSEnumDeclaration") {
			const name = (declaration.id as Node).name as string;
			bindings.exported.set(name, name);
		}
		if (!statement.source)
			for (const specifier of statement.specifiers as Node[]) {
				if (specifier.type !== "ExportSpecifier") continue;
				const exported = specifier.exported as Node;
				bindings.exported.set(
					(exported.name ?? exported.value) as string,
					(specifier.local as Node).name as string
				);
			}
	}
	return bindings;
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

/** `a/./b/../c` to `a/c`. */
export function normalizePath(path: string): string {
	const parts: string[] = [];
	for (const part of path.replace(/\\/g, "/").split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") parts.pop();
		else parts.push(part);
	}
	return parts.join("/");
}

/** Resolves constants across the files of a source snapshot. */
export function createResolver(files: readonly SourceFile[]) {
	const byPath = new Map<string, SourceFile>();
	for (const file of files) byPath.set(normalizePath(file.path), file);
	const exportsCache = new Map<string, Map<string, Tree[] | undefined>>();
	const parsing = new Set<string>();
	const aliasCache = new Map<string, string | undefined>();

	/** The files a module path can mean, with and without the extension. */
	const candidates = (base: string) => {
		const stripped = base.replace(/\.(?:[mc]?js|jsx)$/, "");
		return [base, ...(stripped === base ? [] : [stripped])].flatMap((path) => [
			path,
			...EXTENSIONS.map((extension) => path + extension),
			...EXTENSIONS.map((extension) => `${path}/index${extension}`),
		]);
	};
	const resolveSource = (from: string, source: string): string | undefined => {
		if (source.startsWith(".")) {
			const directory = from.split("/").slice(0, -1).join("/");
			return candidates(normalizePath(`${directory}/${source}`)).find((path) =>
				byPath.has(path)
			);
		}
		// `@/keys`: the root is unknown, so only a file with a unique tail matches
		if (/^[@~#]\//.test(source)) {
			if (aliasCache.has(source)) return aliasCache.get(source);
			const wanted = candidates(normalizePath(source.slice(2)));
			const matches = [...byPath.keys()].filter((path) =>
				wanted.some((tail) => path === tail || path.endsWith(`/${tail}`))
			);
			const result = matches.length === 1 ? matches[0] : undefined;
			aliasCache.set(source, result);
			return result;
		}
		return undefined;
	};

	function exportsOf(path: string, name: string): Tree[] | undefined {
		let exports = exportsCache.get(path);
		if (!exports) {
			// two files that import each other
			if (parsing.has(path)) return undefined;
			parsing.add(path);
			exports = new Map();
			try {
				const file = byPath.get(path);
				if (file && SCRIPT.test(path) && !/\.c[jt]s$/i.test(path)) {
					let program: Node | undefined;
					try {
						program = parseScript(path, file.content);
					} catch {
						program = undefined;
					}
					if (program) {
						const scope = scopeOf(path, program);
						for (const [exported, local] of scope.bindings.exported)
							exports.set(exported, scope.lookup(local));
					}
				}
			} finally {
				parsing.delete(path);
			}
			exportsCache.set(path, exports);
		}
		return exports.get(name);
	}

	function scopeOf(path: string, program: Node) {
		const bindings = collectBindings(program);
		const resolve = (
			name: string,
			seen: readonly string[]
		): Tree[] | undefined => {
			if (bindings.dynamic.has(name) || seen.includes(name)) return undefined;
			const declarations = bindings.declarations.get(name);
			const imported = bindings.imports.get(name);
			if (declarations && imported) return undefined;
			if (declarations) {
				const trees: Tree[] = [];
				for (const declaration of declarations) {
					const tree = treeOf(declaration, (other) =>
						resolve(other, [...seen, name])
					);
					if (!tree) return undefined;
					trees.push(tree);
				}
				return trees;
			}
			if (imported) {
				const target = resolveSource(path, imported.source);
				return target ? exportsOf(target, imported.name) : undefined;
			}
			return undefined;
		};
		return {
			bindings,
			lookup: ((name) => resolve(name, [])) satisfies Lookup,
		};
	}

	return { scopeOf };
}
