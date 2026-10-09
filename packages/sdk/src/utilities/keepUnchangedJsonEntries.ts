import type {
	Bundle,
	Message,
	Variant,
	NewBundle,
} from "../database/schema.js";
import type {
	InlangPlugin,
	MessageImport,
	VariantImport,
} from "../plugin/schema.js";
import type { ExistingFile, ExportFile } from "../project/api.js";

/**
 * Keeps the text of unchanged entries of JSON translation files.
 *
 * A plugin's `exportFiles` writes whole files from data. Every difference
 * between how a file was written and how the plugin writes it (legacy shapes,
 * key order, escaping, whitespace) would show up in git on every export.
 * This function takes the files of a full export and, for each file that
 * replaces one of `files`, writes the previous text of every entry that didn't
 * change:
 *
 * - An entry is unchanged if the plugin writes the same JSON value for it as
 *   for what the previous entry imports to (the previous files are imported
 *   together, like a project is loaded, and exported with the plugin's own
 *   `importFiles` and `exportFiles`), or if the previous entry already is that
 *   value.
 * - Existing keys keep their order. New keys are inserted after the key that
 *   precedes them in the full export (e.g. sorted, if the plugin sorts).
 *   Removed keys are dropped. Keys that the plugin neither imports nor writes
 *   are kept.
 * - The formatting of the file (indentation, line endings, final newline,
 *   byte order mark) is kept. Changed and new entries are indented like their
 *   neighbors.
 *
 * Previous files that the export doesn't replace but that hold messages the
 * project no longer has (e.g. every message of a locale or a namespace was
 * deleted) are returned without those messages, so that they don't come back
 * on the next load, if the project read them (`ExistingFile.imported`).
 * Keys that aren't messages, like `$schema`, and the formatting stay; a file
 * without anything else becomes `{}`. The file is kept, not deleted. See
 * `emptiedFiles`.
 *
 * The result is only used if the plugin reads it as the full export, i.e. if
 * importing the resulting files together and exporting them gives the full
 * export. Otherwise, and if a previous file is not valid JSON, the full export
 * of that file is returned. Files that keep the previous text are marked as
 * `verbatim`, so that hosts write them byte for byte.
 *
 * Objects are compared without their key order, except inside arrays: the
 * order of e.g. the variants of a message-format `match` is meaningful.
 *
 * @example
 *   exportFiles: async (args) =>
 *     keepUnchangedJsonEntries({
 *       exported: await exportWholeFiles(args),
 *       files: args.files,
 *       settings: args.settings,
 *       importFiles,
 *       exportFiles: exportWholeFiles,
 *     })
 */
