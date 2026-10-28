import { v7 } from "uuid";
import {
	findExistingVariant,
	variantIdsToReorder,
	compareVariantIds,
} from "./variantSemantics.js";
import type {
	BundleNested,
	BundleRow,
	MessageRow,
	VariantRow,
} from "../database/schema.js";
import type { InlangPlugin } from "../plugin/schema.js";

type PluginResult = Awaited<
	ReturnType<NonNullable<InlangPlugin["importFiles"]>>
>;
type Rows = {
	bundles: Map<string, BundleRow>;
	messages: Map<string, MessageRow>;
	variants: Map<string, VariantRow>;
};

/** An invalid plugin result at the compiler catalog's storage boundary. */
export class CatalogImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CatalogImportError";
	}
}

function fail(message: string): never {
	throw new CatalogImportError(message);
}
const referenceKey = (bundle: string, locale: string) =>
	JSON.stringify([bundle, locale]);

/**
 * The fresh compiler catalog uses the same sequential property/identity upserts
 * as importFiles, without opening a project database. Each import is atomic.
 * JSON values and selected catalogs are defensively copied as with database IO.
 */
export function createCatalogStore(): {
	import(result: PluginResult): void;
	bundles(): BundleNested[];
} {
	let state: Rows = {
		bundles: new Map(),
		messages: new Map(),
		variants: new Map(),
	};
	return {
		import(result) {
			if (
				!result ||
				!Array.isArray(result.bundles) ||
				!Array.isArray(result.messages) ||
				!Array.isArray(result.variants)
			) {
				fail("importFiles must return bundles, messages, and variants arrays");
			}
			const next: Rows = {
				bundles: new Map(state.bundles),
				messages: new Map(state.messages),
				variants: new Map(state.variants),
			};
			const references = new Map<string, Set<string>>();
			const variantsByMessage = new Map<string, Set<string>>();
			const add = (
				index: Map<string, Set<string>>,
				key: string,
				id: string
			) => {
				let ids = index.get(key);
				if (!ids) index.set(key, (ids = new Set()));
				ids.add(id);
			};
			for (const message of next.messages.values())
				add(
					references,
					referenceKey(message.bundle_id, message.locale),
					message.id
				);
			for (const variant of next.variants.values())
				add(variantsByMessage, variant.message_id, variant.id);
			const ensureBundle = (id: string) => {
				if (!next.bundles.has(id))
					next.bundles.set(id, { id, declarations: [] });
			};
			const firstMessage = (bundle: string, locale: string) => {
				const ids = references.get(referenceKey(bundle, locale));
				if (!ids?.size) return undefined;
				let first: string | undefined;
				for (const id of ids)
					if (first === undefined || compareIdentity(id, first) < 0) first = id;
				return next.messages.get(first!);
			};
			const putMessage = (message: MessageRow) => {
				const previous = next.messages.get(message.id);
				if (previous)
					references
						.get(referenceKey(previous.bundle_id, previous.locale))
						?.delete(previous.id);
				next.messages.set(message.id, message);
				add(
					references,
					referenceKey(message.bundle_id, message.locale),
					message.id
				);
			};
			const deleteVariant = (id: string) => {
				const previous = next.variants.get(id);
				if (previous) variantsByMessage.get(previous.message_id)?.delete(id);
				next.variants.delete(id);
			};
			const putVariant = (variant: VariantRow) => {
				deleteVariant(variant.id);
				next.variants.set(variant.id, variant);
				add(variantsByMessage, variant.message_id, variant.id);
			};
			for (const row of result.bundles) {
				columns(row, ["id", "declarations"], "bundle");
				const id = row.id === undefined ? v7() : text(row.id, "bundle.id");
				const previous = next.bundles.get(id);
				next.bundles.set(id, {
					id,
					declarations:
						row.declarations === undefined
							? (previous?.declarations ?? [])
							: jsonColumn(row.declarations, "bundle.declarations"),
				});
			}
			for (const row of result.messages) {
				columns(row, ["id", "bundleId", "locale", "selectors"], "message");
				const bundle_id = text(row.bundleId, "message.bundleId");
				const locale = text(row.locale, "message.locale");
				const id =
					row.id === undefined
						? (firstMessage(bundle_id, locale)?.id ?? v7())
						: text(row.id, "message.id");
				const previous = next.messages.get(id);
				ensureBundle(bundle_id);
				putMessage({
					id,
					bundle_id,
					locale,
					selectors:
						row.selectors === undefined
							? (previous?.selectors ?? [])
							: jsonColumn(row.selectors, "message.selectors"),
				});
			}
			const importedIds = new Map<string, string[]>();
			const explicitMessages = new Set<string>();
			for (const row of result.variants) {
				columns(
					row,
					[
						"id",
						"messageId",
						"messageBundleId",
						"messageLocale",
						"matches",
						"pattern",
					],
					"variant"
				);
				const incomingMatches =
					row.matches === undefined
						? undefined
						: jsonColumn(row.matches, "variant.matches");
				const incomingPattern =
					row.pattern === undefined
						? undefined
						: jsonColumn(row.pattern, "variant.pattern");
				const explicit = row.id !== undefined;
				let id: string | undefined;
				let message_id: string;
				if (explicit) {
					id = text(row.id, "variant.id");
					message_id = text(row.messageId, "variant.messageId");
					if (!next.messages.has(message_id))
						fail(
							`Variant ${JSON.stringify(id)} references missing message ${JSON.stringify(message_id)}`
						);
				} else {
					const bundle = text(row.messageBundleId, "variant.messageBundleId");
					const locale = text(row.messageLocale, "variant.messageLocale");
					let message = firstMessage(bundle, locale);
					if (!message) {
						ensureBundle(bundle);
						message = { id: v7(), bundle_id: bundle, locale, selectors: [] };
						putMessage(message);
					}
					message_id = message.id;
					const { existing, duplicates } = findExistingVariant(
						[...(variantsByMessage.get(message_id) ?? [])].map(
							(candidate) => next.variants.get(candidate)!
						),
						incomingMatches
					);
					id = existing?.id;
					for (const duplicate of duplicates) deleteVariant(duplicate.id);
				}
				id ??= v7();
				const previous = next.variants.get(id);
				putVariant({
					id,
					message_id,
					matches:
						incomingMatches === undefined
							? (previous?.matches ?? [])
							: incomingMatches,
					pattern:
						incomingPattern === undefined
							? (previous?.pattern ?? [])
							: incomingPattern,
				});
				if (explicit) explicitMessages.add(message_id);
				else {
					const ids = importedIds.get(message_id);
					if (ids) ids.push(id);
					else importedIds.set(message_id, [id]);
				}
			}
			for (const [message, imported] of importedIds) {
				if (explicitMessages.has(message)) continue;
				const moved = variantIdsToReorder(imported, v7)
					.map((id) => next.variants.get(id))
					.filter((row): row is VariantRow => row !== undefined);
				for (const row of moved) deleteVariant(row.id);
				for (const row of moved) putVariant({ ...row, id: v7() });
			}
			state = next;
		},
		bundles() {
			const bundles = new Map<string, BundleNested>();
			const messages = new Map<string, BundleNested["messages"][number]>();
			for (const row of state.bundles.values())
				bundles.set(row.id, { ...row, messages: [] });
			for (const row of state.messages.values()) {
				const message = { ...row, variants: [] as VariantRow[] };
				messages.set(row.id, message);
				bundles.get(row.bundle_id)!.messages.push(message);
			}
			for (const row of state.variants.values())
				messages.get(row.message_id)!.variants.push({ ...row });
			for (const bundle of bundles.values()) {
				bundle.messages.sort((a, b) => compareIdentity(a.id, b.id));
				for (const message of bundle.messages)
					message.variants.sort((a, b) => compareIdentity(a.id, b.id));
			}
			return structuredClone(
				[...bundles.values()].sort((a, b) => compareIdentity(a.id, b.id))
			);
		},
	};
}

