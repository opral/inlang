/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type {
	Bundle,
	Message,
	Pattern,
	VariableReference,
	Variant,
} from "@inlang/sdk";
import type { plugin } from "../plugin.js";
import { flatten } from "flat";
import type { BundleImport, MessageImport, VariantImport } from "@inlang/sdk";
import { matchSpecificity } from "./matchSpecificity.js";
import type { PluginSettings } from "../settings.js";

export const importFiles: NonNullable<(typeof plugin)["importFiles"]> = async ({
	files,
	settings,
}) => {
	const bundles: BundleImport[] = [];
	const messages: MessageImport[] = [];
	const variants: VariantImport[] = [];

	// Classify a namespace once across all locales. Sparse translations must
	// not change a key's bundle id or the bundle's plural input contract.
	const prepared = files.map((file) => ({
		file,
		resource: flatten(
			JSON.parse(new TextDecoder().decode(file.content))
		) as Record<string, string>,
	}));
	const keysByNamespace = new Map<string, Set<string>>();
	for (const { file, resource } of prepared) {
		const namespace = file.toBeImportedFilesMetadata?.namespace ?? "";
		const keys = keysByNamespace.get(namespace) ?? new Set<string>();
		Object.keys(resource).forEach((key) => keys.add(key));
		keysByNamespace.set(namespace, keys);
	}
	const configuredContexts = settings?.["plugin.inlang.i18next"]?.contextValues;
	const contextValues =
		configuredContexts === undefined
			? undefined
			: [...configuredContexts].sort((a, b) => b.length - a.length);
	const classifications = new Map<string, Map<string, KeyClassification>>();
	const summaries = new Map<string, Map<string, BundleSelectors>>();
	for (const [namespace, keys] of keysByNamespace) {
		const roots = findContextRoots(
			[...keys].map((key) => splitPluralSuffix(key).stem)
		);
		const byKey = new Map(
			[...keys].map((key) => [key, classifyKey(key, roots, contextValues)])
		);
		const byRoot = new Map<string, BundleSelectors>();
		for (const classification of byKey.values()) {
			const { rootKey, isOrdinal, isCardinalPlural, isZero, hasContext } =
				classification;
			const summary = byRoot.get(rootKey) ?? {
				hasPlurals: false,
				hasOrdinal: false,
				hasZero: false,
				hasContext: false,
			};
			summary.hasPlurals ||= isCardinalPlural;
			summary.hasOrdinal ||= isOrdinal;
			summary.hasZero ||= isZero;
			summary.hasContext ||= hasContext;
			byRoot.set(rootKey, summary);
		}
		classifications.set(namespace, byKey);
		summaries.set(namespace, byRoot);
	}
	for (const { file, resource } of prepared) {
		const namespace = file.toBeImportedFilesMetadata?.namespace;
		const result = parseFile({
			namespace,
			locale: file.locale,
			resource,
			classifiedByKey: classifications.get(namespace ?? "")!,
			bundleSelectorsByRootKey: summaries.get(namespace ?? "")!,
			settings: settings?.["plugin.inlang.i18next"],
		});
		bundles.push(...result.bundles);
		messages.push(...result.messages);
		variants.push(...result.variants);
	}

	// merge the bundle declarations
	const uniqueBundleIds = [...new Set(bundles.map((bundle) => bundle.id))];
	const uniqueBundles: BundleImport[] = uniqueBundleIds.map((id) => {
		const _bundles = bundles.filter((bundle) => bundle.id === id);
		const declarations = removeDuplicates(
			_bundles.flatMap((bundle) => bundle.declarations)
		);
		return { id, declarations };
	});

	return { bundles: uniqueBundles, messages, variants };
};