export async function keepUnchangedJsonEntries<Settings>(args: {
	/** The files of the full export, i.e. without the previous files. */
	exported: ExportFile[];
	/** The `files` argument of `exportFiles`. */
	files: readonly ExistingFile[] | undefined;
	settings: Settings;
	/** The plugin's `importFiles`. */
	importFiles: (args: {
		files: Array<{
			locale: string;
			content: Uint8Array;
			toBeImportedFilesMetadata?: Record<string, any>;
		}>;
		settings: Settings;
	}) => ReturnType<NonNullable<InlangPlugin["importFiles"]>>;
	/** The plugin's `exportFiles` that writes whole files. */
	exportFiles: (args: {
		bundles: Bundle[];
		messages: Message[];
		variants: Variant[];
		settings: Settings;
	}) => ReturnType<NonNullable<InlangPlugin["exportFiles"]>>;
	/**
	 * Whether `exported` replaces `existing`. Defaults to the same locale and
	 * the same `metadata.namespace`.
	 */
	isSameFile?: (exported: ExportFile, existing: ExistingFile) => boolean;
	/**
	 * The path that a flat key of a previous file can stand for, for plugins
	 * that write nested objects, e.g. `"nav.home"` -> `["nav", "home"]` (the
	 * default). Lets a previous file keep flat keys. Only used for keys that
	 * the full export doesn't have.
	 */
	splitKey?: (key: string) => string[];
	/**
	 * Whether the object at `path` (keys from the root of the file) is one
	 * entry, i.e. is written in full if anything in it changed. By default,
	 * objects are walked key by key.
	 */
	isEntry?: (path: string[]) => boolean;
	/** Indentation of new entries if the previous file has none. Defaults to a tab. */
	indent?: string;
}): Promise<ExportFile[]> {
	if (args.files === undefined || args.files.length === 0) {
		return args.exported;
	}
	const isSameFile = args.isSameFile ?? isSameLocaleAndNamespace;
	const existingFiles = args.files;
	const pairs = args.exported.map((file) => {
		const matches = existingFiles.filter((candidate) =>
			isSameFile(file, candidate)
		);
		return {
			file,
			// With several existing files (e.g. a `pathPattern` array), the
			// host writes the exported file to each of them, so none can be kept.
			existing: matches.length === 1 ? matches[0] : undefined,
			exportedText: decodeUtf8(file.content),
			/** the text to write if it keeps entries of the existing file */
			kept: undefined as string | undefined,
			/** for an emptied file: the parsed previous file */
			emptiedFrom: undefined as Record<string, unknown> | undefined,
		};
	});
	// previous files that hold deleted messages and that the export doesn't
	// replace, e.g. every message of a locale was deleted (see emptiedFiles)
	for (const emptied of await emptiedFiles({
		exported: args.exported,
		files: existingFiles,
		settings: args.settings,
		importFiles: args.importFiles,
		isSameFile,
	})) {
		pairs.push({
			file: emptied.file,
			existing: emptied.existing,
			exportedText: decodeUtf8(emptied.file.content),
			kept: undefined,
			emptiedFrom: emptied.previous,
		});
	}
	const withExisting = pairs.filter((pair) => pair.existing !== undefined);
	if (withExisting.length === 0) {
		return args.exported;
	}
	// files that the export writes as they are need no comparison
	if (
		withExisting.every(
			(pair) => decodeUtf8(pair.existing!.content) === pair.exportedText
		)
	) {
		return pairs.map((pair) =>
			pair.existing === undefined ? pair.file : { ...pair.file, verbatim: true }
		);
	}

	/**
	 * The JSON value of every file the plugin writes for `files`, imported
	 * together like a project is loaded, by locale and name.
	 */
	const canonical = async (
		files: ReadonlyArray<{
			locale: string;
			content: Uint8Array;
			metadata?: Record<string, any>;
		}>
	): Promise<Map<string, unknown>> => {
		const imported = await args.importFiles({
			files: files.map(({ locale, content, metadata }) => ({
				locale,
				content,
				toBeImportedFilesMetadata: metadata,
			})),
			settings: structuredClone(args.settings),
		});
		const exported = await args.exportFiles({
			...rowsFromImport(imported),
			settings: structuredClone(args.settings),
		});
		const result = new Map<string, unknown>();
		for (const file of exported) {
			result.set(fileKey(file), JSON.parse(decodeUtf8(file.content)));
		}
		return result;
	};

	let previousCanonical: Map<string, unknown>;
	try {
		previousCanonical = await canonical(existingFiles);
	} catch {
		// e.g. a previous file can't be imported
		return pairs.map((pair) => pair.file);
	}

	for (const pair of withExisting) {
		const previous = decodeUtf8(pair.existing!.content);
		if (previous === pair.exportedText) {
			pair.kept = previous;
			continue;
		}
		try {
			pair.kept = stringifyJsonKeepingEntries({
				previous,
				// an emptied file removes every key that imports to a message
				previousCanonical:
					pair.emptiedFrom ?? previousCanonical.get(fileKey(pair.file)),
				next: JSON.parse(pair.exportedText),
				splitKey: args.splitKey,
				isEntry: args.isEntry,
				indent: args.indent,
			});
		} catch {
			pair.kept = undefined;
		}
	}

	// Only use the results if the plugin reads the files as they will be on
	// disk exactly like the full export: the exported files, and existing
	// files that the export doesn't replace. This guarantees that no edit is
	// lost, e.g. if a previous file has a shape that this function doesn't
	// understand, or kept text of one file changes how another one is read.
	//
	// The files are read in the order a project load reads them, the order of
	// `files` (`toBeImportedFiles`): when files have the same message (e.g.
	// overlapping i18next namespaces), the one read last wins, so another
	// order can accept kept text that loses an edit on the next load. An
	// exported file goes to the place of the file it replaces (to every place,
	// if it replaces several, like the host writes it to every file of a
	// `pathPattern` array); new files, whose place isn't known, go last.
	const onDisk = () => {
		const contentOf = (pair: (typeof pairs)[number]) =>
			pair.kept === undefined || pair.kept === pair.exportedText
				? pair.file.content
				: new TextEncoder().encode(pair.kept);
		const placed = new Set<(typeof pairs)[number]>();
		const result: Array<{
			locale: string;
			content: Uint8Array;
			metadata?: Record<string, any>;
		}> = [];
		for (const existing of existingFiles) {
			const pair =
				pairs.find((candidate) => candidate.existing === existing) ??
				pairs.find(
					(candidate) =>
						candidate.existing === undefined &&
						isSameFile(candidate.file, existing)
				);
			if (pair === undefined) {
				// untouched by the export
				result.push(existing);
				continue;
			}
			placed.add(pair);
			result.push({
				locale: existing.locale,
				metadata: existing.metadata,
				content: contentOf(pair),
			});
		}
		for (const pair of pairs) {
			if (placed.has(pair)) continue;
			result.push({
				locale: pair.file.locale,
				metadata: pair.file.metadata,
				content: contentOf(pair),
			});
		}
		return result;
	};
	const changed = () =>
		pairs.filter(
			(pair) => pair.kept !== undefined && pair.kept !== pair.exportedText
		);
	if (changed().length > 0) {
		let expected: Map<string, unknown> | undefined;
		try {
			const kept = pairs.map((pair) => pair.kept);
			for (const pair of pairs) pair.kept = undefined;
			expected = await canonical(onDisk());
			pairs.forEach((pair, index) => (pair.kept = kept[index]));
		} catch {
			expected = undefined;
		}
		// Files that fail are written in full, which can change how the others
		// are read, so check again. After a few rounds, write everything in full.
		for (let round = 0; ; round++) {
			const toCheck = changed();
			if (toCheck.length === 0) break;
			if (expected === undefined || round === 3) {
				for (const pair of pairs) pair.kept = undefined;
				break;
			}
			let result: Map<string, unknown>;
			try {
				result = await canonical(onDisk());
			} catch {
				for (const pair of pairs) pair.kept = undefined;
				break;
			}
			const failed = [
				...new Set([...result.keys(), ...expected.keys()]),
			].filter(
				(key) => jsonEquals(result.get(key), expected!.get(key)) === false
			);
			if (failed.length === 0) break;
			const failedKept = toCheck.filter((pair) =>
				failed.includes(fileKey(pair.file))
			);
			if (failedKept.length < failed.length) {
				// another file reads differently, the cause can't be told
				for (const pair of pairs) pair.kept = undefined;
				break;
			}
			for (const pair of failedKept) pair.kept = undefined;
		}
	}

	return pairs.map((pair) =>
		pair.kept === undefined
			? pair.file
			: {
					...pair.file,
					content:
						pair.kept === pair.exportedText
							? pair.file.content
							: new TextEncoder().encode(pair.kept),
					verbatim: true,
				}
	);
}

