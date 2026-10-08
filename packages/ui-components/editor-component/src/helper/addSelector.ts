import type {
	Declaration,
	LocalVariable,
	Pattern,
	VariableReference,
} from "@inlang/sdk";
import { v7 } from "uuid";
import {
	matchFor,
	matchValue,
	pluralResolver,
	resolveAnnotation,
	type Match,
} from "./declarations.js";

/**
 * The structure the selector helpers need from a bundle: `bundle.declarations`
 * and, per locale, a message with its selectors and variants. Both `BundleNested`
 * of the SDK (`messageId` on variants) and its database rows (`message_id`) fit;
 * everything else on the objects is kept as it is.
 */
export type SelectorBundle = {
	declarations: Declaration[];
	messages: Array<{
		id: string;
		selectors: VariableReference[];
		variants: Array<{ id: string; matches: Match[]; pattern: Pattern }>;
	}>;
};

/** What a selector chooses by. */
export type SelectorKind = "plural" | "ordinal" | "select";

export type AddSelectorArgs = {
	/**
	 * The declared variable to choose by: an input variable ("count") or a local
	 * variable. For `plural` / `ordinal` a local variable `<variable>Plural`
	 * (`.local $countPlural = {$count :plural}`) is declared, the same way
	 * `@inlang/plugin-icu1` imports ICU plurals. The text keeps using `{count}`.
	 */
	variable: string;
	kind: SelectorKind;
	/** `select` only: values that get an (empty) form of their own, e.g. `["female", "male"]`. The catch-all always exists. */
	values?: readonly string[];
	/** Name of the local variable that is declared for `plural` / `ordinal` (default `<variable>Plural` / `<variable>Ordinal`). */
	name?: string;
	/** Creates ids of new variants (default: uuid v7). */
	createId?: () => string;
};

/**
 * The variables a message can still be made plural / a select by: every declared
 * variable that no message of the bundle uses as a selector yet (input variables
 * first, in declaration order).
 */
export function selectableVariables(
	bundle: Pick<SelectorBundle, "declarations"> & {
		messages: Array<Pick<SelectorBundle["messages"][number], "selectors">>;
	}
): string[] {
	const used = new Set(
		bundle.messages.flatMap((m) => m.selectors.map((s) => s.name))
	);
	const free = bundle.declarations.filter((d) => !used.has(d.name));
	return [
		...free.filter((d) => d.type === "input-variable"),
		...free.filter((d) => d.type !== "input-variable"),
	].map((d) => d.name);
}

function copy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueName(base: string, declarations: readonly Declaration[]) {
	let name = base;
	for (let i = 1; declarations.some((d) => d.name === name); i++) {
		name = `${base}${i}`;
	}
	return name;
}

/**
 * Makes a message plural / ordinal / a select: adds a selector on a declared
 * variable to **every** message (language) of the bundle.
 *
 * - every existing variant gets a catch-all match for the new selector, so its
 *   text stays what the message says "in every other case"
 * - `plural` / `ordinal` declare `<variable>Plural` / `<variable>Ordinal` as a
 *   local variable with the `plural` annotation (reused when `variable` already
 *   is such a plural). No variants are created: `requiredForms` /
 *   `<inlang-message-forms>` then offer "+ Add form" for the categories of
 *   each language
 * - `select` with `values` adds an empty variant per existing variant and value
 *
 * Pure: returns a new bundle and leaves the argument untouched. Throws when the
 * variable is not declared or already is a selector.
 *
 * @example
 * const plural = addSelector(bundle, { variable: "count", kind: "plural" });
 * // plural.messages[*].selectors -> [{ type: "variable-reference", name: "countPlural" }]
 */
