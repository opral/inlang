const zeroCategoryCache = new Map<string, boolean>();

/**
 * True when the cardinal plural category "zero" of `locale` selects numbers
 * other than 0 (Latvian: 10, 11–19, 20, …), so i18next's `_zero` key is also
 * a plural category there and not only the exact `count === 0` form.
 *
 * Uses the plural rules Intl resolves for the tag, like i18next at runtime,
 * also for legacy tags (`iw` → Hebrew) and for tags Intl has no rules for
 * (`dev`), where Intl falls back to another language. An invalid tag is
 * "no", like the earlier versions of this plugin that never checked.
 */
export function zeroCategorySelectsNonZero(locale: string): boolean {
	const cached = zeroCategoryCache.get(locale);
	if (cached !== undefined) return cached;
	let result = false;
	try {
		// i18next and file names often use `pt_BR`; Intl needs `pt-BR`
		const rules = new Intl.PluralRules(locale.replace(/_/g, "-"));
		result =
			rules.resolvedOptions().pluralCategories.includes("zero") &&
			[...Array.from({ length: 1000 }, (_, n) => n + 1), 0.1, 0.5, 1.5].some(
				(n) => rules.select(n) === "zero"
			);
	} catch {
		// invalid locale tag
	}
	zeroCategoryCache.set(locale, result);
	return result;
}
