const cache = new Map<string, Record<string, string>>();

/** Integers that are sampled. Larger numbers catch categories like French "many". */
const MAX_INTEGER = 200;
const LARGE_INTEGERS = [1000, 10000, 100000, 1000000];
const DECIMALS = [1.5, 0.5, 2.5, 0.1, 1.1, 2.1, 0.2];
/** How many numbers are shown per category. A range ("5–20") counts as two. */
const BUDGET = 3;

/**
 * Example numbers for each plural category of a locale, for UI hints.
 *
 * Integers 0…200 (plus a few large numbers) are grouped into consecutive
 * runs and compressed into ranges. At most three numbers are shown (a range
 * counts as two), followed by "…" when more exist. Categories that no
 * integer reaches show a decimal example instead (e.g. Russian "other" → "1.5").
 *
 * `exclude` leaves out numbers that have their own form, such as an ICU
 * `=0` next to the plural: English "other" then shows "2, 3, 4…", not
 * "0, 2, 3…". A category whose every number is excluded has no example.
 *
 * Returns an empty object for unsupported or invalid locales rather than
 * guessing another language's rules.
 *
 * @example
 * pluralExamples("ru")
 * // { one: "1, 21, 31…", few: "2–4, 22…", many: "0, 5–20…", other: "1.5" }
 * pluralExamples("en", "cardinal", { exclude: [0] })
 * // { one: "1", other: "2, 3, 4…" }
 */
export function pluralExamples(
	locale: string,
	type: "cardinal" | "ordinal" = "cardinal",
	options: { exclude?: Iterable<number | string> } = {}
): Record<string, string> {
	const exclude = new Set(
		[...(options.exclude ?? [])].map(Number).filter(Number.isFinite)
	);
	const key = `${locale}\u0000${type}\u0000${[...exclude].sort((a, b) => a - b).join()}`;
	const cached = cache.get(key);
	if (cached) return cached;
	let rules: Intl.PluralRules;
	try {
		if (!Intl.PluralRules.supportedLocalesOf(locale).length) return {};
		rules = new Intl.PluralRules(locale, { type });
	} catch {
		return {};
	}
	const integers = new Map<string, number[]>();
	for (const number of [
		...Array.from({ length: MAX_INTEGER + 1 }, (_, index) => index),
		...LARGE_INTEGERS,
	]) {
		if (exclude.has(number)) continue;
		const category = rules.select(number);
		const list = integers.get(category) ?? [];
		list.push(number);
		integers.set(category, list);
	}
	const result: Record<string, string> = {};
	for (const category of rules.resolvedOptions().pluralCategories) {
		const numbers = integers.get(category);
		if (numbers?.length) {
			result[category] = describe(numbers);
			continue;
		}
		const decimal = DECIMALS.find(
			(value) => !exclude.has(value) && rules.select(value) === category
		);
		if (decimal !== undefined) result[category] = String(decimal);
	}
	if (cache.size >= 128) cache.delete(cache.keys().next().value!);
	cache.set(key, result);
	return result;
}

function describe(numbers: number[]): string {
	// group consecutive integers into runs
	const runs: Array<[number, number]> = [];
	for (const number of numbers) {
		const last = runs[runs.length - 1];
		if (last && number === last[1] + 1) last[1] = number;
		else runs.push([number, number]);
	}
	const parts: string[] = [];
	let budget = BUDGET;
	let truncated = false;
	for (let index = 0; index < runs.length; index++) {
		const [start, end] = runs[index]!;
		if (budget <= 0) {
			truncated = true;
			break;
		}
		// a run that reaches the sampling limit is open-ended: list its first numbers
		const openEnded = end === MAX_INTEGER && start < end;
		if (start === end) {
			parts.push(String(start));
			budget -= 1;
		} else if (!openEnded && budget >= 2) {
			parts.push(`${start}–${end}`);
			budget -= 2;
		} else {
			for (let n = start; n <= end && budget > 0; n++, budget--) {
				parts.push(String(n));
			}
			truncated = true;
			break;
		}
	}
	return parts.join(", ") + (truncated ? "…" : "");
}