export function addSelector<B extends SelectorBundle>(
	bundle: B,
	args: AddSelectorArgs
): B {
	const { variable, kind } = args;
	const createId = args.createId ?? v7;
	let declarations = copy(bundle.declarations);
	if (!declarations.some((d) => d.name === variable)) {
		throw new Error(`"${variable}" is not a variable of this message.`);
	}

	let selector = variable;
	if (kind !== "select") {
		const wantedType = kind === "ordinal" ? "ordinal" : "cardinal";
		const existing = pluralResolver(
			resolveAnnotation(variable, declarations),
			"en"
		);
		if (existing?.type === wantedType) {
			// already a plural of this kind (e.g. an imported `countPlural`)
		} else {
			selector = uniqueName(
				args.name ?? `${variable}${kind === "ordinal" ? "Ordinal" : "Plural"}`,
				declarations
			);
			const local: LocalVariable = {
				type: "local-variable",
				name: selector,
				value: {
					type: "expression",
					arg: { type: "variable-reference", name: variable },
					annotation: {
						type: "function-reference",
						name: "plural",
						options:
							kind === "ordinal"
								? [
										{
											name: "type",
											value: { type: "literal", value: "ordinal" },
										},
									]
								: [],
					},
				},
			};
			declarations = [...declarations, local];
		}
	}
	if (
		bundle.messages.some((m) => m.selectors.some((s) => s.name === selector))
	) {
		throw new Error(`"${variable}" is already a selector of this message.`);
	}

	const values =
		kind === "select"
			? [
					...new Set(
						(args.values ?? [])
							.map((value) => value.trim())
							.filter((value) => value !== "" && value !== "*")
					),
				]
			: [];

	const messages = bundle.messages.map((message) => {
		const variants: typeof message.variants = [];
		for (const variant of message.variants) {
			const catchall = { type: "catchall-match", key: selector } as const;
			variants.push({
				...copy(variant),
				matches: [...copy(variant.matches), catchall],
			});
			for (const value of values) {
				variants.push({
					...copy(variant),
					id: createId(),
					matches: [
						...copy(variant.matches),
						{ type: "literal-match", key: selector, value },
					],
					pattern: [],
				});
			}
		}
		return {
			...copy(message),
			selectors: [
				...copy(message.selectors),
				{ type: "variable-reference", name: selector } as VariableReference,
			],
			variants,
		};
	});

	return { ...bundle, declarations, messages };
}

export type RemoveSelectorOptions = {
	/**
	 * Which form survives when several variants only differ in the removed selector
	 * (default `"*"`: the catch-all, i.e. the plural's "other"). Falls back to the first one.
	 */
	keep?: string;
};

function references(value: unknown, name: string): boolean {
	if (Array.isArray(value)) return value.some((item) => references(item, name));
	if (typeof value !== "object" || value === null) return false;
	const node = value as Record<string, unknown>;
	if (node.type === "variable-reference" && node.name === name) return true;
	return Object.values(node).some((item) => references(item, name));
}

/**
 * The reverse of {@link addSelector}: removes a selector from every message.
 * Of the variants that only differ in this selector one survives (`keep`,
 * default the catch-all), the other forms are dropped. A local variable that was
 * only declared for the selector is removed as well.
 *
 * Pure. Throws when no message has the selector.
 */
export function removeSelector<B extends SelectorBundle>(
	bundle: B,
	name: string,
	options: RemoveSelectorOptions = {}
): B {
	const keep = options.keep ?? "*";
	if (!bundle.messages.some((m) => m.selectors.some((s) => s.name === name))) {
		throw new Error(`"${name}" is not a selector of this message.`);
	}
	const messages = bundle.messages.map((message) => {
		if (!message.selectors.some((s) => s.name === name)) return copy(message);
		const rest = message.selectors.filter((s) => s.name !== name);
		const chosen = new Map<string, (typeof message.variants)[number]>();
		const order: string[] = [];
		for (const variant of message.variants) {
			const group = JSON.stringify(
				rest.map((s) => matchValue(matchFor(variant, s.name)))
			);
			const current = chosen.get(group);
			if (!current) order.push(group);
			if (
				!current ||
				(matchValue(matchFor(current, name)) !== keep &&
					matchValue(matchFor(variant, name)) === keep)
			)
				chosen.set(group, variant);
		}
		return {
			...copy(message),
			selectors: copy(rest),
			variants: order.map((group) => {
				const variant = copy(chosen.get(group)!);
				return {
					...variant,
					matches: variant.matches.filter((match) => match.key !== name),
				};
			}),
		};
	});

	let declarations = copy(bundle.declarations);
	const declaration = declarations.find((d) => d.name === name);
	if (declaration?.type === "local-variable") {
		const others = declarations.filter((d) => d !== declaration);
		const used =
			references(messages, name) ||
			others.some((other) => references(other, name));
		if (!used) declarations = declarations.filter((d) => d.name !== name);
	}
	return { ...bundle, declarations, messages };
}
