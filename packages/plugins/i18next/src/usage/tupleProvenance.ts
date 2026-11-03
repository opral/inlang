import type { SourceFile } from "@inlang/sdk";
import {
	isNode,
	keyName,
	parseScript,
	patternNames,
	propertyName,
	SCRIPT,
	stringValue,
	unwrap,
	walk,
	type Node,
} from "./ast.js";
import { normalizePath } from "./constants.js";

/** Unknown is deliberately distinct from data: opaque custom hooks can return translators. */
export type TupleKind = "translator" | "data" | "unknown";
type Value =
	| { kind: "data" | "translator" | "unknown" }
	| { kind: "tuple"; elements: Value[] }
	| { kind: "object"; properties: Map<string, Value> }
	| { kind: "function"; node: Node; module: Module }
	| { kind: "module"; module: Module }
	| { kind: "api"; source: string; name: string };
type Binding = {
	expression?: Node;
	selection: string[];
	module: Module;
	owner: Scope;
	imported?: { source: string; name: string };
	mutable?: boolean;
	escaped?: boolean;
	tuple: boolean;
};
type Scope = {
	parent?: Scope;
	names: Map<string, Binding>;
	functionScope: boolean;
};
type Module = {
	path: string;
	program: Node;
	scopes: Map<Node, Scope>;
	root: Scope;
	declarations: Set<Node>;
	bindings: Binding[];
	references: Map<Binding, { node: Node; parent?: Node; key?: string }[]>;
};
const unknown: Value = { kind: "unknown" };
const data: Value = { kind: "data" };
const translator: Value = { kind: "translator" };
const calls = new Set(["CallExpression", "OptionalCallExpression"]);
const members = new Set(["MemberExpression", "OptionalMemberExpression"]);
const blocks = new Set([
	"BlockStatement",
	"CatchClause",
	"ForStatement",
	"ForInStatement",
	"ForOfStatement",
	"SwitchStatement",
	"ClassDeclaration",
	"ClassExpression",
	"StaticBlock",
	"TSModuleBlock",
]);
const extensions = [
	"",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".mts",
	"/index.ts",
	"/index.tsx",
	"/index.js",
];