function parseFile(args: {
	namespace?: string;
	locale: string;
	resource: Record<string, string>;
	classifiedByKey: Map<string, KeyClassification>;
	bundleSelectorsByRootKey: Map<string, BundleSelectors>;
	settings?: PluginSettings;
}): {
	bundles: BundleImport[];
	messages: MessageImport[];
	variants: VariantImport[];
} {
	const { resource, classifiedByKey, bundleSelectorsByRootKey } = args;
	const keys = Object.keys(resource);
	const bundles: BundleImport[] = [];
	const messages: MessageImport[] = [];
	const variants: VariantImport[] = [];

	for (const key of keys) {
		const value = resource[key]!;
		const classification = classifiedByKey.get(key)!;
		const parsed = parseMessage({
			namespace: args.namespace,
			value,
			locale: args.locale,
			classification,
			bundleSelectors: bundleSelectorsByRootKey.get(classification.rootKey)!,
			settings: args.settings,
		});
		bundles.push(parsed.bundle);
		messages.push(parsed.message);
		variants.push(...parsed.variants);
	}

	// order each bundle's variants most-specific-first (`friend_male_one` >
	// `friend_male` > `friend_one` > `friend`) so that first-match-wins
	// consumers (e.g. the paraglide compiler) resolve context and plurals
	// the way i18next does.
	// https://github.com/opral/inlang/issues/4354
	const variantsByBundleId = new Map<string, VariantImport[]>();
	for (const variant of variants) {
		const group = variantsByBundleId.get(variant.messageBundleId!) ?? [];
		group.push(variant);
		variantsByBundleId.set(variant.messageBundleId!, group);
	}
	const sortedVariants = [...variantsByBundleId.values()].flatMap((group) =>
		group.sort((a, b) => matchSpecificity(b) - matchSpecificity(a))
	);

	return { bundles, messages, variants: sortedVariants };
}

