/**
 * Nesting and flattening of message keys at their dots, `nav.home` <->
 * `{ "nav": { "home": … } }`.
 *
 * Earlier versions used `flatten` and `unflatten` of the `flat` package.
 * `unflatten` walked into the values of messages and split the keys of a
 * `match` at dots (`count=1.5` -> `"count=1": [null, …, "…"]`), and it made
 * arrays of number segments (`steps.0` -> `"steps": ["…"]`). The import
 * reads both shapes as what they were written for.
 */

/**
 * Nests the messages of a file at the dots of their keys, as the import
 * flattens them. Messages, i.e. strings and complex messages, are never
 * walked into, and every segment is an object key, also a number.
 *
 * A key whose path goes through another message, e.g. `a.b` next to `a`, is
 * written with the rest of its dots in the deepest object it can go into,
 * here `"a.b"` at the top. A key with an empty segment (`a.`, `.a`, `a..b`)
 * is written as it is at the top.
 */
export function nestMessageKeys(
	messages: ReadonlyMap<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const isMessage = (key: string) => messages.has(key);
	for (const [key, value] of messages) {
		const path = messageKeyPath(key, isMessage);
		let target = result;
		for (const segment of path.slice(0, -1)) {
			if (!hasOwn(target, segment)) setOwn(target, segment, {});
			target = target[segment] as Record<string, unknown>;
		}
		setOwn(target, path[path.length - 1]!, value);
	}
	return result;
}

/**
 * The keys from the root of the file under which `nestMessageKeys` writes
 * the message `key`, e.g. `["nav", "home"]` for `nav.home`, and `["a.b"]` for
 * `a.b` if `a` is a message too.
 */
export function messageKeyPath(
	key: string,
	isMessage: (key: string) => boolean
): string[] {
	const segments = key.split(".");
	if (segments.some((segment) => segment === "")) return [key];
	let depth = 0;
	// a message can't be an object of other messages
	while (
		depth < segments.length - 1 &&
		isMessage(segments.slice(0, depth + 1).join(".")) === false
	) {
		depth++;
	}
	return [...segments.slice(0, depth), segments.slice(depth).join(".")];
}

/**
 * The messages of a file by key, nested objects joined at dots.
 *
 * Like `flatten(json, { safe: true })` of the `flat` package, which earlier
 * versions used, except for arrays that are not a complex message: they are
 * objects with number keys, as `unflatten` wrote them. `null` in them is a
 * hole, not a message. And a complex message under the key `"0"` of an
 * object, `{ "a": { "0": {…}, "b": … } }`, is the message of the object's key
 * (`a`), which `unflatten` wrote that way if `a.b` came before `a`.
 */
