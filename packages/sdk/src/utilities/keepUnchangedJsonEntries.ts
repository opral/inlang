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
 *   for what the previous entry imports to (the previous file is imported and
 *   exported with the plugin's own `importFiles` and `exportFiles`), or if the
 *   previous entry already is that value.
 * - Existing keys keep their order. New keys are inserted after the key that
 *   precedes them in the full export (e.g. sorted, if the plugin sorts).
 *   Removed keys and keys that the plugin doesn't write are dropped, as
 *   without a previous file.
 * - The formatting of the file (indentation, line endings, final newline) is
 *   kept. Changed and new entries are indented like their neighbors.
 *
 * The result is only used if it imports to what the full export imports to,
 * i.e. if the plugin writes the same JSON for it as for the full export.
 * Otherwise, and if the previous file is not valid JSON, the full export is
 * returned.
 *
 * @example
 *   exportFiles: async (args) => {
 *     const exported = await exportFullFiles(args);
 *     return keepUnchangedJsonEntries({
 *       exported,
 *       files: args.files,
 *       settings: args.settings,
 *       importFiles,
 *       exportFiles: exportFullFiles,
 *     });
 *   }
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
	/** Indentation of new entries if the previous file has none. Defaults to a tab. */
	indent?: string;
}): Promise<ExportFile[]> {
	if (args.files === undefined || args.files.length === 0) {
		return args.exported;
	}
	const isSameFile = args.isSameFile ?? isSameLocaleAndNamespace;
	const result: ExportFile[] = [];
	for (const file of args.exported) {
		const existing = args.files.find((candidate) =>
			isSameFile(file, candidate)
		);
		if (existing === undefined) {
			result.push(file);
			continue;
		}
		let content: Uint8Array | undefined;
		try {
			content = await keepUnchangedEntriesOfFile({
				exported: file,
				existing,
				settings: args.settings,
				importFiles: args.importFiles,
				exportFiles: args.exportFiles,
				indent: args.indent ?? "\t",
			});
		} catch {
			// e.g. the previous file can't be imported
			content = undefined;
		}
		result.push(content === undefined ? file : { ...file, content });
	}
	return result;
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

async function keepUnchangedEntriesOfFile(args: {
	exported: ExportFile;
	existing: ExistingFile;
	settings: any;
	importFiles: (args: any) => any;
	exportFiles: (args: any) => any;
	indent: string;
}): Promise<Uint8Array | undefined> {
	const previous = decodeUtf8(args.existing.content);
	const exportedText = decodeUtf8(args.exported.content);
	if (previous === exportedText) {
		return args.exported.content;
	}
	const next = JSON.parse(exportedText) as unknown;

	/**
	 * The JSON value the plugin writes for `content`: imports the file on its
	 * own and exports the result.
	 */
	const canonical = async (content: Uint8Array): Promise<unknown> => {
		const imported = await args.importFiles({
			files: [
				{
					locale: args.existing.locale,
					content,
					toBeImportedFilesMetadata: args.existing.metadata,
				},
			],
			settings: structuredClone(args.settings),
		});
		const files: ExportFile[] = await args.exportFiles({
			...rowsFromImport(imported),
			settings: structuredClone(args.settings),
		});
		const file = files.find(
			(candidate) =>
				candidate.locale === args.exported.locale &&
				candidate.name === args.exported.name
		);
		return file === undefined
			? undefined
			: JSON.parse(decodeUtf8(file.content));
	};

	const text = stringifyJsonKeepingEntries({
		previous,
		previousCanonical: await canonical(args.existing.content),
		next,
		indent: args.indent,
	});
	if (text === undefined) {
		return undefined;
	}
	if (text === exportedText) {
		return args.exported.content;
	}
	const content = new TextEncoder().encode(text);
	// Only use the result if the plugin reads it as the full export. This
	// guarantees that no edit is lost, e.g. if the previous file has a shape
	// that this function doesn't understand.
	if (jsonEquals(await canonical(content), next) === false) {
		return undefined;
	}
	return content;
}

/**
 * Writes `next` as JSON and keeps the text of the entries of `previous` that
 * didn't change. See `keepUnchangedJsonEntries`.
 *
 * Returns `undefined` if `previous` is not a JSON object.
 *
 * @param args.previous The text of the previous file.
 * @param args.previousCanonical The JSON value the plugin writes for what the
 *   previous file imports to. An entry of `previous` whose value differs from
 *   `next` is kept if its value in `previousCanonical` equals `next`, e.g. a
 *   legacy shape of a message.
 * @param args.next The JSON value of the new file.
 * @param args.indent Indentation of new entries if `previous` has none.
 */
export function stringifyJsonKeepingEntries(args: {
	previous: string;
	previousCanonical?: unknown;
	next: unknown;
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
	const newline = args.previous.includes("\r\n") ? "\r\n" : "\n";
	const firstMember = tree.members[0];
	const indent =
		firstMember === undefined
			? (args.indent ?? "\t")
			: lastLine(firstMember.before);
	const writer: Writer = {
		source: args.previous,
		newline,
		indent,
	};
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
		}) +
		args.previous.slice(end)
	);
}