function parseMessage(args: {
	namespace?: string;
	value: string;
	locale: string;
	classification: KeyClassification;
	bundleSelectors: BundleSelectors;
	settings?: PluginSettings;
}): {
	bundle: BundleImport;
	message: MessageImport;
	variants: VariantImport[];
} {
	const pattern = parsePattern(args.value, args.settings);

	// i18next suffixes keys with context or plurals
	// "friend_female_one" -> "friend"
	// "key_separator_context_male" -> "key_separator_context"
	const {
		keyParts,
		rootKey,
		context,
		isOrdinal,
		isCardinalPlural: hasPlurals,
		isZero,
		hasContext,
	} = args.classification;
	let bundleId = rootKey;
	if (args.namespace) {
		// following i18next's convention
		// https://www.i18next.com/principles/namespaces#sample
		bundleId = `${args.namespace}:${bundleId}`;
	}

	const bundle: Bundle = {
		id: bundleId,
		declarations: pattern.variableReferences.map((variableReference) => ({
			type: "input-variable",
			name: variableReference.name,
		})),
	};

	const message: MessageImport = {
		bundleId: bundleId,
		selectors: [],
		locale: args.locale,
	};

	const variant: VariantImport = {
		messageBundleId: bundleId,
		messageLocale: args.locale,
		matches: [],
		pattern: pattern.result,
	};

	// base keys are the fallback for their context/plural siblings and get
	// explicit catchall matches (see the per-bundle summary in parseFile).
	const {
		hasPlurals: bundleHasPlurals,
		hasContext: bundleHasContext,
		hasZero: bundleHasZero,
		hasOrdinal: bundleHasOrdinal,
	} = args.bundleSelectors;

	const mixedPlurals = bundleHasOrdinal && bundleHasPlurals;
	const selectors: Message["selectors"] = [];
	const matches: Variant["matches"] = [];

	if (bundleHasContext) {
		bundle.declarations.push({
			type: "input-variable",
			name: "context",
		});
		selectors.push({
			type: "variable-reference",
			name: "context",
		});
		matches.push(
			hasContext
				? {
						type: "literal-match",
						// i18next always uses "context" as the key
						// "friend_male" -> ["friend", "male"]
						key: "context",
						value: context!,
					}
				: // the base key is the fallback for all context variants
					{
						type: "catchall-match",
						key: "context",
					}
		);
	}

	if (mixedPlurals) {
		// MF2 literals are strings. The consumer passes "ordinal" or
		// "cardinal", corresponding to i18next's ordinal option.
		bundle.declarations.push({ type: "input-variable", name: "pluralType" });
		selectors.push({ type: "variable-reference", name: "pluralType" });
		matches.push(
			isOrdinal || isZero
				? {
						type: "literal-match",
						key: "pluralType",
						value: isOrdinal ? "ordinal" : "cardinal",
					}
				: { type: "catchall-match", key: "pluralType" }
		);
	}

	if (bundleHasZero) {
		// `_zero` matches exactly `count === 0` in i18next, in every
		// language — expressed as a selector on the `count` input itself,
		// ahead of the plural category (the mechanism proposed in
		// https://github.com/opral/paraglide-js/issues/552).
		// https://github.com/opral/inlang/issues/4357
		selectors.push({
			type: "variable-reference",
			name: "count",
		});
		matches.push(
			isZero
				? {
						type: "literal-match",
						key: "count",
						value: "0",
					}
				: {
						type: "catchall-match",
						key: "count",
					}
		);
	}

	if (bundleHasOrdinal && !mixedPlurals) {
		bundle.declarations.push({
			type: "input-variable",
			name: "count",
		});
		bundle.declarations.push({
			type: "local-variable",
			name: "countOrdinal",
			value: {
				type: "expression",
				arg: {
					type: "variable-reference",
					name: "count",
				},
				annotation: {
					type: "function-reference",
					name: "plural",
					options: [
						{
							name: "type",
							value: { type: "literal", value: "ordinal" },
						},
					],
				},
			},
		});
		selectors.push({
			type: "variable-reference",
			name: "countOrdinal",
		});
		matches.push(
			isOrdinal
				? {
						type: "literal-match",
						key: "countOrdinal",
						value: keyParts.at(-1)!,
					}
				: // cardinal/zero/base variants are the fallback for ordinal
					// lookups of the same key
					{
						type: "catchall-match",
						key: "countOrdinal",
					}
		);
	}

	if (bundleHasPlurals) {
		bundle.declarations.push({
			type: "input-variable",
			name: "count",
		});
		bundle.declarations.push({
			type: "local-variable",
			name: "countPlural",
			value: {
				type: "expression",
				arg: {
					type: "variable-reference",
					name: "count",
				},
				annotation: {
					type: "function-reference",
					name: "plural",
					options: mixedPlurals
						? [
								{
									name: "type",
									value: { type: "variable-reference", name: "pluralType" },
								},
							]
						: [],
				},
			},
		});
		selectors.push({
			type: "variable-reference",
			// i18next only allows matching against a count variable.
			// suffixing plural here because the inlang sdk v2 purposefully
			// did not allow using a variable with a function like `plural`
			// without declaring a new variable
			name: "countPlural",
		});
		matches.push(
			// the exact `count = 0` variant matches any plural category
			(hasPlurals || (mixedPlurals && isOrdinal)) && !isZero
				? {
						type: "literal-match",
						key: "countPlural",
						value: keyParts.at(-1)!,
					}
				: // the base key is the fallback for all plural variants
					{
						type: "catchall-match",
						key: "countPlural",
					}
		);
	}

	message.selectors = selectors;
	variant.matches = matches;

	const variants: VariantImport[] = [variant];

	if (isZero) {
		// `_zero` additionally serves as the Intl "zero" plural category key,
		// which Latvian selects for 10, 11–19, 20, … too, so a second variant
		// keeps category-based selection working alongside the exact-0 match.
		//
		// Also where that category never selects a number other than 0
		// (English, French, Arabic, Welsh): the second variant keeps the
		// position of `_zero` among the plural keys of the file. Export writes
		// the keys in that order, and the exact-0 variant has to come before
		// the plural categories for first-match-wins consumers, so it can't
		// carry the position itself. Export writes the exact-0 text there.
		// Without it, `_zero` would move behind `_one` / `_other` on the first
		// export after an upgrade.
		variants.push({
			messageBundleId: bundleId,
			messageLocale: args.locale,
			matches: matches.map((match) =>
				match.key === "pluralType"
					? { type: "catchall-match", key: "pluralType" }
					: match.key === "count"
						? { type: "catchall-match", key: "count" }
						: match.key === "countPlural"
							? { type: "literal-match", key: "countPlural", value: "zero" }
							: match
			),
			pattern: pattern.result,
		});
	}

	bundle.declarations = removeDuplicates(bundle.declarations);

	return { bundle, message, variants };
}