/** A bounded source-only analysis. No package loading, execution or TypeScript checker. */
export function createTupleProvenance(files: readonly SourceFile[]) {
	const sources = new Map(
		files.map((file) => [normalizePath(file.path), file])
	);
	const modules = new Map<string, Module | undefined>();
	const resolve = (from: string, source: string) => {
		if (!source.startsWith(".")) return undefined;
		const base = normalizePath(
			`${from.split("/").slice(0, -1).join("/")}/${source}`
		);
		return [base, base.replace(/\.(?:m?js|jsx)$/, "")]
			.flatMap((path) => extensions.map((extension) => path + extension))
			.find((path) => sources.has(path));
	};
	const bindingAt = (
		module: Module,
		node: Node,
		name: string
	): Binding | undefined => {
		for (let scope = module.scopes.get(node); scope; scope = scope.parent)
			if (scope.names.has(name)) return scope.names.get(name);
		return undefined;
	};
	function moduleOf(path: string, program?: Node): Module | undefined {
		path = normalizePath(path);
		if (
			modules.has(path) &&
			(!program || modules.get(path)?.program === program)
		)
			return modules.get(path);
		if (!program) {
			const source = sources.get(path);
			if (!source || !SCRIPT.test(path) || /\.c[jt]s$/i.test(path))
				return undefined;
			try {
				program = parseScript(path, source.content);
			} catch {
				return undefined;
			}
		}
		const root: Scope = { names: new Map(), functionScope: true };
		const parents = new Map<Node, Node>();
		const module: Module = {
			path,
			program,
			root,
			scopes: new Map(),
			declarations: new Set(),
			bindings: [],
			references: new Map(),
		};
		modules.set(path, module);
		const declare = (
			pattern: unknown,
			expression: Node | undefined,
			scope: Scope,
			selection: string[] = [],
			tuple = false
		) => {
			if (!isNode(pattern)) return;
			module.declarations.add(pattern);
			if (pattern.type === "TSParameterProperty") {
				declare(pattern.parameter, undefined, scope);
				return;
			}
			if (pattern.type === "Identifier") {
				let owner = scope;
				while (!owner.functionScope && owner.parent) owner = owner.parent;
				const binding: Binding = {
					expression,
					selection,
					module,
					tuple,
					owner,
				};
				if (scope.names.has(pattern.name as string)) binding.mutable = true;
				scope.names.set(pattern.name as string, binding);
				module.bindings.push(binding);
			} else if (pattern.type === "ArrayPattern") {
				(pattern.elements as unknown[]).forEach((part, index) =>
					declare(part, expression, scope, [...selection, String(index)], true)
				);
			} else if (pattern.type === "ObjectPattern") {
				for (const property of pattern.properties as Node[]) {
					module.declarations.add(property);
					declare(
						property.value ?? property.argument,
						property.type === "ObjectProperty" ? expression : undefined,
						scope,
						[
							...selection,
							property.type === "ObjectProperty"
								? (keyName(property) ?? "?")
								: "?",
						],
						tuple
					);
				}
			} else if (
				pattern.type === "AssignmentPattern" ||
				pattern.type === "RestElement"
			) {
				// Defaults and rests can select another value; do not infer data from the initializer alone.
				declare(
					pattern.left ?? pattern.argument,
					undefined,
					scope,
					selection,
					tuple
				);
			}
		};
		walk(program, (node, parent) => {
			if (parent) parents.set(node, parent);
			const outer = parent ? (module.scopes.get(parent) ?? root) : root;
			const fn = Array.isArray(node.params);
			const scope: Scope =
				fn || blocks.has(node.type)
					? {
							parent: outer,
							names: new Map(),
							functionScope:
								fn ||
								node.type === "StaticBlock" ||
								node.type === "TSModuleBlock",
						}
					: outer;
			module.scopes.set(node, scope);
			if (node.type === "VariableDeclarator") {
				let target = scope;
				if (parent?.kind === "var")
					while (!target.functionScope && target.parent) target = target.parent;
				declare(node.id, unwrap(node.init), target);
			} else if (node.type === "FunctionDeclaration")
				declare(node.id, node, outer);
			else if (node.type === "FunctionExpression" && node.id)
				declare(node.id, node, scope);
			else if (
				node.type === "ClassDeclaration" ||
				node.type === "ClassExpression" ||
				node.type === "TSModuleDeclaration"
			)
				declare(
					node.id,
					undefined,
					node.type === "ClassExpression" ? scope : outer
				);
			if (fn)
				for (const param of node.params as Node[])
					declare(param, undefined, scope);
			if (node.type === "CatchClause") declare(node.param, undefined, scope);
			if (node.type === "ImportDeclaration")
				for (const specifier of node.specifiers as Node[]) {
					declare(specifier.local, undefined, scope);
					const binding = scope.names.get(
						(specifier.local as Node).name as string
					)!;
					binding.imported = {
						source: stringValue(node.source) ?? "",
						name:
							specifier.type === "ImportSpecifier"
								? (((specifier.imported as Node).name ??
										(specifier.imported as Node).value) as string)
								: specifier.type === "ImportDefaultSpecifier"
									? "default"
									: "*",
					};
				}
		});
		const inFreshReturn = (node: Node) => {
			let current = node;
			for (
				let parent = parents.get(current);
				parent;
				parent = parents.get(current)
			) {
				if (
					parent.type === "ReturnStatement" ||
					(parent.type === "ArrowFunctionExpression" && parent.body === current)
				)
					return true;
				if (
					![
						"ArrayExpression",
						"ObjectExpression",
						"ObjectProperty",
						"TSAsExpression",
						"TSSatisfiesExpression",
						"TSNonNullExpression",
						"ParenthesizedExpression",
					].includes(parent.type)
				)
					return false;
				current = parent;
			}
			return false;
		};
		walk(program, (node, parent, key) => {
			if (node.type !== "Identifier" || module.declarations.has(node)) return;
			if (
				(parent &&
					members.has(parent.type) &&
					key === "property" &&
					!parent.computed) ||
				(parent?.type === "ObjectProperty" && key === "key" && !parent.computed)
			)
				return;
			const binding = bindingAt(module, node, node.name as string);
			if (!binding) return;
			let owner = module.scopes.get(node)!;
			while (!owner.functionScope && owner.parent) owner = owner.parent;
			if (owner !== binding.owner) binding.escaped = true;
			if (
				(parent?.type === "AssignmentExpression" && key === "left") ||
				parent?.type === "UpdateExpression"
			)
				binding.mutable = true;
			if (
				(parent && calls.has(parent.type) && key === "arguments") ||
				(parent?.type === "VariableDeclarator" && key === "init") ||
				(parent?.type === "AssignmentExpression" && key === "right") ||
				parent?.type === "ExportSpecifier" ||
				((parent?.type === "ArrayExpression" ||
					(parent?.type === "ObjectProperty" && key === "value")) &&
					!inFreshReturn(node)) ||
				parent?.type === "SpreadElement"
			)
				binding.escaped = true;
			const references = module.references.get(binding) ?? [];
			references.push({ node, parent, key });
			module.references.set(binding, references);
		});
		walk(program, (node) => {
			if (
				![
					"AssignmentExpression",
					"UpdateExpression",
					"ForInStatement",
					"ForOfStatement",
				].includes(node.type)
			)
				return;
			const mark = (pattern: unknown) => {
				const target = unwrap(pattern);
				if (!target) return;
				if (members.has(target.type)) {
					mark(target.object);
					return;
				}
				if (target.type === "Identifier") {
					const binding = bindingAt(module, target, target.name as string);
					if (binding) binding.mutable = true;
				} else if (target.type === "ArrayPattern")
					for (const item of target.elements as unknown[]) mark(item);
				else if (target.type === "ObjectPattern")
					for (const item of target.properties as Node[])
						mark(item.value ?? item.argument);
				else if (
					target.type === "AssignmentPattern" ||
					target.type === "RestElement"
				)
					mark(target.left ?? target.argument);
			};
			mark(node.left ?? node.argument);
		});
		for (const statement of program.body as Node[]) {
			if (statement.type !== "ExportNamedDeclaration") continue;
			const declaration = statement.declaration as Node | undefined;
			if (declaration?.type === "VariableDeclaration")
				for (const item of declaration.declarations as Node[])
					for (const name of patternNames(item.id)) {
						const binding = root.names.get(name);
						if (binding) binding.escaped = true;
					}
		}
		return module;
	}
	function selected(value: Value, selection: readonly string[]): Value {
		for (const key of selection)
			value =
				value.kind === "tuple"
					? (value.elements[Number(key)] ?? unknown)
					: value.kind === "object"
						? (value.properties.get(key) ?? unknown)
						: unknown;
		return value;
	}
	const kindOf = (value: Value): TupleKind =>
		value.kind === "translator"
			? "translator"
			: value.kind === "data"
				? "data"
				: value.kind === "object"
					? [...value.properties.values()].every(
							(part) => kindOf(part) === "data"
						)
						? "data"
						: "unknown"
					: value.kind === "tuple"
						? value.elements.every((part) => kindOf(part) === "data")
							? "data"
							: "unknown"
						: "unknown";
	function exported(
		imported: Module,
		name: string,
		depth: number,
		seen: Set<Binding>,
		budget: { left: number }
	): Value {
		if (depth > 12 || --budget.left < 0) return unknown;
		for (const statement of imported.program.body as Node[]) {
			if (name === "default" && statement.type === "ExportDefaultDeclaration")
				return evaluate(
					statement.declaration,
					imported,
					depth + 1,
					seen,
					budget
				);
			if (statement.type !== "ExportNamedDeclaration" || statement.source)
				continue;
			const declaration = statement.declaration as Node | undefined;
			if (
				declaration &&
				(patternNames(declaration.id).includes(name) ||
					(declaration.type === "VariableDeclaration" &&
						(declaration.declarations as Node[]).some((part) =>
							patternNames(part.id).includes(name)
						)))
			) {
				const target = imported.root.names.get(name);
				return target ? bindingValue(target, depth + 1, seen, budget) : unknown;
			}
			for (const specifier of (statement.specifiers as Node[]) ?? [])
				if (
					((specifier.exported as Node).name ??
						(specifier.exported as Node).value) === name
				) {
					const target = imported.root.names.get(
						(specifier.local as Node).name as string
					);
					return target
						? bindingValue(target, depth + 1, seen, budget)
						: unknown;
				}
		}
		return unknown;
	}
	function bindingValue(
		binding: Binding,
		depth: number,
		visited: Set<Binding>,
		budget: { left: number }
	): Value {
		if (
			depth > 12 ||
			--budget.left < 0 ||
			binding.mutable ||
			visited.has(binding)
		)
			return unknown;
		const seen = new Set(visited).add(binding);
		if (binding.imported) {
			const { source, name } = binding.imported;
			// Relative paths name snapshot files, even inside an i18next directory.
			if (!source.startsWith(".")) {
				if (/i18next/.test(source) && name === "t") return translator;
				if (source === "react" || /i18next/.test(source))
					return { kind: "api", source, name };
			}
			const target = resolve(binding.module.path, source);
			const imported = target ? moduleOf(target) : undefined;
			if (!imported) return unknown;
			if (name === "*") return { kind: "module", module: imported };
			return exported(imported, name, depth + 1, seen, budget);
		}
		const result = evaluate(
			binding.expression,
			binding.module,
			depth + 1,
			seen,
			budget
		);
		const selection = selected(result, binding.selection);
		if (
			binding.escaped &&
			(selection.kind === "tuple" || selection.kind === "object")
		) {
			// An escaped aggregate stays non-callable, but its properties/elements can change.
			// A whole tuple source must lose its first-element proof; selected data can still render.
			return binding.selection.length > 0 ? data : unknown;
		}
		return selection;
	}
	function evaluate(
		expression: unknown,
		module: Module,
		depth: number,
		visited: Set<Binding>,
		budget: { left: number }
	): Value {
		const node = unwrap(expression);
		if (!node || depth > 12 || --budget.left < 0) return unknown;
		const next = (expression: unknown, source = module) =>
			evaluate(expression, source, depth + 1, visited, budget);

		if (node.type === "Identifier") {
			const binding = bindingAt(module, node, node.name as string);
			return binding
				? bindingValue(binding, depth + 1, visited, budget)
				: node.name === "undefined"
					? data
					: unknown;
		}
		if (
			/^(?:String|Numeric|Boolean|Null|BigInt|Decimal|RegExp)Literal$/.test(
				node.type
			) ||
			node.type === "TemplateLiteral"
		)
			return data;
		if (
			node.type === "ArrowFunctionExpression" ||
			node.type === "FunctionExpression" ||
			node.type === "FunctionDeclaration" ||
			node.type === "ObjectMethod"
		)
			return { kind: "function", node, module };
		if (node.type === "ArrayExpression")
			return {
				kind: "tuple",
				elements: (node.elements as unknown[]).map((part) => next(part)),
			};
		if (node.type === "ObjectExpression") {
			const properties = new Map<string, Value>();
			for (const property of node.properties as Node[]) {
				if (
					!["ObjectProperty", "ObjectMethod"].includes(property.type) ||
					keyName(property) === undefined
				)
					return unknown;
				properties.set(
					keyName(property)!,
					next(property.type === "ObjectMethod" ? property : property.value)
				);
			}
			return { kind: "object", properties };
		}
		if (members.has(node.type)) {
			const object = next(node.object);
			const name = propertyName(node);
			if (name === undefined) return unknown;
			if (object.kind === "api")
				return /i18next/.test(object.source) && name === "t"
					? translator
					: { kind: "api", source: object.source, name };
			if (object.kind === "module")
				return exported(object.module, name, depth + 1, visited, budget);
			return selected(object, [name]);
		}
		if (
			node.type === "ConditionalExpression" ||
			node.type === "LogicalExpression"
		) {
			const left = next(node.consequent ?? node.left);
			const right = next(node.alternate ?? node.right);
			if (left.kind === "tuple" && right.kind === "tuple")
				return {
					kind: "tuple",
					elements: left.elements.map((part, index) =>
						kindOf(part) !== "unknown" &&
						kindOf(part) === kindOf(right.elements[index] ?? unknown)
							? part
							: unknown
					),
				};
			return kindOf(left) === "data" && kindOf(right) === "data"
				? data
				: unknown;
		}
		if (!calls.has(node.type)) return unknown;
		const callee = next(node.callee);
		const args = node.arguments as Node[];
		const returned = (fn: Value): Value => {
			if (fn.kind !== "function" || fn.node.async || fn.node.generator)
				return unknown;
			const body = fn.node.body as Node;
			if (body.type !== "BlockStatement") return next(body, fn.module);
			const results: Value[] = [];
			walk(body, (child) => {
				if (child !== body && Array.isArray(child.params)) return false;
				if (child.type === "ReturnStatement")
					results.push(next(child.argument, fn.module));
				return undefined;
			});
			if (results.length === 1) return results[0]!;
			if (results.length && results.every((value) => value.kind === "tuple")) {
				const tuples = results as Extract<Value, { kind: "tuple" }>[];
				return {
					kind: "tuple",
					elements: tuples[0]!.elements.map((part, index) =>
						kindOf(part) !== "unknown" &&
						tuples.every(
							(tuple) =>
								kindOf(tuple.elements[index] ?? unknown) === kindOf(part)
						)
							? part
							: unknown
					),
				};
			}
			if (results.length && results.every((value) => kindOf(value) === "data"))
				return data;
			return unknown;
		};
		if (callee.kind === "function") return returned(callee);
		if (callee.kind !== "api") return unknown;
		if (/i18next/.test(callee.source)) {
			if (
				callee.name === "getFixedT" ||
				callee.name === "getT" ||
				callee.name === "useT"
			)
				return translator;
			if (callee.name === "useTranslation" || callee.name === "getTranslation")
				return { kind: "tuple", elements: [translator] };
			return unknown;
		}
		if (
			callee.source !== "react" ||
			!["useState", "useReducer"].includes(callee.name)
		)
			return unknown;
		let initial = next(args[callee.name === "useState" ? 0 : 1]);
		if (callee.name === "useState" && initial.kind === "function")
			initial = returned(initial);
		if (callee.name === "useReducer") {
			const reducer = returned(next(args[0]));
			if (kindOf(initial) !== "data" || kindOf(reducer) !== "data" || args[2])
				initial = unknown;
		}
		// A setter that escapes or accepts an opaque value can replace initially non-callable state.
		for (const binding of module.bindings)
			if (binding.expression === node && binding.selection[0] === "1") {
				for (const reference of module.references.get(binding) ?? []) {
					if (
						!reference.parent ||
						!calls.has(reference.parent.type) ||
						reference.key !== "callee"
					) {
						initial = unknown;
						break;
					}
					const argument = next((reference.parent.arguments as Node[])[0]);
					const update =
						argument.kind === "function" ? returned(argument) : argument;
					if (kindOf(update) !== "data") initial = unknown;
				}
			}
		// State aggregates survive renders; callers may mutate their contents between calls.
		// Keep the non-callable proof, but do not trust their initial property/element values.
		if (
			(initial.kind === "object" || initial.kind === "tuple") &&
			kindOf(initial) === "data"
		)
			initial = data;
		return { kind: "tuple", elements: [initial, unknown] };
	}
	return {
		forFile(path: string, program: Node) {
			const module = moduleOf(path, program)!;
			const value = (node: Node | undefined) =>
				evaluate(node, module, 0, new Set(), { left: 512 });
			const bindingKinds = new Map<Binding, TupleKind>();
			const bindingKind = (binding: Binding) => {
				if (!bindingKinds.has(binding))
					bindingKinds.set(
						binding,
						kindOf(bindingValue(binding, 0, new Set(), { left: 512 }))
					);
				return bindingKinds.get(binding)!;
			};
			return {
				first(call: Node | undefined, pattern: Node | undefined): TupleKind {
					const values: TupleKind[] = [];
					if (pattern)
						walk(pattern, (node) => {
							const binding =
								node.type === "Identifier" && module.declarations.has(node)
									? bindingAt(module, node, node.name as string)
									: undefined;
							if (binding) values.push(bindingKind(binding));
						});
					return values.length
						? values.every((kind) => kind === "data")
							? "data"
							: values.every((kind) => kind === "translator")
								? "translator"
								: "unknown"
						: kindOf(selected(value(call), ["0"]));
				},
				reference(node: Node): TupleKind | undefined {
					if (node.type !== "Identifier") return undefined;
					const binding = bindingAt(module, node, node.name as string);
					return binding?.tuple && binding.selection[0] === "0"
						? bindingKind(binding)
						: undefined;
				},
			};
		},
	};
}