type Writer = {
	source: string;
	newline: string;
	/** one level of indentation */
	indent: string;
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
	}
): string {
	const { node, previous, canonical, next } = args;
	type Out = {
		key: string;
		before: string;
		keyText: string;
		colon: string;
		value: string;
		/** whitespace before the comma if it is not the last member */
		after: string;
	};
	const out: Out[] = [];
	const previousKeys = new Set<string>();

	for (const [index, member] of node.members.entries()) {
		previousKeys.add(member.key);
		const isLast = index === node.members.length - 1;
		const base = {
			key: member.key,
			before: member.before,
			keyText: writer.source.slice(member.keyStart, member.keyEnd),
			colon: member.colon,
			after: isLast ? "" : member.after,
		};
		const raw = writer.source.slice(member.value.start, member.value.end);
		if (hasOwn(next, member.key) === false) {
			// removed, or not written by the plugin (as without a previous file)
			continue;
		}
		const nextValue = next[member.key];
		const previousValue = previous[member.key];
		const canonicalValue =
			canonical !== undefined && hasOwn(canonical, member.key)
				? canonical[member.key]
				: undefined;
		if (
			member.value.kind === "object" &&
			isObject(nextValue) &&
			isObject(previousValue)
		) {
			out.push({
				...base,
				value: writeObject(writer, {
					node: member.value,
					previous: previousValue,
					canonical: isObject(canonicalValue) ? canonicalValue : undefined,
					next: nextValue,
					depth: args.depth + 1,
				}),
			});
			continue;
		}
		const unchanged =
			jsonEquals(previousValue, nextValue) ||
			(canonicalValue !== undefined && jsonEquals(canonicalValue, nextValue));
		out.push({
			...base,
			value: unchanged
				? raw
				: stringifyValue(writer, nextValue, lastLine(member.before)),
		});
	}

	// new keys, after the key that precedes them in `next`
	let previousKeyInNext: string | undefined;
	for (const key of Object.keys(next)) {
		if (previousKeys.has(key)) {
			previousKeyInNext = key;
			continue;
		}
		if (
			canonical !== undefined &&
			hasOwn(canonical, key) &&
			jsonEquals(canonical[key], next[key])
		) {
			// The previous file doesn't have the key, but the plugin writes it
			// with the same value for the previous file, e.g. `$schema`. It
			// is not data that changed.
			continue;
		}
		const index =
			previousKeyInNext === undefined
				? 0
				: out.findIndex((member) => member.key === previousKeyInNext) + 1;
		const template = out[index - 1] ?? out[index];
		const memberIndent = writer.indent.repeat(args.depth + 1);
		const before =
			template?.before ??
			(writer.indent === "" ? "" : writer.newline + memberIndent);
		out.splice(index, 0, {
			key,
			before,
			keyText: JSON.stringify(key),
			colon: template?.colon ?? (writer.indent === "" ? ":" : ": "),
			value: stringifyValue(writer, next[key], lastLine(before)),
			after: "",
		});
		previousKeyInNext = key;
	}

	if (out.length === 0) {
		return node.members.length === 0
			? writer.source.slice(node.start, node.end)
			: "{}";
	}
	const lastMember = node.members[node.members.length - 1];
	const closing =
		lastMember !== undefined
			? lastMember.after
			: writer.indent === ""
				? ""
				: writer.newline + writer.indent.repeat(args.depth);
	return (
		"{" +
		out
			.map(
				(member, index) =>
					member.before +
					member.keyText +
					member.colon +
					member.value +
					(index === out.length - 1 ? closing : member.after)
			)
			.join(",") +
		"}"
	);
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
	if (writer.indent === "") {
		return JSON.stringify(value);
	}
	return JSON.stringify(value, undefined, writer.indent).replace(
		/\n/g,
		writer.newline + lineIndent
	);
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
 * Equality of JSON values. The order of object keys doesn't matter, the order
 * of array items does.
 */
export function jsonEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, index) => jsonEquals(item, b[index]))
		);
	}
	if (isObject(a)) {
		if (!isObject(b)) return false;
		const keys = Object.keys(a);
		return (
			keys.length === Object.keys(b).length &&
			keys.every((key) => hasOwn(b, key) && jsonEquals(a[key], b[key]))
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
			declarations: bundle.declarations ?? [],
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
			selectors: message.selectors ?? [],
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
			pattern: variant.pattern ?? [],
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
