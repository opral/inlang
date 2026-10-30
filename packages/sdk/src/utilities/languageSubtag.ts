/**
 * The primary language subtag of a BCP 47 locale tag, e.g. `en-US` -> `en`
 * and `zh-Hant-TW` -> `zh`. The subtag is used for `{language}` placeholders
 * in path patterns, which let projects organize files by base language
 * instead of the full locale.
 *
 * If the locale is not a valid BCP 47 language tag, the locale is returned
 * unchanged, so that `{language}` behaves exactly like `{locale}`.
 */
export function getPrimaryLanguageSubtag(locale: string): string {
	// the primary language subtag of a BCP 47 tag consists of 2-8 ASCII
	// letters (which includes the 4-letter subtags reserved for future use),
	// followed by any number of variant, region, or extension subtags.
	if (/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(locale) === false) {
		return locale;
	}
	return locale.split("-")[0]!;
}