/**
 * The previous files that hold messages that the project no longer has and
 * that no exported file replaces, e.g. a locale, or a namespace of a locale,
 * whose messages were all deleted: the plugin writes no file for them, so
 * the host would leave them as they are, and the deleted messages would come
 * back on the next load.
 *
 * Only files that the project read (`ExistingFile.imported`) are considered:
 * a message of a file the project never read (e.g. of a locale that was
 * added to the settings after loading, or a file that changed on disk since)
 * was never deleted.
 *
 * Each is returned as an exported file with every key that imports to a
 * message removed, walking into objects that hold messages. Keys that import
 * to nothing, like `$schema` or keys the plugin doesn't read, stay. So a file
 * whose messages were all deleted becomes `{}` (with its `$schema`), and is
 * not deleted: the plugin still lists it, a later message of the locale goes
 * there, and other tools may expect it. Messages of the file that the project
 * still has are written to another file by the export (else the file would
 * be replaced), so removing them from this one doesn't lose them. A file is
 * only returned if it then imports to no message the project doesn't have.
 *
 * The exported file has the `path` of the previous file as its `name` and as
 * `metadata.pathPattern`, so that the host writes it to exactly that file,
 * also if it is one of several files of a `pathPattern` array.
 *
 * Previous files that hold no deleted message are not returned and stay as
 * they are, byte for byte.
 */
async function emptiedFiles<Settings>(args: {
	exported: readonly ExportFile[];
	files: readonly ExistingFile[];
	settings: Settings;
	importFiles: Parameters<
		typeof keepUnchangedJsonEntries<Settings>
	>[0]["importFiles"];
	isSameFile: (exported: ExportFile, existing: ExistingFile) => boolean;
}): Promise<
	Array<{
		existing: ExistingFile;
		file: ExportFile;
		previous: Record<string, unknown>;
	}>
