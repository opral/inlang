import { parse } from "@babel/parser";
import type { AnalyzeUsage, UsageAnalysis } from "@inlang/sdk";

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
const messageModule = (value: unknown): boolean =>
	typeof value === "string" &&
	/(?:^|\/)(?:messages(?:\/|\.|$)|paraglide(?:\/|$))/.test(value);

/** Conservative JS/TS analysis. Unsupported files and object escapes withhold unused fixes. */
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
	for (const file of files) {
		const unresolved = new Set<string>();
		if (!/\.(?:(?:[jt]sx?|m[jt]s))$/i.test(file.path)) {
			issues.push({
				path: file.path,
				reason:
					"Unsupported source format. Supply ESM JavaScript or TypeScript files.",
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
		let ast: Node;
		try {
			ast = parse(file.content, {
				sourceType: "module",
				plugins: [
					...(/\.(?:tsx?|mts)$/i.test(file.path)
						? ["typescript" as const]
						: []),
					"jsx",
				],
			}) as unknown as Node;
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
		const program = ast.program as Node;
		for (const statement of program.body as Node[]) {
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
					)
						namespaces.add(local);
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
			{ node: program },
		];
		while (stack.length) {
			const { node, parent, key } = stack.pop()!;
			if (node.type === "ImportDeclaration") continue;
			if (
				node.type === "Identifier" &&
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
			)
				continue;
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
				node.type === "JSXMemberExpression" &&
				isNode(node.object) &&
				node.object.type === "JSXIdentifier" &&
				namespaces.has(node.object.name as string)
			) {
				if (isNode(node.property)) used.add(node.property.name as string);
			}
			if (
				node.type === "JSXIdentifier" &&
				namespaces.has(node.name as string) &&
				!(parent?.type === "JSXMemberExpression" && key === "object")
			)
				unresolved.add("A JSX message namespace cannot be resolved.");
			if (
				node.type === "MemberExpression" ||
				node.type === "OptionalMemberExpression"
			) {
				const object = identifier(node.object);
				const propertyName = !node.computed
					? identifier(node.property)
					: isNode(node.property) && node.property.type === "StringLiteral"
						? node.property.value
						: undefined;
				if (propertyName === "require" || propertyName === "createRequire")
					unresolved.add("CommonJS loader references are unsupported.");
				if (object && namespaces.has(object)) {
					let id: string | undefined;
					if (!node.computed) id = identifier(node.property);
					else if (
						isNode(node.property) &&
						node.property.type === "StringLiteral"
					)
						id = node.property.value as string;
					else if (
						isNode(node.property) &&
						node.property.type === "TemplateLiteral" &&
						(node.property.expressions as unknown[]).length === 0
					) {
						const quasi = (node.property.quasis as Node[])[0];
						id = (quasi?.value as { cooked?: string })?.cooked;
					}
					if (id === undefined)
						unresolved.add("Dynamic message access cannot be resolved.");
					else used.add(id);
				}
				// Nested/global message namespaces require binding graph analysis.
				if (
					!node.computed &&
					identifier(node.property) === "m" &&
					(!object || !namespaces.has(object))
				)
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
	} satisfies UsageAnalysis;
};
