import type {
	Declaration,
	LocalVariable,
	Pattern,
	VariableReference,
} from "@inlang/sdk";
import { v7 } from "uuid";
import {
	isNumericKey,
	isPluralSelector,
	matchValue,
	pluralRules,
	resolveInputVariable,
	selectorGroups,
} from "@inlang/sdk/browser";
import type { Match } from "./declarations.js";

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
		/** Used to tell plural selectors apart; their rules do not depend on it. */
		locale?: string;
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
 *   is such a plural). No variants are created: `missingVariants` (`@inlang/sdk`) /
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
		const existing = pluralRules(variable, declarations, "en");
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
				rest.map((s) => matchValue(variant, s.name))
			);
			const current = chosen.get(group);
			if (!current) order.push(group);
			if (
				!current ||
				(matchValue(current, name) !== keep &&
					matchValue(variant, name) === keep)
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

type BundleMessage = SelectorBundle["messages"][number];
type BundleVariant = BundleMessage["variants"][number];

/** The group of `selector` in the first message that has it (see `selectorGroups` of `@inlang/sdk`). */
function groupOf(bundle: SelectorBundle, selector: string) {
	for (const message of bundle.messages) {
		if (!message.selectors.some((s) => s.name === selector)) continue;
		return selectorGroups(
			{ ...message, locale: message.locale ?? "en" },
			bundle.declarations
		).find((group) => group.names.includes(selector));
	}
	return undefined;
}

/**
 * The plural selector a request means: the selector itself ("countPlural") or
 * the variable it reads ("count").
 */
function pluralSelectorOf(bundle: SelectorBundle, selector: string): string {
	const names = [
		...new Set(bundle.messages.flatMap((m) => m.selectors.map((s) => s.name))),
	];
	const name =
		names.find(
			(n) => n === selector && isPluralSelector(n, bundle.declarations)
		) ??
		names.find(
			(n) =>
				isPluralSelector(n, bundle.declarations) &&
				resolveInputVariable(n, bundle.declarations) === selector
		);
	if (!name) throw new Error(`"${selector}" is not a plural of this message.`);
	return name;
}

/**
 * Adds an empty form with `values` (selector name -> key, "*" = catch-all) to
 * `message` for every combination of its other selectors it has variants
 * for, unless such a form exists. The other matches are copied from the
 * row's catch-all variant (or its first one); the new form is put before that
 * catch-all, so exports keep "other" last.
 */
function addRows(
	message: BundleMessage,
	values: Record<string, string>,
	createId: () => string
): void {
	const fixed = Object.keys(values);
	const others = message.selectors.filter((s) => !fixed.includes(s.name));
	const rowOf = (variant: BundleVariant) =>
		JSON.stringify(others.map((s) => matchValue(variant, s.name)));
	const isCatchall = (variant: BundleVariant) =>
		fixed.every((name) => matchValue(variant, name) === "*");
	const rows = new Map<string, BundleVariant>();
	for (const variant of message.variants) {
		const current = rows.get(rowOf(variant));
		if (!current || (!isCatchall(current) && isCatchall(variant)))
			rows.set(rowOf(variant), variant);
	}
	for (const [row, template] of rows) {
		const exists = message.variants.some(
			(variant) =>
				rowOf(variant) === row &&
				fixed.every((name) => matchValue(variant, name) === values[name])
		);
		if (exists) continue;
		const form: BundleVariant = {
			...copy(template),
			id: createId(),
			matches: message.selectors.map(({ name }): Match => {
				const value = values[name] ?? matchValue(template, name);
				return value === "*"
					? { type: "catchall-match", key: name }
					: { type: "literal-match", key: name, value };
			}),
			pattern: [],
		};
		const at = message.variants.indexOf(template);
		message.variants.splice(
			isCatchall(template) ? at : message.variants.length,
			0,
			form
		);
	}
}

export type ExactNumberArgs = {
	/** The plural selector ("countPlural") or the variable it reads ("count"). */
	selector: string;
	/** The number, e.g. `0` (ICU `=0`). A leading "=" is ignored. */
	value: string | number;
	/** Creates ids of new variants (default: uuid v7). */
	createId?: () => string;
};

function exactNumber(value: string | number): string {
	const number = String(value).trim().replace(/^=/, "");
	if (!isNumericKey(number))
		throw new Error(`"${value}" is not a number such as 0 or 1.`);
	return number;
}

/**
 * Gives a plural message a form for an exact number (ICU `=0`) in **every**
 * language, in the shape `@inlang/plugin-icu1` imports and exports
 * `{count, plural, =0 {…} one {…} other {…}}`:
 *
 * - unless the plural has one, an exact-number selector is declared
 *   (`.local $countPluralExact = {$count}`), put before the plural selector in
 *   every message that has the plural, and every existing variant gets a
 *   catch-all match for it
 * - an empty variant for the number is added per combination of the other
 *   selectors (`gender`), with the plural's catch-all
 *
 * The SDK then requires that number in every language (`missingVariants`,
 * `checkBundle`) and `<inlang-message-forms>` lists it as one choice with the
 * plural categories. Pure. Throws when the selector is not a plural or the
 * value is not a number.
 *
 * @example
 * addExactNumber(bundle, { selector: "count", value: 0 });
 */
export function addExactNumber<B extends SelectorBundle>(
	bundle: B,
	args: ExactNumberArgs
): B {
	const number = exactNumber(args.value);
	const createId = args.createId ?? v7;
	const plural = pluralSelectorOf(bundle, args.selector);
	const declarations = copy(bundle.declarations);
	let exact = groupOf(bundle, plural)?.exactSelector;
	if (!exact) {
		exact = uniqueName(`${plural}Exact`, declarations);
		declarations.push({
			type: "local-variable",
			name: exact,
			value: {
				type: "expression",
				arg: {
					type: "variable-reference",
					name: resolveInputVariable(plural, declarations),
				},
			},
		});
	}
	const exactName = exact;
	const messages = bundle.messages.map((original) => {
		const message = copy(original);
		if (!message.selectors.some((s) => s.name === plural)) return message;
		if (!message.selectors.some((s) => s.name === exactName)) {
			const at = message.selectors.findIndex((s) => s.name === plural);
			message.selectors.splice(at, 0, {
				type: "variable-reference",
				name: exactName,
			});
			for (const variant of message.variants) {
				const index = variant.matches.findIndex((m) => m.key === plural);
				variant.matches.splice(
					index === -1 ? variant.matches.length : index,
					0,
					{
						type: "catchall-match",
						key: exactName,
					}
				);
			}
		}
		addRows(message, { [exactName]: number, [plural]: "*" }, createId);
		return message;
	});
	return { ...bundle, declarations, messages };
}

/**
 * The reverse of {@link addExactNumber}: removes the forms of an exact number
 * from every language. When no form for an exact number is left, the
 * exact-number selector and its local variable are removed as well. Pure.
 * Throws when no message has a form for the number.
 */
export function removeExactNumber<B extends SelectorBundle>(
	bundle: B,
	args: Omit<ExactNumberArgs, "createId">
): B {
	const number = exactNumber(args.value);
	const plural = pluralSelectorOf(bundle, args.selector);
	const exact = groupOf(bundle, plural)?.exactSelector;
	const isForm = (variant: BundleVariant) =>
		(exact !== undefined && matchValue(variant, exact) === number) ||
		matchValue(variant, plural) === number;
	if (!bundle.messages.some((m) => m.variants.some(isForm)))
		throw new Error(`"${number}" is not an exact number of this message.`);
	const result = {
		...bundle,
		declarations: copy(bundle.declarations),
		messages: bundle.messages.map((message) => ({
			...copy(message),
			variants: copy(message.variants.filter((v) => !isForm(v))),
		})),
	};
	const used =
		exact !== undefined &&
		result.messages.some((m) =>
			m.variants.some((v) => matchValue(v, exact) !== "*")
		);
	return exact !== undefined &&
		!used &&
		result.messages.some((m) => m.selectors.some((s) => s.name === exact))
		? removeSelector(result, exact)
		: result;
}

export type SelectValueArgs = {
	/** The select selector, e.g. "gender". */
	selector: string;
	/** The value, e.g. "diverse". */
	value: string;
	/** Creates ids of new variants (default: uuid v7). */
	createId?: () => string;
};

function selectSelectorOf(bundle: SelectorBundle, selector: string): string {
	const group = groupOf(bundle, selector);
	if (!group)
		throw new Error(`"${selector}" is not a selector of this message.`);
	if (group.isPlural || group.selector !== selector)
		throw new Error(
			`"${selector}" chooses by number: use addExactNumber for exact numbers.`
		);
	return selector;
}

function selectValue(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "*")
		throw new Error(`"${value}" cannot be a value of a select.`);
	return trimmed;
}