> {
	// Only a file that the project read can have messages that were deleted.
	// Others, e.g. of a locale that was added to the settings after loading,
	// hold messages that never were in the project.
	const orphans = args.files.filter(
		(existing) =>
			existing.imported === true &&
			!args.exported.some((file) => args.isSameFile(file, existing))
	);
	if (orphans.length === 0) return [];
	/** `[bundleId, locale]` of the messages that `files` import to */
	const importKeys = async (
		files: ReadonlyArray<{
			locale: string;
			content: Uint8Array;
			metadata?: Record<string, any>;
		}>
	): Promise<Set<string>> => {
		const imported = await args.importFiles({
			files: files.map(({ locale, content, metadata }) => ({
				locale,
				content,
				toBeImportedFilesMetadata: metadata,
			})),
			settings: structuredClone(args.settings),
		});
		const keys = new Set<string>();
		const messagesById = new Map<string, string>();
		for (const message of imported.messages) {
			const key = JSON.stringify([message.bundleId, message.locale]);
			keys.add(key);
			if (message.id !== undefined) messagesById.set(message.id, key);
		}
		for (const variant of imported.variants) {
			if ("messageBundleId" in variant && variant.messageBundleId) {
				keys.add(
					JSON.stringify([variant.messageBundleId, variant.messageLocale])
				);
			} else if (variant.messageId) {
				// ids that plugins derive from the file (e.g. the json plugin's
				// key path) differ between files, the message they reference
				// doesn't
				const key = messagesById.get(variant.messageId);
				if (key !== undefined) keys.add(key);
			}
		}
		return keys;
	};
	const encode = (value: unknown) =>
		new TextEncoder().encode(JSON.stringify(value, undefined, "\t"));

	const candidates: Array<{
		existing: ExistingFile;
		previous: Record<string, unknown>;
		messages: Set<string>;
	}> = [];
	for (const existing of orphans) {
		try {
			const previous = JSON.parse(
				decodeUtf8(existing.content).replace(/^\uFEFF/, "")
			);
			if (!isObject(previous)) continue;
			const messages = await importKeys([existing]);
			if (messages.size > 0) candidates.push({ existing, previous, messages });
		} catch {
			// a file the plugin can't read stays as it is
		}
	}
	if (candidates.length === 0) return [];

	let current: Set<string>;
	try {
		current = await importKeys(args.exported);
	} catch {
		return [];
	}
	const result = [];
	for (const { existing, previous, messages } of candidates) {
		if ([...messages].every((message) => current.has(message))) continue;
		/**
		 * `value` at `path` without the keys that import to a message. Objects
		 * that hold messages are walked, and dropped if nothing is left.
		 */
		const withoutMessages = async (
			value: Record<string, unknown>,
			path: string[]
		): Promise<Record<string, unknown>> => {
			const kept: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(value)) {
				let wrapped: unknown = child;
				for (const segment of [...path, key].reverse()) {
					wrapped = defineKey({}, segment, wrapped);
				}
				const imported = await importKeys([
					{ ...existing, content: encode(wrapped) },
				]);
				if (imported.size === 0) {
					defineKey(kept, key, child);
				} else if (isObject(child)) {
					const rest = await withoutMessages(child, [...path, key]);
					if (Object.keys(rest).length > 0) defineKey(kept, key, rest);
				}
			}
			return kept;
		};
		let next: Record<string, unknown>;
		try {
			next = await withoutMessages(previous, []);
			// the file must not read as a deleted message anymore
			const left = await importKeys([{ ...existing, content: encode(next) }]);
			if ([...left].some((message) => !current.has(message))) continue;
		} catch {
			continue;
		}
		result.push({
			existing,
			previous,
			file: {
				locale: existing.locale,
				name: existing.path,
				metadata: { ...existing.metadata, pathPattern: existing.path },
				content: encode(next),
			},
		});
	}
	return result;
}

/** Sets `key`, also `__proto__`, as an own property. */
function defineKey(
	object: Record<string, unknown>,
	key: string,
	value: unknown
): Record<string, unknown> {
	Object.defineProperty(object, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
	return object;
}

function fileKey(file: ExportFile): string {
	return JSON.stringify([file.locale, file.name]);
}

function isSameLocaleAndNamespace(
	exported: ExportFile,
	existing: ExistingFile
): boolean {
	return (
		exported.locale === existing.locale &&
		exported.metadata?.["namespace"] === existing.metadata?.["namespace"]
	);
}

/**
 * Writes `next` as JSON and keeps the text of the entries of `previous` that
 * didn't change. See `keepUnchangedJsonEntries`.
 *
 * Returns `undefined` if `previous` is not a JSON object or has duplicate
 * keys.
 *
 * @param args.previous The text of the previous file.
 * @param args.previousCanonical The JSON value the plugin writes for what the
 *   previous file imports to. An entry of `previous` whose value differs from
 *   `next` is kept if its value in `previousCanonical` equals `next`, e.g. a
 *   legacy shape of a message. Keys of `previous` that are neither in `next`
 *   nor here are kept, the plugin doesn't import them.
 * @param args.next The JSON value of the new file, as `JSON.parse` returns it.
 * @param args.splitKey See `keepUnchangedJsonEntries`.
 * @param args.isEntry See `keepUnchangedJsonEntries`.
 * @param args.indent Indentation of new entries if `previous` has none.
 */
export function stringifyJsonKeepingEntries(args: {
	previous: string;
	previousCanonical?: unknown;
	next: unknown;
	splitKey?: (key: string) => string[];
	isEntry?: (path: string[]) => boolean;
	indent?: string;
}): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(args.previous.replace(/^\uFEFF/, ""));
	} catch {
		return undefined;
	}
	if (!isObject(parsed) || !isObject(args.next)) {
		return undefined;
	}
	let tree: ObjectNode;
	let start: number;
	let end: number;
	try {
		const scanner = new Scanner(args.previous);
		start = scanner.skipWhitespace();
		const node = scanner.value();
		end = scanner.pos;
		if (node.kind !== "object") return undefined;
		tree = node;
	} catch {
		// duplicate keys or a JSON feature the scanner doesn't support
		return undefined;
	}
	const writer: Writer = {
		source: args.previous,
		newline: args.previous.includes("\r\n") ? "\r\n" : "\n",
		indent: detectIndent(tree, args.indent ?? "\t"),
		splitKey: args.splitKey ?? splitAtDots,
		isEntry: args.isEntry ?? (() => false),
		colon: "",
	};
	writer.colon = detectColon(tree, writer.indent);
	return (
		args.previous.slice(0, start) +
		writeObject(writer, {
			node: tree,
			previous: parsed,
			canonical: isObject(args.previousCanonical)
				? args.previousCanonical
				: undefined,
			next: args.next,
			depth: 0,
			path: [],
		}).text +
		args.previous.slice(end)
	);
}

