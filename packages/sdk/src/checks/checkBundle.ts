import type {
	Declaration,
	VariableReference,
	Pattern,
} from "../json-schema/pattern.js";
import type { Match } from "../database/schema.js";
import type { CheckDiagnostic, CheckId } from "./types.js";
import { checkTranslation } from "./translations.js";

/**
 * The structure `checkBundle` reads. Both nested database rows (`BundleNested`)
 * and the camelCase shapes plugins and applications keep in memory fit; other
 * properties are ignored.
 */
export type CheckableBundle = {
	id: string;
	declarations: readonly Declaration[];
	messages: readonly {
		id: string;
		locale: string;
		selectors: readonly VariableReference[];
		variants: readonly {
			id: string;
			matches: readonly Match[];
			pattern: Pattern;
		}[];
	}[];
};

export type CheckBundleArgs = {
	bundle: CheckableBundle;
	/** Locales the bundle must be translated into (`settings.locales`). The reference locale is always included. */
	locales: readonly string[];
	/** Locale translations are compared with (`settings.baseLocale`). */
	referenceLocale: string;
	/** Checks to run. Defaults to all translation checks; `unused-message` needs `checkProject`. */
	checks?: readonly CheckId[];
	/** Intentional fallback: locales of this bundle that may be missing or empty. */
	ignoreMissingTranslations?: readonly string[];
};

/**
 * The translation diagnostics of one bundle, synchronously and without a
 * project: the same results `checkProject` reports for the bundle, except
 * `unused-message`.
 *
 * For editors that keep bundles in memory: check a bundle again whenever it
 * changes instead of re-checking the project. Diagnostics are ordered by
 * locale (reference first, then `locales`), then as {@link checkTranslation}
 * reports them.
 *
 * - `missing-translation`: the bundle has no message for a locale.
 * - `empty-translation`: every variant of a locale's message is empty, the
 *   reference locale's included.
 * - `missing-variant`: also checked for the reference locale, against its own
 *   selectors.
 * - `missing-variable`, `unknown-variable`, `missing-markup`: compared with
 *   the reference locale's message.
 */
export function checkBundle(args: CheckBundleArgs): CheckDiagnostic[] {
	const { bundle, referenceLocale } = args;
	const enabled = args.checks ? new Set(args.checks) : undefined;
	const wanted = (id: CheckId) => !enabled || enabled.has(id);
	const ignored = new Set(args.ignoreMissingTranslations ?? []);
	const diagnostics: CheckDiagnostic[] = [];
	const reference = bundle.messages.find(
		(message) => message.locale === referenceLocale
	);
	const id = JSON.stringify(bundle.id);
	const base = { bundleId: bundle.id, severity: "warning" as const };
	for (const locale of new Set([referenceLocale, ...args.locales])) {
		const where = JSON.stringify(locale);
		const target = bundle.messages.find((message) => message.locale === locale);
		if (!target) {
			if (wanted("missing-translation") && !ignored.has(locale))
				diagnostics.push({
					...base,
					fixes: [],
					locale,
					checkId: "missing-translation",
					message: `Message ${id} has no translation for ${where}.`,
				});
			continue;
		}
		const messageId = target.id;
		for (const issue of checkTranslation({
			reference,
			target,
			declarations: bundle.declarations,
		})) {
			// The reference is only checked for emptiness and its own variants.
			if (
				locale === referenceLocale &&
				issue.type !== "missing-translation" &&
				issue.type !== "missing-variant"
			)
				continue;
			if (issue.type === "missing-translation") {
				if (wanted("empty-translation") && !ignored.has(locale))
					diagnostics.push({
						...base,
						fixes: [],
						locale,
						checkId: "empty-translation",
						messageId,
						message: `Message ${id} has an empty translation for ${where}.`,
					});
			} else if (!wanted(issue.type)) continue;
			else if (issue.type === "missing-variable")
				diagnostics.push({
					...base,
					fixes: [],
					locale,
					checkId: "missing-variable",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					message: `Message ${id} is missing {${issue.name}} in ${where}.`,
				});
			else if (issue.type === "unknown-variable")
				diagnostics.push({
					...base,
					fixes: [],
					locale,
					checkId: "unknown-variable",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
					message: `Message ${id} uses {${issue.name}} in ${where}, which ${JSON.stringify(referenceLocale)} doesn't use${issue.suggestion ? `. Did you mean {${issue.suggestion}}?` : "."}`,
				});
			else if (issue.type === "missing-markup")
				diagnostics.push({
					...base,
					fixes: [],
					locale,
					checkId: "missing-markup",
					messageId,
					variantId: issue.variantId!,
					name: issue.name,
					message: `Message ${id} is missing the <${issue.name}> markup in ${where}.`,
				});
			else
				diagnostics.push({
					...base,
					fixes: [],
					locale,
					checkId: "missing-variant",
					messageId,
					matches: issue.matches.map((match) => ({ ...match })),
					message: `Message ${id} has no variant for ${issue.matches.map((match) => `${match.key}=${match.type === "literal-match" ? match.value : "*"}`).join(", ")} in ${where}.`,
				});
		}
	}
	return diagnostics;
}
