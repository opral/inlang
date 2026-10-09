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
	/**
	 * `select` only: values that get an empty form of their own in the message of
	 * `locale`, e.g. `["female", "male"]`. The catch-all always exists.
	 */
	values?: readonly string[];
	/**
	 * The language (normally the reference) whose message gets the empty forms of
	 * `values`; required with `values`. Other languages get the selector only and
	 * then need those forms (`missingVariants` of `@inlang/sdk`, "+ Add form"), so
	 * an untranslated value never exports as an empty text.
	 */
	locale?: string;
	/** Name of the local variable that is declared for `plural` / `ordinal` (default `<variable>Plural` / `<variable>Ordinal`). */
	name?: string;
	/** Creates ids of new variants (default: uuid v7). */
	createId?: () => string;
};

/**
 * The variables a message can still be made plural / a select by: every declared
 * variable whose input no message of the bundle chooses by yet (input variables
 * first, in declaration order). "count" is not offered once `countPlural` (which
 * reads it) is a selector.
 */
export function selectableVariables(
	bundle: Pick<SelectorBundle, "declarations"> & {
		messages: Array<Pick<SelectorBundle["messages"][number], "selectors">>;
	}
): string[] {
	const used = new Set(
		bundle.messages.flatMap((m) =>
			m.selectors.map((s) => resolveInputVariable(s.name, bundle.declarations))
		)
	);
	const free = bundle.declarations.filter(
		(d) => !used.has(resolveInputVariable(d.name, bundle.declarations))
	);
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
 *   to the message of `locale` only
 *
 * Pure: returns a new bundle and leaves the argument untouched. Throws when the
 * variable is not declared, already is a selector, or its input already is a
 * plural (`count` once `countPlural` is a selector).
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

	const input = resolveInputVariable(variable, declarations);
	const plural = bundle.messages
		.flatMap((m) => m.selectors)
		.find(
			(s) =>
				isPluralSelector(s.name, declarations) &&
				resolveInputVariable(s.name, declarations) === input
		);
	if (plural)
		throw new Error(
			`"${input}" is already a plural of this message ("${plural.name}"): use addExactNumber for exact numbers.`
		);

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

	if (values.length > 0 && args.locale === undefined)
		throw new Error("Select values need the locale that gets their forms.");
	const messages = bundle.messages.map((message) => {
		const variants: typeof message.variants = [];
		for (const variant of message.variants) {
			// the new forms come before the catch-all, so exports keep "other" last
			if (message.locale === args.locale)
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
			const catchall = { type: "catchall-match", key: selector } as const;
			variants.push({
				...copy(variant),
				matches: [...copy(variant.matches), catchall],
			});
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
 * Removing a plural removes its exact-number selector (ICU `=0`) too; `keep` may
 * then also be one of its numbers ("0"). Removing only the exact-number selector
 * keeps the plural.
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
	// A plural goes together with its exact-number partner (ICU `=0`): without the plural, the
	// partner would turn into a select, and the export would lose the plural around `#`.
	const partners = new Set(
		bundle.messages.flatMap((message) =>
			message.selectors.some((s) => s.name === name)
				? selectorGroups(
						{ ...message, locale: message.locale ?? "en" },
						bundle.declarations
					).flatMap((group) =>
						group.selector === name && group.exactSelector
							? [group.exactSelector]
							: []
					)
				: []
		)
	);
	let result: B = bundle;
	for (const partner of partners)
		result = removeOne(result, partner, isNumericKey(keep) ? keep : "*");
	return removeOne(result, name, isNumericKey(keep) && partners.size ? "*" : keep);
}

function removeOne<B extends SelectorBundle>(
	bundle: B,
	name: string,
	keep: string
): B {
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
 * The exact-number selector paired with `plural` (ICU `=0`) in any message: `@inlang/plugin-icu1`
 * declares it only in the languages that use an exact number, so the first message with the plural
 * may not have it. Without such a message, an un-annotated local alias of the plural's input that
 * no message uses as a selector (left by an import) is reused.
 */
function exactSelectorOf(bundle: SelectorBundle, plural: string): string | undefined {
	for (const message of bundle.messages) {
		if (!message.selectors.some((s) => s.name === plural)) continue;
		const exact = selectorGroups(
			{ ...message, locale: message.locale ?? "en" },
			bundle.declarations
		).find((group) => group.selector === plural)?.exactSelector;
		if (exact) return exact;
	}
	const input = resolveInputVariable(plural, bundle.declarations);
	const selectors = new Set(
		bundle.messages.flatMap((m) => m.selectors.map((s) => s.name))
	);
	return bundle.declarations.find(
		(d) =>
			d.type === "local-variable" &&
			d.value.annotation === undefined &&
			d.value.arg.type === "variable-reference" &&
			!selectors.has(d.name) &&
			!isPluralSelector(d.name, bundle.declarations) &&
			resolveInputVariable(d.name, bundle.declarations) === input
	)?.name;
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
	/**
	 * The language (normally the reference) whose message gets the empty form.
	 * Other languages only get the exact-number selector and then need the form
	 * (`missingVariants` of `@inlang/sdk`, "+ Add form"): an untranslated `=0` is
	 * absent instead of an empty text.
	 */
	locale: string;
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
 * Gives a plural message a form for an exact number (ICU `=0`), in the shape
 * `@inlang/plugin-icu1` imports and exports
 * `{count, plural, =0 {…} one {…} other {…}}`:
 *
 * - unless the plural has one, an exact-number selector is declared
 *   (`.local $countPluralExact = {$count}`), put before the plural selector in
 *   every message that has the plural, and every existing variant gets a
 *   catch-all match for it
 * - the message of `locale` gets an empty variant for the number per
 *   combination of the other selectors (`gender`), with the plural's catch-all
 *
 * The SDK then requires that number in every other language too
 * (`missingVariants`, `missing-variant` of `checkBundle`), so
 * `<inlang-message-forms>` offers "+ Add form" there; it lists the number as one
 * choice with the plural categories. Pure. Throws when the selector is not a
 * plural of the message of `locale` or the value is not a number.
 *
 * @example
 * addExactNumber(bundle, { selector: "count", value: 0, locale: "en" });
 */
export function addExactNumber<B extends SelectorBundle>(
	bundle: B,
	args: ExactNumberArgs
): B {
	const number = exactNumber(args.value);
	const createId = args.createId ?? v7;
	const plural = pluralSelectorOf(bundle, args.selector);
	requireSelectorIn(bundle, plural, args.locale);
	const declarations = copy(bundle.declarations);
	let exact = exactSelectorOf(bundle, plural);
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
		if (message.locale === args.locale)
			addRows(message, { [exactName]: number, [plural]: "*" }, createId);
		return message;
	});
	return { ...bundle, declarations, messages };
}

/**
 * The reverse of {@link addExactNumber}: removes the forms of an exact number
 * from every language (also those translators added). When no form for an exact number is left, the
 * exact-number selector and its local variable are removed as well. Pure.
 * Throws when no message has a form for the number.
 */
export function removeExactNumber<B extends SelectorBundle>(
	bundle: B,
	args: Omit<ExactNumberArgs, "createId" | "locale">
): B {
	const number = exactNumber(args.value);
	const plural = pluralSelectorOf(bundle, args.selector);
	const exact = exactSelectorOf(bundle, plural);
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
	/**
	 * The language (normally the reference) whose message gets the empty forms.
	 * Other languages then need them (`missingVariants` of `@inlang/sdk`).
	 */
	locale: string;
	/** Creates ids of new variants (default: uuid v7). */
	createId?: () => string;
};

function requireSelectorIn(
	bundle: SelectorBundle,
	selector: string,
	locale: string
) {
	const message = bundle.messages.find((m) => m.locale === locale);
	if (!message?.selectors.some((s) => s.name === selector))
		throw new Error(`The "${locale}" message has no selector "${selector}".`);
}

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
 * Adds a value to a select (e.g. "diverse" to `gender`): an empty form per
 * combination of the other selectors in the message of `locale`. The SDK then
 * requires the value in every other language that has the selector
 * (`missingVariants`, "+ Add form"). Pure. Throws for a plural selector, a
 * selector the message of `locale` does not have or an empty value.
 *
 * @example
 * addSelectValue(bundle, { selector: "gender", value: "diverse", locale: "en" });
 */
export function addSelectValue<B extends SelectorBundle>(
	bundle: B,
	args: SelectValueArgs
): B {
	const selector = selectSelectorOf(bundle, args.selector);
	const value = selectValue(args.value);
	const createId = args.createId ?? v7;
	requireSelectorIn(bundle, selector, args.locale);
	return {
		...bundle,
		declarations: copy(bundle.declarations),
		messages: bundle.messages.map((original) => {
			const message = copy(original);
			if (message.locale === args.locale)
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
	args: Omit<SelectValueArgs, "createId" | "locale">
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