type Writer = {
	source: string;
	newline: string;
	/** one level of indentation, "" for files without line breaks */
	indent: string;
	splitKey: (key: string) => string[];
	isEntry: (path: string[]) => boolean;
	/** the separator between keys and values, e.g. Xcode's `" : "` */
	colon: string;
};

/**
 * The separator of the first member that has only whitespace around the
 * colon on one line, or the default of `JSON.stringify`.
 */
function detectColon(tree: ObjectNode, indent: string): string {
	const member = tree.members.find((member) =>
		/^[ \t]*:[ \t]*$/.test(member.colon)
	);
	return member?.colon ?? (indent === "" ? ":" : ": ");
}

/**
 * The indentation of the first member on its own line, or `fallback` for an
 * object without members.
 */
function detectIndent(tree: ObjectNode, fallback: string): string {
	if (tree.members.length === 0) return fallback;
	const member = tree.members.find((member) => member.before.includes("\n"));
	return member === undefined ? "" : lastLine(member.before);
}

type Out = {
	key: string;
	before: string;
	keyText: string;
	colon: string;
	value: string;
	/** whitespace before the comma if it is not the last member */
	after: string;
};

function writeObject(
	writer: Writer,
	args: {
		node: ObjectNode;
		/** the parsed previous value */
		previous: Record<string, unknown>;
		/** the canonical value of the previous object, if it is an object */
		canonical: Record<string, unknown> | undefined;
		next: Record<string, unknown>;
		depth: number;
		/** the keys of the object from the root of the file */
		path: string[];
	}
): { text: string; empty: boolean } {
	const { node, previous, canonical } = args;
	let next = args.next;
	const previousKeys = new Set(node.members.map((member) => member.key));

	// Flat keys of the previous file that stand for a nested path, e.g.
	// `"nav.home"` for `{ "nav": { "home": ... } }`. Their messages are taken out
	// of the nested objects of `next`, so that they are not written twice.
	const flat = new Map<string, string[]>();
	{
		for (const member of node.members) {
			if (hasOwn(next, member.key)) continue;
			// a key that the plugin writes flat itself
			if (canonical !== undefined && hasOwn(canonical, member.key)) continue;
			const path = writer.splitKey(member.key);
			if (path.length < 2 || hasOwn(next, path[0]!) === false) continue;
			const value = getPath(next, path);
			if (value === undefined) continue;
			if (isObject(value) && member.value.kind !== "object") continue;
			flat.set(member.key, path);
		}
		if (flat.size > 0) next = withoutPaths(next, [...flat.values()]);
	}
	const canonicalWithoutFlat =
		canonical !== undefined && flat.size > 0
			? withoutPaths(canonical, [...flat.values()])
			: canonical;

	/** the members of the previous object that are written, by key */
	const kept = new Map<string, Out>();
	const out = { push: (member: Out) => kept.set(member.key, member) };
	for (const [index, member] of node.members.entries()) {
		const isLast = index === node.members.length - 1;
		const base = {
			key: member.key,
			before: member.before,
			keyText: writer.source.slice(member.keyStart, member.keyEnd),
			colon: member.colon,
			after: isLast ? "" : member.after,
		};
		const raw = writer.source.slice(member.value.start, member.value.end);
		const path = flat.get(member.key);
		if (path !== undefined) {
			const nextValue = getPath(args.next, path);
			const canonicalValue =
				canonical === undefined ? undefined : getPath(canonical, path);
			const previousValue = previous[member.key];
			if (
				member.value.kind === "object" &&
				isObject(nextValue) &&
				isObject(previousValue) &&
				writer.isEntry([...args.path, ...path]) === false
			) {
				out.push({
					...base,
					value: writeObject(writer, {
						node: member.value,
						previous: previousValue,
						canonical: isObject(canonicalValue) ? canonicalValue : undefined,
						next: nextValue,
						depth: args.depth + 1,
						path: [...args.path, ...path],
					}).text,
				});
				continue;
			}
			out.push({
				...base,
				value: isUnchanged(previous[member.key], canonicalValue, nextValue)
					? raw
					: stringifyValue(writer, nextValue, lastLine(member.before)),
			});
			continue;
		}
		if (hasOwn(next, member.key) === false) {
			if (
				canonical !== undefined &&
				hasOwn(canonical, member.key) === false &&
				// a flat key that the plugin writes nested is not unknown
				getPath(canonical, writer.splitKey(member.key)) === undefined
			) {
				// The plugin neither imports nor writes the key, e.g. `$schema`
				// for a plugin that ignores it. Kept as it is.
				out.push({ ...base, value: raw });
				continue;
			}
			// Removed. An object keeps the keys in it that the plugin neither
			// imports nor writes.
			const previousValue = previous[member.key];
			const canonicalValue = canonical?.[member.key];
			if (
				member.value.kind === "object" &&
				isObject(previousValue) &&
				isObject(canonicalValue) &&
				writer.isEntry([...args.path, member.key]) === false
			) {
				const rest = writeObject(writer, {
					node: member.value,
					previous: previousValue,
					canonical: canonicalValue,
					next: {},
					depth: args.depth + 1,
					path: [...args.path, member.key],
				});
				if (rest.empty === false) out.push({ ...base, value: rest.text });
			}
			continue;
		}
		const nextValue = next[member.key];
		const previousValue = previous[member.key];
		const canonicalValue =
			canonicalWithoutFlat !== undefined &&
			hasOwn(canonicalWithoutFlat, member.key)
				? canonicalWithoutFlat[member.key]
				: undefined;
		if (
			member.value.kind === "object" &&
			isObject(nextValue) &&
			isObject(previousValue) &&
			writer.isEntry([...args.path, member.key]) === false
		) {
			out.push({
				...base,
				value: writeObject(writer, {
					node: member.value,
					previous: previousValue,
					canonical: isObject(canonicalValue) ? canonicalValue : undefined,
					next: nextValue,
					depth: args.depth + 1,
					path: [...args.path, member.key],
				}).text,
			});
			continue;
		}
		out.push({
			...base,
			value: isUnchanged(previousValue, canonicalValue, nextValue)
				? raw
				: stringifyValue(writer, nextValue, lastLine(member.before)),
		});
	}

	// New keys go after the key that precedes them in `next`.
	const inserted = new Map<string | undefined, Out[]>();
	let anchor: string | undefined;
	let template: Out | undefined;
	for (const key of Object.keys(next)) {
		if (previousKeys.has(key)) {
			anchor = key;
			template = kept.get(key) ?? template;
			continue;
		}
		const value = next[key];
		if (
			canonicalWithoutFlat !== undefined &&
			hasOwn(canonicalWithoutFlat, key) &&
			jsonEquals(canonicalWithoutFlat[key], value)
		) {
			// The previous file doesn't have the key, but the plugin writes it
			// with the same value for the previous file too, e.g. `$schema`.
			// It is not data that changed.
			continue;
		}
		// formatted like the member it follows, or the first one
		const like = template ?? kept.values().next().value;
		const before =
			like?.before ??
			(writer.indent === ""
				? ""
				: writer.newline + writer.indent.repeat(args.depth + 1));
		const member: Out = {
			key,
			before,
			keyText: JSON.stringify(key),
			colon: like?.colon ?? writer.colon,
			value: stringifyValue(writer, value, lastLine(before)),
			after: "",
		};
		const list = inserted.get(anchor) ?? [];
		list.push(member);
		inserted.set(anchor, list);
		// the next new key goes after this one
		anchor = key;
		template = member;
	}
	const members: Out[] = [];
	const emit = (key: string | undefined) => {
		for (const member of inserted.get(key) ?? []) {
			members.push(member);
			emit(member.key);
		}
	};
	emit(undefined);
	for (const written of kept.values()) {
		members.push(written);
		emit(written.key);
	}

	if (members.length === 0) {
		return {
			text:
				node.members.length === 0
					? writer.source.slice(node.start, node.end)
					: "{}",
			empty: true,
		};
	}
	const lastMember = node.members[node.members.length - 1];
	const closing =
		lastMember !== undefined
			? lastMember.after
			: writer.indent === ""
				? ""
				: writer.newline + writer.indent.repeat(args.depth);
	const text =
		"{" +
		members
			.map(
				(member, index) =>
					member.before +
					member.keyText +
					member.colon +
					member.value +
					(index === members.length - 1 ? closing : member.after)
			)
			.join(",") +
		"}";
	return { text, empty: false };
}

