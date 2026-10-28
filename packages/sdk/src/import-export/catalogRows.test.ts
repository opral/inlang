import { describe, expect, test } from "vitest";
import { openLix, Value } from "@lix-js/sdk";
import { initDb } from "../database/initDb.js";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { importFiles } from "./importFiles.js";
import { createCatalogStore } from "./catalogRows.js";
import type { BundleNested } from "../database/schema.js";
import type { InlangPlugin } from "../plugin/schema.js";

type Result = Parameters<ReturnType<typeof createCatalogStore>["import"]>[0];
const text = (value: string) => [{ type: "text" as const, value }];
const match = (value: string) => [
	{ type: "literal-match" as const, key: "choice", value },
];
const result = (value: Partial<Result>): Result => ({
	bundles: [],
	messages: [],
	variants: [],
	...value,
});

async function differential(sequence: Result[]) {
	const store = createCatalogStore();
	const lix = await openLix();
	await registerInlangSchemas(lix);
	const db = initDb({ lix });
	const explicitMessages = new Set(
		sequence.flatMap((r) =>
			r.messages.flatMap((m) => (m.id === undefined ? [] : [m.id]))
		)
	);
	const explicitVariants = new Set(
		sequence.flatMap((r) =>
			r.variants.flatMap((v) => (v.id === undefined ? [] : [v.id]))
		)
	);
	const canonical = (bundles: BundleNested[]) =>
		bundles.map((bundle) => ({
			...bundle,
			messages: bundle.messages.map((message) => ({
				...message,
				id: explicitMessages.has(message.id)
					? message.id
					: "<generated-message>",
				variants: message.variants.map((variant) => ({
					...variant,
					id: explicitVariants.has(variant.id)
						? variant.id
						: "<generated-variant>",
					message_id: explicitMessages.has(message.id)
						? message.id
						: "<generated-message>",
				})),
			})),
		}));
	try {
		for (const input of sequence) {
			const plugin: InlangPlugin = {
				key: "differential",
				importFiles: () => structuredClone(input),
			};
			store.import(input);
			await importFiles({
				db,
				files: [],
				pluginKey: plugin.key,
				plugins: [plugin],
				settings: {} as any,
			});
			expect(canonical(store.bundles())).toEqual(
				canonical(await selectBundleNested(db).execute())
			);
		}
		return store.bundles();
	} finally {
		await db.destroy();
		await lix.close();
	}
}