export function flattenMessageKeys(
	json: Record<string, unknown>
): Map<string, unknown> {
	const result = new Map<string, unknown>();
	// keys of the messages in an object with a legacy complex message
	const legacy = new Set<string>();
	/**
	 * @param lenient whether a value that is no message is ignored, in the
	 *   legacy shapes, which can have other keys of a complex message
	 */
	const set = (
		key: string,
		value: unknown,
		inLegacy: boolean,
		lenient: boolean
	) => {
		if (
			lenient &&
			typeof value !== "string" &&
			!(Array.isArray(value) && value.length > 0 && isComplexMessage(value))
		) {
			return;
		}
		if (inLegacy) legacy.add(key);
		// A message in such an object wins over the same key elsewhere, e.g. a
		// flat `"a.b"` that a later export added for an edit while it kept
		// the object. The file then reads differently from the data, and the
		// export writes it in full.
		else if (legacy.has(key)) return;
		// the last of two equal keys wins, at the position of the first
		result.set(key, value);
	};
	/**
	 * A complex message `a`. `unflatten` wrote the keys after it that start
	 * with `a.0.` and `a.<n>.` into its object and array, e.g. `[{
	 * declarations, selectors, match, "0": {…} }]` for `a` and the complex
	 * message `a.0`, or `[{ …, x }, { y }]` for `a`, `a.0.x` and `a.1.y`.
	 *
	 * Only shapes that can't be a complex message as it is written by hand
	 * are split: in its object under `"0"` (see `visit`), with an entry after
	 * it that is no complex message, or with a complex message under `"0"`.
	 * Otherwise other keys, e.g. a `description`, are ignored as before.
	 * Further complex message objects in the array are ignored as before.
	 */
	const complex = (
		key: string,
		items: unknown[],
		inLegacy: boolean,
		lenient: boolean,
		inObject: boolean
	) => {
		const [first, ...later] = items as [Record<string, unknown>, ...unknown[]];
		const { declarations, selectors, match, ...rest } = first;
		const split =
			inObject ||
			isComplexMessageObject(rest["0"]) ||
			later.some(
				(item) =>
					item !== null &&
					item !== undefined &&
					isComplexMessageObject(item) === false
			);
		if (split === false) {
			set(key, items, inLegacy, lenient);
			return;
		}
		set(
			key,
			[
				Object.fromEntries(
					Object.entries({ declarations, selectors, match }).filter(
						([, part]) => part !== undefined
					)
				),
			],
			inLegacy,
			lenient
		);
		// like the messages next to `{ "0": … }`, these win over the same key
		// elsewhere in the file
		if (Object.keys(rest).length > 0) {
			visit(`${key}.0`, rest, true, true);
		}
		later.forEach((item, index) => {
			if (item === null || item === undefined) return;
			if (isComplexMessageObject(item)) return;
			visit(`${key}.${index + 1}`, item, true, true);
		});
	};
	const visit = (
		key: string,
		value: unknown,
		inLegacy: boolean,
		lenient: boolean
	) => {
		if (isObject(value) && Object.keys(value).length > 0) {
			const legacyObject = key !== "" && isComplexMessageObject(value["0"]);
			for (const child of Object.keys(value)) {
				if (legacyObject && child === "0") {
					// `unflatten` wrote the complex message `a` as `{ "0": … }`
					// into the object of a key after it, e.g. `a.b`
					complex(key, [value[child]], true, lenient, true);
					continue;
				}
				// `flatten` doesn't join to an empty key
				visit(
					key ? `${key}.${child}` : child,
					value[child],
					inLegacy || legacyObject,
					lenient
				);
			}
		} else if (
			Array.isArray(value) &&
			value.length > 0 &&
			isComplexMessage(value) === false
		) {
			value.forEach((item, index) => {
				if (item === null || item === undefined) return;
				visit(key ? `${key}.${index}` : String(index), item, inLegacy, lenient);
			});
		} else if (Array.isArray(value) && value.length > 0) {
			complex(key, value, inLegacy, lenient, false);
		} else {
			set(key, value, inLegacy, lenient);
		}
	};
	for (const key of Object.keys(json)) {
		visit(key, json[key], false, false);
	}
	return result;
}

/**
 * Whether an array is a complex message, `[{ declarations, selectors,
 * match }]`, and not an array that `unflatten` made of number keys. In those,
 * a complex message is an array itself and an object is a nested key, also
 * one with a key named `match` (`items.0.match` -> `[{ "match": "…" }]`):
 * in a complex message, `match` is an object (or an array in a legacy
 * form), and `declarations` and `selectors` are arrays.
 */
function isComplexMessage(value: unknown[]): boolean {
	const first = value[0];
	if (!isObject(first)) return false;
	const has = (key: string) => hasOwn(first, key);
	return (
		(has("match") || has("declarations") || has("selectors")) &&
		(!has("match") ||
			(typeof first.match === "object" && first.match !== null)) &&
		(!has("declarations") || Array.isArray(first.declarations)) &&
		(!has("selectors") || Array.isArray(first.selectors))
	);
}

/**
 * An object that is all of a complex message, `{ declarations: […],
 * selectors: […], match: {…} }`, as earlier versions wrote it.
 */
function isComplexMessageObject(value: unknown): boolean {
	return (
		isObject(value) &&
		Array.isArray(value.declarations) &&
		Array.isArray(value.selectors) &&
		typeof value.match === "object" &&
		value.match !== null
	);
}

/**
 * The variants of the `match` of a complex message, by key.
 *
 * An array or object instead of a pattern is what earlier versions wrote for
 * keys with dots, e.g. `"count=1": [null, …, "…"]` for `count=1.5` and
 * `"channel=v1": { "beta": "…" }` for `channel=v1.beta`. Its keys are joined
 * back at dots. Number segments come back as numbers, e.g. `count=1.05`,
 * which `unflatten` wrote at index 5, as `count=1.5`.
 */
export function matchEntries(match: unknown): Array<[string, unknown]> {
	const entries: Array<[string, unknown]> = [];
	const visit = (key: string, value: unknown) => {
		if (Array.isArray(value) && value.length > 0) {
			value.forEach((item, index) => {
				if (item === null || item === undefined) return;
				visit(`${key}.${index}`, item);
			});
		} else if (isObject(value) && Object.keys(value).length > 0) {
			for (const child of Object.keys(value)) {
				visit(`${key}.${child}`, value[child]);
			}
		} else {
			entries.push([key, value]);
		}
	};
	for (const [key, value] of Object.entries(match as object)) {
		visit(key, value);
	}
	return entries;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

/** `object[key] = value`, also for `__proto__`. */
export function setOwn(
	object: Record<string, unknown>,
	key: string,
	value: unknown
): void {
	Object.defineProperty(object, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}