function splitAtDots(key: string): string[] {
	return key.split(".");
}

function isUnchanged(
	previousValue: unknown,
	canonicalValue: unknown,
	nextValue: unknown
): boolean {
	return (
		jsonEquals(previousValue, nextValue) ||
		(canonicalValue !== undefined && jsonEquals(canonicalValue, nextValue))
	);
}

function getPath(value: unknown, path: string[]): unknown {
	let cursor = value;
	for (const segment of path) {
		if (!isObject(cursor) || !hasOwn(cursor, segment)) return undefined;
		cursor = cursor[segment];
	}
	return cursor;
}

/**
 * A copy of `value` without the values at `paths`, and without objects that
 * become empty that way.
 */
function withoutPaths(
	value: Record<string, unknown>,
	paths: string[][]
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		const sub = paths
			.filter((path) => path[0] === key)
			.map((path) => path.slice(1));
		const set = (value: unknown) =>
			Object.defineProperty(result, key, {
				value,
				enumerable: true,
				writable: true,
				configurable: true,
			});
		if (sub.length === 0) {
			set(child);
		} else if (isObject(child) && sub.every((path) => path.length > 0)) {
			const rest = withoutPaths(child, sub);
			if (Object.keys(rest).length > 0) set(rest);
		}
		// else: the value itself is at a path
	}
	return result;
}