describe("compiler catalog import semantics", () => {
	test("matches sequential property upserts, duplicate messages/matches, omitted columns and variant priority", async () => {
		await differential([
			result({
				bundles: [
					{
						id: "hello",
						declarations: [{ type: "input-variable", name: "choice" }],
					},
				],
				messages: [
					{ bundleId: "hello", locale: "en" },
					{
						bundleId: "hello",
						locale: "en",
						selectors: [{ type: "variable-reference", name: "choice" }],
					},
				],
				variants: [
					{
						messageBundleId: "hello",
						messageLocale: "en",
						matches: match("a"),
						pattern: text("first"),
					},
					{
						messageBundleId: "hello",
						messageLocale: "en",
						matches: match("b"),
						pattern: text("second"),
					},
					{
						messageBundleId: "hello",
						messageLocale: "en",
						matches: match("a"),
						pattern: text("last wins"),
					},
				],
			}),
			result({
				bundles: [{ id: "hello" }],
				messages: [{ bundleId: "hello", locale: "en" }],
				variants: [
					{
						messageBundleId: "hello",
						messageLocale: "en",
						matches: match("b"),
					},
					{
						messageBundleId: "hello",
						messageLocale: "en",
						matches: match("a"),
					},
				],
			}),
		]);
	});

	test("matches explicit identities, ambiguous property references and moving messages between bundles", async () => {
		await differential([
			result({
				bundles: [{ id: "one" }, { id: "two" }],
				messages: [
					{ id: "z", bundleId: "one", locale: "en" },
					{ id: "a", bundleId: "one", locale: "en" },
				],
				variants: [
					{ id: "z-variant", messageId: "z", pattern: text("z") },
					{ id: "a-variant", messageId: "a", pattern: text("a") },
				],
			}),
			result({
				variants: [
					{
						messageBundleId: "one",
						messageLocale: "en",
						pattern: text("property update"),
					},
				],
			}),
			result({ messages: [{ id: "a", bundleId: "two", locale: "de" }] }),
			result({
				variants: [
					{
						messageBundleId: "one",
						messageLocale: "en",
						pattern: text("remaining"),
					},
				],
			}),
		]);
	});

	test("deduplicates existing matches and shares explicit/mixed-ID variant ordering with database imports", async () => {
		await differential([
			result({
				bundles: [{ id: "b" }],
				messages: [{ id: "m", bundleId: "b", locale: "en" }],
				variants: [
					{
						id: "a",
						messageId: "m",
						matches: match("a"),
						pattern: text("old a"),
					},
					{
						id: "duplicate",
						messageId: "m",
						matches: match("a"),
						pattern: text("duplicate"),
					},
					{ id: "z", messageId: "m", matches: match("z"), pattern: text("z") },
				],
			}),
			result({
				variants: [
					{
						messageBundleId: "b",
						messageLocale: "en",
						matches: match("z"),
						pattern: text("new z"),
					},
					{
						messageBundleId: "b",
						messageLocale: "en",
						matches: match("a"),
						pattern: text("new a"),
					},
				],
			}),
			result({
				variants: [
					{
						id: "0-explicit",
						messageId: "m",
						matches: match("explicit"),
						pattern: text("explicit"),
					},
					{
						messageBundleId: "b",
						messageLocale: "en",
						matches: match("generated"),
						pattern: text("generated"),
					},
				],
			}),
		]);
	});

	test("preserves encoded native ordering of unusual identities and public binary variant matching", async () => {
		await differential([
			result({
				bundles: ["\0", "lixid1:literal", "\uE000", "😀"].map((id) => ({ id })),
				messages: [
					{ id: "\0", bundleId: "\0", locale: "en" },
					{ id: "😀", bundleId: "\0", locale: "en" },
				],
				variants: [
					{
						id: "\0",
						messageId: "\0",
						matches: match("a"),
						pattern: text("null"),
					},
					{
						id: "😀",
						messageId: "\0",
						matches: match("b"),
						pattern: text("emoji"),
					},
				],
			}),
		]);
	});

	test("creates missing parent rows for property references and materializes schema defaults", async () => {
		await differential([
			result({
				variants: [{ messageBundleId: "implicit", messageLocale: "fr" }],
			}),
		]);
	});

	test("rejects dangling explicit foreign keys atomically, retaining previous imports", async () => {
		const store = createCatalogStore();
		store.import(result({ bundles: [{ id: "prior" }] }));
		const before = store.bundles();
		expect(() =>
			store.import(
				result({
					bundles: [{ id: "rolled-back" }],
					variants: [{ id: "v", messageId: "missing" }],
				})
			)
		).toThrow(/missing message/);
		expect(store.bundles()).toEqual(before);
	});

	test("copies plugin JSON on import and returns independent query snapshots", () => {
		const store = createCatalogStore();
		const input = result({
			bundles: [
				{
					id: "b",
					declarations: [{ type: "input-variable", name: "original" }],
				},
			],
		});
		store.import(input);
		(input.bundles[0]!.declarations![0] as any).name = "changed";
		const first = store.bundles();
		(first[0]!.declarations[0] as any).name = "also changed";
		expect(store.bundles()[0]!.declarations).toEqual([
			{ type: "input-variable", name: "original" },
		]);
	});

	test("enforces the same JSON parameter constraints as Value.jsonb without accepting non-JSON plugin values", () => {
		const circular: any = {};
		circular.self = circular;
		for (const invalid of [
			undefined,
			NaN,
			Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			1n,
			new Date(),
			new Uint8Array([1]),
			new Map(),
			circular,
			"\uD800",
		]) {
			const json = [{ invalid }];
			expect(() => Value.jsonb(json as any)).toThrow();
			expect(() =>
				createCatalogStore().import(
					result({ bundles: [{ id: "b", declarations: json as any }] })
				)
			).toThrow();
		}
		const sparse = new Array(1);
		expect(() => Value.jsonb(sparse)).toThrow();
		expect(() =>
			createCatalogStore().import(
				result({ bundles: [{ id: "b", declarations: sparse }] })
			)
		).toThrow();
	});
});