function columns(row: object, allowed: string[], table: string): void {
	if (row === null || typeof row !== "object" || Array.isArray(row))
		fail(`${table} must be an object`);
	for (const column of Object.keys(row))
		if (
			!allowed.includes(column) &&
			(row as Record<string, unknown>)[column] !== undefined
		)
			fail(`Unknown ${table} column ${JSON.stringify(column)}`);
}
function text(value: unknown, column: string): string {
	if (typeof value !== "string") fail(`${column} must be a non-null string`);
	wellFormed(value);
	return value;
}
function wellFormed(value: string): void {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = value.charCodeAt(++i);
			if (!(next >= 0xdc00 && next <= 0xdfff))
				fail("Strings must be well-formed UTF-16");
		} else if (code >= 0xdc00 && code <= 0xdfff)
			fail("Strings must be well-formed UTF-16");
	}
}
function jsonColumn<T>(value: T, column: string): T {
	if (value === null || typeof value !== "object")
		fail(`${column} must be non-null JSON`);
	return jsonCopy(value, new WeakSet()) as T;
}
function jsonCopy(value: unknown, seen: WeakSet<object>): unknown {
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") {
		wellFormed(value);
		return value;
	}
	if (typeof value === "number") {
		if (
			!Number.isFinite(value) ||
			(Number.isInteger(value) && !Number.isSafeInteger(value))
		)
			fail("JSON numbers must be finite and integers must be safe");
		return value;
	}
	if (typeof value !== "object") fail(`Invalid JSON value: ${typeof value}`);
	if (
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null
	)
		fail("JSON values must be plain objects or arrays");
	if (seen.has(value)) fail("JSON values cannot contain circular references");
	seen.add(value);
	const copy = Array.isArray(value)
		? Array.from(value, (item) => jsonCopy(item, seen))
		: Object.fromEntries(
				Object.keys(value)
					.sort()
					.map((key) => [
						key,
						jsonCopy((value as Record<string, unknown>)[key], seen),
					])
			);
	seen.delete(value);
	return copy;
}
function identity(id: string): string {
	if (!id.includes("\0") && !id.startsWith("lixid1:")) return id;
	let binary = "";
	for (const byte of new TextEncoder().encode(id))
		binary += String.fromCharCode(byte);
	return `lixid1:${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}
function compareIdentity(a: string, b: string): number {
	return compareVariantIds(identity(a), identity(b));
}
