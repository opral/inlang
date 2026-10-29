import { parse } from "@babel/parser";

export type Node = { type: string; [key: string]: unknown };
export const isNode = (value: unknown): value is Node =>
	value !== null &&
	typeof value === "object" &&
	"type" in value &&
	typeof value.type === "string";

/** JavaScript and TypeScript that Babel parses. */
export const SCRIPT = /\.(?:[jt]sx?|[mc]?[jt]s)$/i;

const SKIPPED_KEYS = new Set([
	"loc",
	"extra",
	"comments",
	"leadingComments",
	"trailingComments",
	"innerComments",
	"tokens",
	"typeAnnotation",
	"returnType",
	"typeParameters",
	"typeArguments",
	"superTypeParameters",
	"implements",
]);

type Position = { line: number; column: number };
export const location = (node: Node) => {
	const loc = node.loc as { start: Position; end: Position } | undefined;
	return loc ? { start: loc.start, end: loc.end } : {};
};

type ParserPlugins = NonNullable<
	NonNullable<Parameters<typeof parse>[1]>["plugins"]
>;
export function parseScript(path: string, content: string): Node {
	const typescript = /\.(?:tsx?|mts)$/i.test(path);
	const jsx = !/\.(?:ts|mts)$/i.test(path);
	const base: ParserPlugins = [
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
				parse(content, { sourceType: "module", plugins }) as unknown as {
					program: Node;
				}
			).program;
		} catch (error) {
			failure ??= error;
		}
	}
	throw failure;
}

/** Calls `visit` for every node. The children of a node are skipped when it returns `false`. */
export function walk(
	node: Node,
	visit: (
		node: Node,
		parent: Node | undefined,
		key: string | undefined
	) => boolean | void,
	parent?: Node,
	key?: string
): void {
	if (visit(node, parent, key) === false) return;
	for (const name in node) {
		if (SKIPPED_KEYS.has(name)) continue;
		const value = node[name];
		if (Array.isArray(value)) {
			for (const child of value)
				if (isNode(child)) walk(child, visit, node, name);
		} else if (isNode(value)) walk(value, visit, node, name);
	}
}

export const stringValue = (node: unknown): string | undefined => {
	if (!isNode(node)) return undefined;
	if (
		(node.type === "StringLiteral" || node.type === "Literal") &&
		typeof node.value === "string"
	)
		return node.value;
	if (
		node.type === "TemplateLiteral" &&
		(node.expressions as unknown[]).length === 0
	)
		return (
			((node.quasis as Node[])[0]?.value as { cooked?: string })?.cooked ??
			undefined
		);
	return undefined;
};

/** The names a binding pattern declares. */
export function patternNames(pattern: unknown): string[] {
	if (!isNode(pattern)) return [];
	switch (pattern.type) {
		case "Identifier":
			return [pattern.name as string];
		case "AssignmentPattern":
			return patternNames(pattern.left);
		case "RestElement":
			return patternNames(pattern.argument);
		case "ArrayPattern":
			return (pattern.elements as unknown[]).flatMap(patternNames);
		case "ObjectPattern":
			return (pattern.properties as Node[]).flatMap((property) =>
				patternNames(
					property.type === "RestElement" ? property : property.value
				)
			);
		default:
			return [];
	}
}

/** `a.b` and `a["b"]`: "b". */
export const propertyName = (member: Node): string | undefined => {
	if (!member.computed) {
		const property = member.property as Node;
		return property.type === "Identifier" || property.type === "PrivateName"
			? ((property.name ?? (property.id as Node | undefined)?.name) as string)
			: undefined;
	}
	return stringValue(member.property);
};

/** The name of an object property: `{ b: 1 }`, `{ "b": 1 }`. */
export const keyName = (property: Node): string | undefined =>
	property.computed
		? stringValue(property.key)
		: (property.key as Node).type === "Identifier"
			? ((property.key as Node).name as string)
			: stringValue(property.key);

/** The expression inside `await`, `as`, `!` and parentheses. */
export const unwrap = (node: unknown): Node | undefined => {
	let current = node;
	while (
		isNode(current) &&
		(current.type === "AwaitExpression" ||
			current.type === "TSAsExpression" ||
			current.type === "TSSatisfiesExpression" ||
			current.type === "TSNonNullExpression" ||
			current.type === "ParenthesizedExpression")
	)
		current = current.argument ?? current.expression;
	return isNode(current) ? current : undefined;
};