function parsePattern(
	value: string,
	settings?: PluginSettings
): {
	variableReferences: VariableReference[];
	result: Pattern;
} {
	const result: Variant["pattern"] = [];
	const variableReferences: VariableReference[] = [];

	const pattern = settings?.variableReferencePattern ?? ["{{", "}}"];
	const openPattern = pattern[0];
	const closePattern = pattern[1];
	let buffer = "";

	const flushBuffer = () => {
		if (buffer.length > 0) {
			result.push({ type: "text", value: buffer });
			buffer = "";
		}
	};

	for (let index = 0; index < value.length; index += 1) {
		// parse interpolation first to avoid conflicts with custom patterns
		if (openPattern && closePattern && value.startsWith(openPattern, index)) {
			const closingIndex = value.indexOf(
				closePattern,
				index + openPattern.length
			);
			if (closingIndex !== -1) {
				flushBuffer();

				// i18next allows for annotations like `{{name, uppercase}}`
				const subparts = value
					.slice(index + openPattern.length, closingIndex)
					.split(",");

				const arg = subparts[0]?.trim();
				const annotation = subparts[1]?.trim();

				if (arg === undefined) {
					throw new Error(
						"Expected an argument in the expression but received undefined."
					);
				}

				const variableReference: VariableReference = {
					type: "variable-reference",
					name: arg,
				};

				variableReferences.push(variableReference);

				result.push({
					type: "expression",
					arg: variableReference,
					...(annotation && {
						annotation: {
							type: "function-reference",
							name: annotation,
							options: [],
						},
					}),
				});

				index = closingIndex + closePattern.length - 1;
				continue;
			}
		}

		const markupMatch = parseMarkupTagAt(value, index);
		if (markupMatch) {
			flushBuffer();
			result.push(markupMatch.part);
			index = markupMatch.endIndex;
			continue;
		}

		buffer += value[index]!;
	}

	flushBuffer();

	return { variableReferences, result };
}

function parseMarkupTagAt(
	value: string,
	startIndex: number
):
	| {
			part: Pattern[number];
			endIndex: number;
	  }
	| undefined {
	const rest = value.slice(startIndex);

	const standalone = rest.match(/^<([A-Za-z0-9][A-Za-z0-9_.-]*)\s*\/>/);
	if (standalone) {
		const name = standalone[1]!;
		return {
			part: { type: "markup-standalone", name },
			endIndex: startIndex + standalone[0].length - 1,
		};
	}

	const end = rest.match(/^<\/([A-Za-z0-9][A-Za-z0-9_.-]*)\s*>/);
	if (end) {
		const name = end[1]!;
		return {
			part: { type: "markup-end", name },
			endIndex: startIndex + end[0].length - 1,
		};
	}

	const start = rest.match(/^<([A-Za-z0-9][A-Za-z0-9_.-]*)\s*>/);
	if (start) {
		const name = start[1]!;
		return {
			part: { type: "markup-start", name },
			endIndex: startIndex + start[0].length - 1,
		};
	}

	return undefined;
}
const removeDuplicates = <T extends any[]>(arr: T) =>
	[...new Set(arr.map((item) => JSON.stringify(item)))].map((item) =>
		JSON.parse(item)
	);

const PLURAL_CATEGORIES = new Set([
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
]);

type BundleSelectors = {
	hasPlurals: boolean;
	hasContext: boolean;
	hasZero: boolean;
	hasOrdinal: boolean;
};

type KeyClassification = {
	keyParts: string[];
	rootKey: string;
	context?: string;
	isOrdinal: boolean;
	isCardinalPlural: boolean;
	isZero: boolean;
	hasContext: boolean;
};

/**
 * Strips i18next's plural suffix from a key.
 *
 * - cardinal plural categories: `key_one`, `key_other`, ...
 *   (https://www.i18next.com/misc/json-format#i18next-json-v4)
 * - ordinal plurals use the reserved `_ordinal_<category>` suffix:
 *   `key_ordinal_one`
 *   (https://www.i18next.com/translation-function/plurals#ordinal-plurals)
 * - cardinal `key_zero` is also an exact `count === 0` match; ordinal
 *   `key_ordinal_zero` is only the Intl ordinal "zero" category
 *   (https://www.i18next.com/translation-function/plurals)
 */