/**
 * Adds a value to a select (e.g. "diverse" to `gender`) in **every** language
 * that has the selector: an empty form per combination of the other selectors.
 * The SDK then requires the value in every language. Pure. Throws for a plural
 * selector, an unknown selector or an empty value.
 *
 * @example
 * addSelectValue(bundle, { selector: "gender", value: "diverse" });
 */
export function addSelectValue<B extends SelectorBundle>(
	bundle: B,
	args: SelectValueArgs
): B {
	const selector = selectSelectorOf(bundle, args.selector);
	const value = selectValue(args.value);
	const createId = args.createId ?? v7;
	return {
		...bundle,
		declarations: copy(bundle.declarations),
		messages: bundle.messages.map((original) => {
			const message = copy(original);
			if (message.selectors.some((s) => s.name === selector))
				addRows(message, { [selector]: value }, createId);
			return message;
		}),
	};
}

/**
 * Removes one value of a select from every language: its forms are deleted,
 * the selector and its other values stay. Pure. Throws when no form has the
 * value.
 */
export function removeSelectValue<B extends SelectorBundle>(
	bundle: B,
	args: Omit<SelectValueArgs, "createId">
): B {
	const selector = selectSelectorOf(bundle, args.selector);
	const value = selectValue(args.value);
	const isForm = (variant: BundleVariant) =>
		matchValue(variant, selector) === value;
	if (!bundle.messages.some((m) => m.variants.some(isForm)))
		throw new Error(`"${value}" is not a value of "${selector}".`);
	return {
		...bundle,
		declarations: copy(bundle.declarations),
		messages: bundle.messages.map((message) => ({
			...copy(message),
			variants: copy(message.variants.filter((v) => !isForm(v))),
		})),
	};
}
