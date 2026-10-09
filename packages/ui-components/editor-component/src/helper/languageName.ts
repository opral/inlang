const cache = new Map<string, string>();

/** English display name of a locale ("ru" → "Russian"), or the tag itself. */
export function languageName(locale: string, displayLocale = "en"): string {
	const key = `${displayLocale}\u0000${locale}`;
	const cached = cache.get(key);
	if (cached) return cached;
	let name = locale;
	try {
		name =
			new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ??
			locale;
	} catch {
		name = locale;
	}
	cache.set(key, name);
	return name;
}