function splitPluralSuffix(key: string): {
	stem: string;
	keyParts: string[];
	isOrdinal: boolean;
	isCardinalPlural: boolean;
	isZero: boolean;
} {
	const keyParts = key.split("_");
	const category = keyParts.at(-1);
	const hasPluralCategory =
		category !== undefined && PLURAL_CATEGORIES.has(category);
	// `key_ordinal_one` needs a root before the reserved marker. A key like
	// `ordinal_one` is the cardinal plural of a key named "ordinal".
	const isOrdinal =
		hasPluralCategory && keyParts.length >= 3 && keyParts.at(-2) === "ordinal";

	if (isOrdinal) {
		return {
			stem: keyParts.slice(0, -2).join("_"),
			keyParts,
			isOrdinal: true,
			isCardinalPlural: false,
			isZero: false,
		};
	}

	if (hasPluralCategory && keyParts.length >= 2) {
		return {
			stem: keyParts.slice(0, -1).join("_"),
			keyParts,
			isOrdinal: false,
			isCardinalPlural: true,
			isZero: category === "zero",
		};
	}

	return {
		stem: key,
		keyParts,
		isOrdinal: false,
		isCardinalPlural: false,
		isZero: false,
	};
}

/**
 * Prefixes whose last `_` segment is an i18next context value.
 *
 * A prefix qualifies when at least two stems differ only in that segment
 * (`key_separator_context_male` / `key_separator_context_female`, including
 * after a plural suffix is stripped: `..._male_one` / `..._female_one`) or
 * when the prefix itself is a stem (the base key, `friend` beside
 * `friend_male`).
 */
function findContextRoots(stems: string[]): Set<string> {
	const stemSet = new Set(stems);
	const childrenByParent = new Map<string, Set<string>>();
	for (const stem of stemSet) {
		const underscore = stem.lastIndexOf("_");
		if (underscore <= 0) continue;
		const parent = stem.slice(0, underscore);
		const child = stem.slice(underscore + 1);
		const children = childrenByParent.get(parent) ?? new Set<string>();
		children.add(child);
		childrenByParent.set(parent, children);
	}
	const roots = new Set<string>();
	for (const [parent, children] of childrenByParent) {
		if (children.size >= 2 || stemSet.has(parent)) {
			roots.add(parent);
		}
	}
	return roots;
}

/**
 * Classifies an i18next key by its suffixes — the single source of truth for
 * the per-bundle summary in `parseFile` and the per-key parsing in
 * `parseMessage`.
 *
 * Plural and ordinal suffixes are stripped first. The remaining stem is the
 * bundle id, unless `findContextRoots` recognized the stem's parent prefix.
 * In that case the last segment is the context value
 * (`friend_male` -> `friend` + `male`,
 * `key_separator_context_male_ordinal_one` -> `key_separator_context` +
 * `male`). A key that contains underscores and has no context siblings keeps
 * those underscores in the bundle id.
 * https://www.i18next.com/translation-function/context
 */
function classifyKey(
	key: string,
	contextRoots: Set<string>,
	contextValues?: string[]
): KeyClassification {
	const { stem, keyParts, isOrdinal, isCardinalPlural, isZero } =
		splitPluralSuffix(key);

	let rootKey = stem;
	let context: string | undefined;
	if (contextValues !== undefined) {
		// Explicit values resolve ambiguity without truncating literal keys.
		// Longest suffix wins when values themselves contain underscores.
		context = contextValues.find(
			(value) =>
				value.length > 0 &&
				stem.endsWith(`_${value}`) &&
				stem.length > value.length + 1
		);
		if (context !== undefined) rootKey = stem.slice(0, -context.length - 1);
	} else {
		for (
			let index = stem.lastIndexOf("_");
			index > 0;
			index = stem.lastIndexOf("_", index - 1)
		) {
			const parent = stem.slice(0, index);
			if (contextRoots.has(parent)) {
				rootKey = parent;
				context = stem.slice(index + 1);
				break;
			}
		}
	}

	return {
		keyParts,
		rootKey,
		context,
		isOrdinal,
		isCardinalPlural,
		isZero,
		hasContext: context !== undefined,
	};
}
