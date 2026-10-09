import { isObject, setOwn } from "./messageKeys.js";

export type SortDirection = "asc" | "desc";

const compare =
	(direction: SortDirection) =>
	(a: string, b: string): number =>
		direction === "desc" ? b.localeCompare(a) : a.localeCompare(b);

/**
 * Sorts the keys of messages and of the objects that nest them.
 *
 * Messages themselves are not touched: the order of the variants in the
 * `match` of a complex message is the order in which runtimes like
 * Paraglide JS 2.26 try them, so the catch-all has to stay last. Messages
 * are strings and arrays, nesting objects are objects.
 */
export const sortMessageKeys = <T extends Record<string, unknown>>(
	value: T,
	direction: SortDirection
): T => {
	const sorted: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value).sort((a, b) =>
		compare(direction)(a[0], b[0])
	)) {
		setOwn(
			sorted,
			key,
			isObject(entry) ? sortMessageKeys(entry, direction) : entry
		);
	}
	return sorted as T;
};