/**
 * `JSON.stringify` with the indentation of the file, for a value whose first
 * line starts after `lineIndent`.
 */
function stringifyValue(
	writer: Writer,
	value: unknown,
	lineIndent: string
): string {
	return stringify(value, writer, lineIndent);
}

/**
 * `JSON.stringify(value, undefined, writer.indent)` with the separator of
 * the file between keys and values and its line endings.
 */
function stringify(value: unknown, writer: Writer, lineIndent: string): string {
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const inner = lineIndent + writer.indent;
		const items = value.map((item) =>
			// like JSON.stringify: undefined and functions in arrays are null
			item === undefined || typeof item === "function"
				? "null"
				: stringify(item, writer, inner)
		);
		return writer.indent === ""
			? `[${items.join(",")}]`
			: `[${writer.newline}${inner}${items.join(`,${writer.newline}${inner}`)}${writer.newline}${lineIndent}]`;
	}
	if (isObject(value)) {
		const inner = lineIndent + writer.indent;
		const members = Object.entries(value)
			.filter(([, item]) => item !== undefined && typeof item !== "function")
			.map(
				([key, item]) =>
					JSON.stringify(key) + writer.colon + stringify(item, writer, inner)
			);
		if (members.length === 0) return "{}";
		return writer.indent === ""
			? `{${members.join(",")}}`
			: `{${writer.newline}${inner}${members.join(`,${writer.newline}${inner}`)}${writer.newline}${lineIndent}}`;
	}
	return JSON.stringify(value);
}

/** The text after the last line break, i.e. the indentation of a line. */
function lastLine(whitespace: string): string {
	const index = whitespace.lastIndexOf("\n");
	return index === -1 ? "" : whitespace.slice(index + 1);
}

function hasOwn(object: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Equality of JSON values. The order of object keys doesn't matter, except
 * inside arrays (`ordered`): there, objects are values like the variants of a
 * message-format `match`, whose order is meaningful.
 */
export function jsonEquals(a: unknown, b: unknown, ordered = false): boolean {
	if (a === b) return true;
	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, index) => jsonEquals(item, b[index], true))
		);
	}
	if (isObject(a)) {
		if (!isObject(b)) return false;
		const keys = Object.keys(a);
		const otherKeys = Object.keys(b);
		if (keys.length !== otherKeys.length) return false;
		if (ordered && keys.some((key, index) => otherKeys[index] !== key)) {
			return false;
		}
		return keys.every(
			(key) => hasOwn(b, key) && jsonEquals(a[key], b[key], ordered)
		);
	}
	return false;
}

function decodeUtf8(content: Uint8Array): string {
	// keep a byte order mark, it is part of the file
	return new TextDecoder("utf-8", { ignoreBOM: true }).decode(content);
}

/**
 * Bundles, messages and variants with ids, as the SDK stores the result of a
 * plugin's `importFiles` in a new project.
 */
export function rowsFromImport(imported: {
	bundles: NewBundle[];
	messages: MessageImport[];
	variants: VariantImport[];
}): { bundles: Bundle[]; messages: Message[]; variants: Variant[] } {
	const bundles = new Map<string, Bundle>();
	const messages = new Map<string, Message>();
	/** message ids by bundle id and locale */
	const messageIds = new Map<string, string>();
	const variants = new Map<string, Variant>();
	/** variant ids by message id and matches */
	const variantIds = new Map<string, string>();
	const key = (...parts: unknown[]) => JSON.stringify(parts);

	const ensureBundle = (id: string) => {
		if (!bundles.has(id)) bundles.set(id, { id, declarations: [] });
	};
	for (const bundle of imported.bundles) {
		// plugins always provide bundle ids
		if (bundle.id === undefined) continue;
		bundles.set(bundle.id, {
			id: bundle.id,
			// an upsert keeps what isn't provided
			declarations:
				bundle.declarations ?? bundles.get(bundle.id)?.declarations ?? [],
		});
	}
	for (const message of imported.messages) {
		ensureBundle(message.bundleId);
		const byLocale = key(message.bundleId, message.locale);
		const id = message.id ?? messageIds.get(byLocale) ?? byLocale;
		messageIds.set(byLocale, id);
		messages.set(id, {
			id,
			bundleId: message.bundleId,
			locale: message.locale,
			selectors: message.selectors ?? messages.get(id)?.selectors ?? [],
		});
	}
	for (const variant of imported.variants) {
		let messageId = variant.messageId;
		if (messageId === undefined) {
			const bundleId = variant.messageBundleId!;
			const locale = variant.messageLocale!;
			const byLocale = key(bundleId, locale);
			messageId = messageIds.get(byLocale);
			if (messageId === undefined) {
				ensureBundle(bundleId);
				messageId = byLocale;
				messageIds.set(byLocale, messageId);
				messages.set(messageId, {
					id: messageId,
					bundleId,
					locale,
					selectors: [],
				});
			}
		}
		const matches = variant.matches ?? [];
		const byMatches = key(messageId, matches);
		const id = variant.id ?? variantIds.get(byMatches) ?? byMatches;
		variantIds.set(byMatches, id);
		variants.set(id, {
			id,
			messageId,
			matches,
			pattern: variant.pattern ?? variants.get(id)?.pattern ?? [],
		});
	}
	return {
		bundles: [...bundles.values()],
		messages: [...messages.values()],
		variants: [...variants.values()],
	};
}

