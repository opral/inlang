import { describe, expect, test } from "vitest";
import { v7 } from "uuid";
import { openLix, Value } from "@lix-js/sdk";
import { initDb } from "../database/initDb.js";
import { registerInlangSchemas } from "../database/registerSchemas.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";
import { importFiles } from "./importFiles.js";
import { createCatalogStore, createFreshCatalog } from "./catalogRows.js";
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
	const store = createCatalogStore(v7);
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
	const canonical = (bundles: BundleNested[]) => {
		for (const bundle of bundles)
			for (const message of bundle.messages)
				for (const variant of message.variants)
					expect(variant.message_id).toBe(message.id);
		return bundles.map((bundle) => ({
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
	};
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
			const selected = canonical(await selectBundleNested(db).execute());
			expect(canonical(store.bundles())).toEqual(selected);
			if (sequence.length === 1) {
				const fresh = createFreshCatalog(input);
				if (fresh !== undefined) expect(canonical(fresh)).toEqual(selected);
			}
		}
		return store.bundles();
	} finally {
		await db.destroy();
		await lix.close();
	}
}

describe("compiler catalog import semantics", () => {
	test("fresh snapshot identities preserve import order, uniqueness and references across interleaved bundles", () => {
		const input = result({
			bundles: [{ id: "z" }, { id: "a" }],
			messages: Array.from({ length: 30 }, (_, index) => ({
				bundleId: index % 2 ? "a" : "z",
				locale: `locale-${index}`,
			})),
		});
		input.variants = input.messages
			.slice()
			.reverse()
			.map((message) => ({
				messageBundleId: message.bundleId,
				messageLocale: message.locale,
				pattern: text(`message ${message.locale}`),
			}));
		const fresh = createFreshCatalog(input)!;
		expect(fresh.map((bundle) => bundle.id)).toEqual(["a", "z"]);
		const messageIds: string[] = [],
			variantIds: string[] = [];
		for (const bundle of fresh) {
			expect(bundle.messages.map((message) => message.locale)).toEqual(
				input.messages
					.filter((message) => message.bundleId === bundle.id)
					.map((message) => message.locale)
			);
			const ids = bundle.messages.map((message) => message.id);
			expect(ids).toEqual(ids.slice().sort());
			for (const message of bundle.messages) {
				messageIds.push(message.id);
				expect(message.bundle_id).toBe(bundle.id);
				expect(message.variants).toHaveLength(1);
				const variant = message.variants[0]!;
				variantIds.push(variant.id);
				expect(variant.message_id).toBe(message.id);
				expect(variant.pattern).toEqual(text(`message ${message.locale}`));
			}
		}
		expect(new Set(messageIds).size).toBe(input.messages.length);
		expect(new Set(variantIds).size).toBe(input.variants.length);
	});

	test("general imports retain UUIDv7 generation and explicit plugin identities", () => {
		const store = createCatalogStore(v7);
		store.import(
			result({
				bundles: [{ id: "b" }],
				messages: [{ bundleId: "b", locale: "en" }],
				variants: [{ messageBundleId: "b", messageLocale: "en" }],
			})
		);
		const generated = store.bundles()[0]!.messages[0]!;
		const uuid =
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		expect(generated.id).toMatch(uuid);
		expect(generated.variants[0]!.id).toMatch(uuid);
		const explicit = result({
			bundles: [{ id: "explicit" }],
			messages: [
				{
					id: "catalog-message-000000000000",
					bundleId: "explicit",
					locale: "en",
				},
			],
			variants: [
				{
					id: "catalog-variant-000000000000",
					messageId: "catalog-message-000000000000",
				},
			],
		});
		expect(createFreshCatalog(explicit)).toBeUndefined();
		store.import(explicit);
		const message = store
			.takeBundles()
			.find((bundle) => bundle.id === "explicit")!.messages[0]!;
		expect(message.id).toBe("catalog-message-000000000000");
		expect(message.variants[0]!.id).toBe("catalog-variant-000000000000");
		expect(message.variants[0]!.message_id).toBe(message.id);
	});

	test("constructs plain, input and markup catalogs directly with SDK-equivalent defaults and missing locales", async () => {
		const ids = ["z", "a", "with.dot", "\0", "lixid1:literal", "😀", "\uE000"];
		const input = result({
			bundles: ids.map((id) => ({
				id,
				declarations: [{ type: "input-variable", name: "username" }],
			})),
			messages: ids.flatMap((bundleId, index) =>
				(index % 2 ? ["fr", "en"] : ["fr", "en", "de"]).map((locale, i) => ({
					bundleId,
					locale,
					...(i % 2 ? {} : { selectors: [] }),
				}))
			),
		});
		input.variants = input.messages
			.slice()
			.reverse()
			.map((message, index) => ({
				messageBundleId: message.bundleId,
				messageLocale: message.locale,
				...(index % 2 ? {} : { matches: [] }),
				pattern:
					index % 3 === 0
						? text("plain")
						: index % 3 === 1
							? [
									{
										type: "expression",
										arg: { type: "variable-reference", name: "username" },
									},
								]
							: [
									{
										type: "markup-start",
										name: "strong",
										attributes: [
											{
												name: "class",
												value: { type: "literal", value: "highlight" },
											},
										],
									},
									{ type: "text", value: "markup" },
									{ type: "markup-end", name: "strong" },
								],
			}));
		expect(createFreshCatalog(input)).toBeDefined();
		await differential([input]);
	});

	test("leaves unsupported merge, selector, identity and reference inputs untouched for the general importer", () => {
		const base = result({
			bundles: [{ id: "b" }],
			messages: [{ bundleId: "b", locale: "en" }],
			variants: [
				{
					messageBundleId: "b",
					messageLocale: "en",
					pattern: text("original"),
				},
			],
		});
		const variants = [
			result({ ...base, bundles: [{ id: "b" }, { id: "b" }] }),
			result({
				...base,
				messages: [{ id: "m", bundleId: "b", locale: "en" }],
				variants: [{ id: "v", messageId: "m" }],
			}),
			result({
				...base,
				messages: [
					{
						bundleId: "b",
						locale: "en",
						selectors: [{ type: "variable-reference", name: "choice" }],
					},
				],
			}),
			result({
				...base,
				variants: [
					{ messageBundleId: "b", messageLocale: "en", matches: match("a") },
				],
			}),
			result({
				...base,
				variants: [
					...base.variants,
					{ messageBundleId: "b", messageLocale: "en", matches: match("b") },
				],
			}),
			result({
				...base,
				variants: [{ messageBundleId: "implicit", messageLocale: "fr" }],
			}),
		];
		for (const input of variants) {
			const before = structuredClone(input);
			expect(createFreshCatalog(input)).toBeUndefined();
			expect(input).toEqual(before);
			const store = createCatalogStore(v7);
			expect(() => store.import(input)).not.toThrow();
			expect(store.takeBundles()).toBeDefined();
		}
	});

	test("direct fresh construction still validates JSON/columns and detaches every plugin value", () => {
		const input = result({
			bundles: [
				{
					id: "b",
					declarations: [{ type: "input-variable", name: "username" }],
				},
			],
			messages: [{ bundleId: "b", locale: "en" }],
			variants: [
				{
					messageBundleId: "b",
					messageLocale: "en",
					pattern: text("original"),
				},
			],
		});
		const fresh = createFreshCatalog(input)!;
		(input.bundles[0]!.declarations![0] as any).name = "plugin mutation";
		(input.variants[0]!.pattern![0] as any).value = "plugin mutation";
		expect(fresh[0]!.declarations).toEqual([
			{ type: "input-variable", name: "username" },
		]);
		expect(fresh[0]!.messages[0]!.variants[0]!.pattern).toEqual(
			text("original")
		);
		for (const invalid of [
			undefined,
			NaN,
			Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			1n,
			new Date(),
			new Map(),
			new Uint8Array([1]),
			"\uD800",
		]) {
			const invalidInput = structuredClone(input);
			invalidInput.variants[0]!.pattern = [{ invalid }] as any;
			expect(() => createFreshCatalog(invalidInput)).toThrow();
		}
		const extra = structuredClone(input);
		(extra.variants[0] as any).unknownColumn = "invalid";
		expect(() => createFreshCatalog(extra)).toThrow(/Unknown variant column/);
	});

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
		const store = createCatalogStore(v7);
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
		const store = createCatalogStore(v7);
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

	test("transfers validated rows once without exposing store or plugin aliases", () => {
		const store = createCatalogStore(v7);
		const declarations = [
			{ type: "input-variable" as const, name: "original" },
		];
		store.import(result({ bundles: [{ id: "b", declarations }] }));
		const snapshot = store.bundles();
		const transferred = store.takeBundles();
		declarations[0]!.name = "plugin mutation";
		expect(transferred[0]!.declarations).toEqual([
			{ type: "input-variable", name: "original" },
		]);
		(transferred[0]!.declarations[0] as any).name = "consumer mutation";
		expect(snapshot[0]!.declarations).toEqual([
			{ type: "input-variable", name: "original" },
		]);
		expect(() => store.import(result({ bundles: [{ id: "new" }] }))).toThrow(
			/transferred/
		);
		expect(() => store.bundles()).toThrow(/transferred/);
		expect(() => store.takeBundles()).toThrow(/transferred/);
	});

	test("preserves own prototype-named JSON keys without invoking inherited setters", () => {
		const setter = Object.getOwnPropertyDescriptor(
			Object.prototype,
			"catalogTestSetter"
		);
		let calls = 0;
		Object.defineProperty(Object.prototype, "catalogTestSetter", {
			configurable: true,
			set() {
				calls++;
			},
		});
		try {
			const store = createCatalogStore(v7);
			const declaration = JSON.parse(
				'{"__proto__":{"polluted":true},"constructor":"own","catalogTestSetter":"own"}'
			);
			store.import(
				result({ bundles: [{ id: "b", declarations: [declaration] }] })
			);
			const copied = store.takeBundles()[0]!.declarations[0]!;
			expect(calls).toBe(0);
			expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
			expect(Object.hasOwn(copied, "__proto__")).toBe(true);
			expect((copied as any).__proto__).toEqual({ polluted: true });
			expect(({} as any).polluted).toBeUndefined();
			expect((copied as any).catalogTestSetter).toBe("own");
		} finally {
			if (setter)
				Object.defineProperty(Object.prototype, "catalogTestSetter", setter);
			else delete (Object.prototype as any).catalogTestSetter;
		}
	});

	test("copies shared JSON branches independently while rejecting cycles atomically before transfer", () => {
		const store = createCatalogStore(v7);
		const branch = { type: "input-variable", name: "shared" };
		store.import(
			result({
				bundles: [{ id: "prior", declarations: [branch, branch] as any }],
			})
		);
		const cycle: any = { child: {} };
		cycle.child.back = cycle;
		expect(() =>
			store.import(result({ bundles: [{ id: "bad", declarations: [cycle] }] }))
		).toThrow(/circular/);
		const transferred = store.takeBundles();
		expect(transferred.map((bundle) => bundle.id)).toEqual(["prior"]);
		expect(transferred[0]!.declarations[0]).not.toBe(
			transferred[0]!.declarations[1]
		);
		(transferred[0]!.declarations[0] as any).name = "changed";
		expect((transferred[0]!.declarations[1] as any).name).toBe("shared");
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
				createCatalogStore(v7).import(
					result({ bundles: [{ id: "b", declarations: json as any }] })
				)
			).toThrow();
		}
		const sparse = new Array(1);
		expect(() => Value.jsonb(sparse)).toThrow();
		expect(() =>
			createCatalogStore(v7).import(
				result({ bundles: [{ id: "b", declarations: sparse }] })
			)
		).toThrow();
	});

	test("copies exact common node keys in sorted order without dropping additional JSON fields", () => {
		const reads: string[] = [];
		const node = {
			get value() {
				reads.push("value");
				return "hello";
			},
			get type() {
				reads.push("type");
				return "text";
			},
		};
		const reference = Object.assign(Object.create(null), {
			type: "variable-reference",
			name: "input",
		});
		const extra = {
			value: "hello",
			type: "text",
			annotation: { retained: true },
		};
		const store = createCatalogStore(v7);
		store.import(
			result({
				bundles: [{ id: "b", declarations: [node, reference, extra] as any }],
			})
		);
		const copied = store.takeBundles()[0]!.declarations as any[];
		expect(reads).toEqual(["type", "value"]);
		expect(Object.keys(copied[0])).toEqual(["type", "value"]);
		expect(Object.keys(copied[1])).toEqual(["name", "type"]);
		expect(Object.getPrototypeOf(copied[1])).toBe(Object.prototype);
		expect(copied[2]).toEqual(extra);
		extra.annotation.retained = false;
		expect(copied[2].annotation.retained).toBe(true);
	});

	test("retains strict JSON checks for specialized node keys including nested values and cycles", () => {
		const cycle: any = { name: "cycle" };
		cycle.type = cycle;
		for (const node of [
			{ type: "text", value: undefined },
			{ type: NaN, value: "hello" },
			{ name: "\uD800", type: "input-variable" },
			{ type: "text", value: new Date() },
			{ name: "input", type: { invalid: 1n } },
			cycle,
		]) {
			expect(() => Value.jsonb([node] as any)).toThrow();
			expect(() =>
				createCatalogStore(v7).import(
					result({ bundles: [{ id: "b", declarations: [node] as any }] })
				)
			).toThrow();
		}
		const store = createCatalogStore(v7);
		const shared = { type: "text", value: "original" };
		store.import(
			result({
				bundles: [
					{ id: "b", declarations: [{ name: shared, type: shared }] as any },
				],
			})
		);
		const copied = store.takeBundles()[0]!.declarations[0] as any;
		expect(copied.name).toEqual(shared);
		expect(copied.name).not.toBe(copied.type);
		shared.value = "changed";
		expect(copied.name.value).toBe("original");
	});

	test("specialized literal copies do not invoke inherited node-key setters", () => {
		const prior = Object.getOwnPropertyDescriptor(Object.prototype, "name");
		let calls = 0;
		let copied: unknown;
		Object.defineProperty(Object.prototype, "name", {
			configurable: true,
			set() {
				calls++;
			},
		});
		try {
			const store = createCatalogStore(v7);
			store.import(
				result({
					bundles: [
						{
							id: "b",
							declarations: [{ name: "input", type: "input-variable" }],
						},
					],
				})
			);
			copied = store.takeBundles()[0]!.declarations[0];
		} finally {
			if (prior) Object.defineProperty(Object.prototype, "name", prior);
			else delete (Object.prototype as any).name;
		}
		expect(calls).toBe(0);
		expect(copied).toEqual({ name: "input", type: "input-variable" });
	});
});