type ValueNode = ObjectNode | { kind: "other"; start: number; end: number };

type ObjectNode = {
	kind: "object";
	start: number;
	end: number;
	members: MemberNode[];
};

type MemberNode = {
	key: string;
	/** whitespace before the key */
	before: string;
	keyStart: number;
	keyEnd: number;
	/** whitespace, the colon and whitespace between the key and the value */
	colon: string;
	value: ValueNode;
	/** whitespace after the value, before the comma or the closing brace */
	after: string;
};

/**
 * Finds the positions of the members of objects in a valid JSON text.
 */
class Scanner {
	pos = 0;
	constructor(private readonly text: string) {}

	skipWhitespace(): number {
		const text = this.text;
		while (this.pos < text.length) {
			const c = text.charCodeAt(this.pos);
			// space, tab, line feed, carriage return, byte order mark
			if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) {
				this.pos++;
			} else {
				break;
			}
		}
		return this.pos;
	}

	whitespace(): string {
		const start = this.pos;
		this.skipWhitespace();
		return this.text.slice(start, this.pos);
	}

	expect(char: string) {
		if (this.text[this.pos] !== char) {
			throw new Error(`Expected ${char} at ${this.pos}`);
		}
		this.pos++;
	}

	value(): ValueNode {
		const start = this.pos;
		const c = this.text[this.pos];
		if (c === "{") return this.object();
		if (c === "[") {
			this.array();
		} else if (c === '"') {
			this.string();
		} else {
			// number, true, false, null
			while (
				this.pos < this.text.length &&
				/[^\s,\]}]/.test(this.text[this.pos]!)
			) {
				this.pos++;
			}
			if (this.pos === start) throw new Error(`Unexpected ${c} at ${start}`);
		}
		return { kind: "other", start, end: this.pos };
	}

	object(): ObjectNode {
		const start = this.pos;
		this.expect("{");
		const members: MemberNode[] = [];
		const keys = new Set<string>();
		let before = this.whitespace();
		if (this.text[this.pos] === "}") {
			this.pos++;
			return { kind: "object", start, end: this.pos, members };
		}
		for (;;) {
			const keyStart = this.pos;
			this.string();
			const keyEnd = this.pos;
			const key = JSON.parse(this.text.slice(keyStart, keyEnd)) as string;
			if (keys.has(key)) throw new Error(`Duplicate key ${key}`);
			keys.add(key);
			const colonStart = this.pos;
			this.skipWhitespace();
			this.expect(":");
			this.skipWhitespace();
			const colon = this.text.slice(colonStart, this.pos);
			const value = this.value();
			const after = this.whitespace();
			members.push({ key, before, keyStart, keyEnd, colon, value, after });
			if (this.text[this.pos] === ",") {
				this.pos++;
				before = this.whitespace();
				continue;
			}
			this.expect("}");
			return { kind: "object", start, end: this.pos, members };
		}
	}

	array() {
		this.expect("[");
		this.skipWhitespace();
		if (this.text[this.pos] === "]") {
			this.pos++;
			return;
		}
		for (;;) {
			this.skipWhitespace();
			this.value();
			this.skipWhitespace();
			if (this.text[this.pos] === ",") {
				this.pos++;
				continue;
			}
			this.expect("]");
			return;
		}
	}

	string() {
		this.expect('"');
		const text = this.text;
		while (this.pos < text.length) {
			const c = text.charCodeAt(this.pos);
			if (c === 92 /* \ */) {
				this.pos += 2;
			} else if (c === 34 /* " */) {
				this.pos++;
				return;
			} else {
				this.pos++;
			}
		}
		throw new Error("Unterminated string");
	}
}
