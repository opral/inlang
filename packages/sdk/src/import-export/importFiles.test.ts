import { describe, test, expect } from "vitest";
import { importFiles } from "./importFiles.js";
import { loadProjectInMemory } from "../project/loadProjectInMemory.js";
import { newProject } from "../project/newProject.js";
import type { InlangPlugin, VariantImport } from "../plugin/schema.js";
import { selectBundleNested } from "../query-utilities/selectBundleNested.js";

test("batch imports an unambiguous fresh project", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "mock-bundle" }],
			messages: [
				{ bundleId: "mock-bundle", locale: "en" },
				{ bundleId: "mock-bundle", locale: "de" },
			],
			variants: [
				{ messageBundleId: "mock-bundle", messageLocale: "en" },
				{ messageBundleId: "mock-bundle", messageLocale: "de" },
			],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(messages).toHaveLength(2);
	expect(variants).toHaveLength(2);
	expect(new Set(variants.map((variant) => variant.message_id))).toEqual(
		new Set(messages.map((message) => message.id))
	);
});

test("batches rows with mixed optional columns", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "plain-bundle" }, { id: "rich-bundle" }],
			messages: [
				{ bundleId: "plain-bundle", locale: "en" },
				{
					bundleId: "rich-bundle",
					locale: "de",
					selectors: [{ type: "variable-reference", name: "platform" }],
				},
			],
			variants: [
				{ messageBundleId: "plain-bundle", messageLocale: "en" },
				{
					messageBundleId: "rich-bundle",
					messageLocale: "de",
					matches: [
						{
							type: "literal-match",
							key: "platform",
							value: "web",
						},
					],
					pattern: [{ type: "text", value: "Hello web" }],
				},
			],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(messages).toHaveLength(2);
	expect(
		messages.find((message) => message.locale === "en")?.selectors
	).toStrictEqual([]);
	expect(
		messages.find((message) => message.locale === "de")?.selectors
	).toStrictEqual([{ type: "variable-reference", name: "platform" }]);
	expect(variants).toHaveLength(2);
	expect(
		variants.find((variant) => variant.matches.length === 0)?.pattern
	).toStrictEqual([]);
	expect(
		variants.find((variant) => variant.matches.length > 0)?.pattern
	).toStrictEqual([{ type: "text", value: "Hello web" }]);
});

test("preserves variant upsert semantics for duplicate matches", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "mock-bundle" }],
			messages: [{ bundleId: "mock-bundle", locale: "en" }],
			variants: [
				{
					messageBundleId: "mock-bundle",
					messageLocale: "en",
					matches: [],
					pattern: [{ type: "text", value: "first" }],
				},
				{
					messageBundleId: "mock-bundle",
					messageLocale: "en",
					matches: [],
					pattern: [{ type: "text", value: "last" }],
				},
			],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(variants).toHaveLength(1);
	expect(variants[0]?.pattern).toStrictEqual([{ type: "text", value: "last" }]);
});

test("does not alias message references containing NUL characters", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "a" }, { id: "a\u0000b" }],
			messages: [
				{ bundleId: "a", locale: "b\u0000c" },
				{ bundleId: "a\u0000b", locale: "c" },
			],
			variants: [
				{
					messageBundleId: "a",
					messageLocale: "b\u0000c",
					pattern: [{ type: "text", value: "first" }],
				},
				{
					messageBundleId: "a\u0000b",
					messageLocale: "c",
					pattern: [{ type: "text", value: "second" }],
				},
			],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(variants).toHaveLength(2);
	expect(new Set(variants.map((variant) => variant.message_id))).toHaveLength(
		2
	);
	expect(messages).toHaveLength(2);
});

test("it should insert a message as is if the id is provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "mock-bundle" }],
			messages: [{ id: "alfa23", bundleId: "mock-bundle", locale: "en" }],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();

	expect(messages.length).toBe(1);
	expect(messages[0]?.id).toBe("alfa23");
});

test("it should match an existing message if the id is not provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db
		.insertInto("inlang_bundle")
		.values({ id: "mock-bundle" })
		.execute();
	await project.db
		.insertInto("inlang_message")
		.values({
			id: "alfa23",
			bundle_id: "mock-bundle",
			locale: "en",
			selectors: [],
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [
				{
					bundleId: "mock-bundle",
					locale: "en",
					selectors: [{ type: "variable-reference", name: "platform" }],
				},
			],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();

	expect(messages.length).toBe(1);
	expect(messages[0]?.id).toBe("alfa23");
	expect(messages[0]?.selectors).toStrictEqual([
		{ type: "variable-reference", name: "platform" },
	]);
});

test("it should create a bundle for a message if the bundle does not exist to avoid foreign key conflicts and enable partial imports", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [{ bundleId: "non-existent-bundle", locale: "en" }],
			variants: [],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const bundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();

	expect(bundles.length).toBe(1);
	expect(bundles[0]?.id).toBe("non-existent-bundle");
});

test("it should insert a variant as is if the id is provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db
		.insertInto("inlang_bundle")
		.values({ id: "mock-bundle" })
		.execute();
	await project.db
		.insertInto("inlang_message")
		.values({
			id: "mock-message",
			bundle_id: "mock-bundle",
			locale: "en",
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ id: "variant-id-23", messageId: "mock-message" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(variants.length).toBe(1);
	expect(variants[0]?.id).toBe("variant-id-23");
});

test("it should match an existing variant if the id is not provided", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db
		.insertInto("inlang_bundle")
		.values({ id: "mock-bundle" })
		.execute();
	await project.db
		.insertInto("inlang_message")
		.values({
			id: "mock-message",
			bundle_id: "mock-bundle",
			locale: "en",
		})
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ messageBundleId: "mock-bundle", messageLocale: "en" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(variants.length).toBe(1);
	expect(variants[0]?.message_id).toBe("mock-message");
	expect(variants[0]?.id).toBeDefined();
});

test("it should create a message for a variant if the message does not exist to avoid foreign key conflicts and enable partial imports", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });

	await project.db
		.insertInto("inlang_bundle")
		.values({ id: "mock-bundle" })
		.execute();

	const mockPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [],
			messages: [],
			variants: [{ messageBundleId: "mock-bundle", messageLocale: "en" }],
		}),
	};

	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "mock" }],
		pluginKey: "mock",
		plugins: [mockPlugin],
		settings: {} as any,
	});

	const bundles = await project.db
		.selectFrom("inlang_bundle")
		.selectAll()
		.execute();
	const messages = await project.db
		.selectFrom("inlang_message")
		.selectAll()
		.execute();
	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();

	expect(bundles.length).toBe(1);
	expect(messages.length).toBe(1);
	expect(variants.length).toBe(1);

	expect(messages[0]?.bundle_id).toBe("mock-bundle");
	expect(messages[0]?.locale).toBe("en");
	expect(variants[0]?.message_id).toBe(messages[0]?.id);
});

/**
 * Matches the way plugins create them: `{ type, key, value }`. The database
 * returns them with sorted keys (`{ key, type, value }`).
 */
const literal = (key: string, value: string) => ({
	type: "literal-match" as const,
	key,
	value,
});
const catchall = (key: string) => ({ type: "catchall-match" as const, key });
const text = (value: string) => [{ type: "text" as const, value }];

type Shape = {
	selectors: string[];
	variants: Array<{
		matches: NonNullable<VariantImport["matches"]>;
		text: string;
	}>;
};

const shapes: Record<string, Shape> = {
	plain: { selectors: [], variants: [{ matches: [], text: "Hello" }] },
	plural: {
		selectors: ["count"],
		variants: [
			{ matches: [literal("count", "one")], text: "One item" },
			{ matches: [catchall("count")], text: "{count} items" },
		],
	},
	select: {
		selectors: ["gender"],
		variants: [
			{ matches: [literal("gender", "female")], text: "She" },
			{ matches: [literal("gender", "male")], text: "He" },
			{ matches: [catchall("gender")], text: "They" },
		],
	},
	"multi-selector": {
		selectors: ["gender", "count"],
		variants: [
			{
				matches: [literal("gender", "female"), literal("count", "one")],
				text: "She has one",
			},
			{
				matches: [literal("gender", "female"), catchall("count")],
				text: "She has many",
			},
			{
				matches: [catchall("gender"), literal("count", "one")],
				text: "They have one",
			},
			{
				matches: [catchall("gender"), catchall("count")],
				text: "They have many",
			},
		],
	},
	// how the ICU plugin imports `{count, plural, =0 {…} one {…} other {…}}`
	"ICU exact + plural": {
		selectors: ["countExact", "countPlural"],
		variants: [
			{
				matches: [literal("countExact", "0"), catchall("countPlural")],
				text: "No items",
			},
			{
				matches: [catchall("countExact"), literal("countPlural", "one")],
				text: "One item",
			},
			{
				matches: [catchall("countExact"), catchall("countPlural")],
				text: "{count} items",
			},
		],
	},
};

/** A plugin that imports `shape` for `en` and `de`, like a file plugin. */
function pluginFor(shape: Shape, options?: { reverseMatches?: boolean }) {
	return {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "bundle" }],
			messages: ["en", "de"].map((locale) => ({
				bundleId: "bundle",
				locale,
				selectors: shape.selectors.map((name) => ({
					type: "variable-reference" as const,
					name,
				})),
			})),
			variants: ["en", "de"].flatMap((locale) =>
				shape.variants.map((variant) => ({
					messageBundleId: "bundle",
					messageLocale: locale,
					matches: options?.reverseMatches
						? [...variant.matches].reverse()
						: variant.matches,
					pattern: text(`${locale}: ${variant.text}`),
				}))
			),
		}),
	} satisfies InlangPlugin;
}

async function importWith(
	project: Awaited<ReturnType<typeof loadProjectInMemory>>,
	plugin: InlangPlugin
) {
	await importFiles({
		db: project.db,
		files: [{ content: new Uint8Array(), locale: "en" }],
		pluginKey: plugin.key,
		plugins: [plugin],
		settings: {} as any,
	});
}

describe("re-importing the same files", () => {
	test.each(Object.entries(shapes))(
		"%s: creates no duplicate variants",
		async (_, shape) => {
			const project = await loadProjectInMemory({ blob: await newProject() });
			await importWith(project, pluginFor(shape));
			const before = await selectBundleNested(project.db).execute();

			await importWith(project, pluginFor(shape));
			const after = await selectBundleNested(project.db).execute();

			expect(
				await project.db.selectFrom("inlang_variant").selectAll().execute()
			).toHaveLength(shape.variants.length * 2);
			// the same rows, with the same ids
			expect(after).toEqual(before);
		}
	);

	test.each(
		Object.entries(shapes).filter(([, shape]) => shape.selectors.length > 1)
	)(
		"%s: matches the variants whatever the order of their matches",
		async (_, shape) => {
			const project = await loadProjectInMemory({ blob: await newProject() });
			await importWith(project, pluginFor(shape));
			const before = await selectBundleNested(project.db).execute();

			await importWith(project, pluginFor(shape, { reverseMatches: true }));

			const variants = await project.db
				.selectFrom("inlang_variant")
				.selectAll()
				.execute();
			expect(variants).toHaveLength(shape.variants.length * 2);
			expect(
				(await selectBundleNested(project.db).execute())[0]!.messages.map(
					(message) => message.variants.map((variant) => variant.id)
				)
			).toEqual(
				before[0]!.messages.map((message) =>
					message.variants.map((variant) => variant.id)
				)
			);
		}
	);

	test("an edited variant is updated in place", async () => {
		const project = await loadProjectInMemory({ blob: await newProject() });
		await importWith(project, pluginFor(shapes.plural!));
		const edited = structuredClone(shapes.plural!);
		edited.variants[0]!.text = "Exactly one item";

		await importWith(project, pluginFor(edited));

		const variants = await project.db
			.selectFrom("inlang_variant")
			.selectAll()
			.execute();
		expect(variants).toHaveLength(4);
		expect(variants.map((variant) => variant.pattern)).toContainEqual(
			text("en: Exactly one item")
		);
		expect(variants.map((variant) => variant.pattern)).not.toContainEqual(
			text("en: One item")
		);
	});

	test("variants that are imported in another order take that order", async () => {
		const project = await loadProjectInMemory({ blob: await newProject() });
		// e.g. a file that the published message-format plugin wrote with
		// `sort: "asc"`, which put the catch-all first
		const catchallFirst = structuredClone(shapes.select!);
		catchallFirst.variants.reverse();
		await importWith(project, pluginFor(catchallFirst));

		await importWith(project, pluginFor(shapes.select!));

		const [bundle] = await selectBundleNested(project.db).execute();
		for (const message of bundle!.messages) {
			expect(message.variants.map((variant) => variant.pattern)).toEqual(
				shapes.select!.variants.map((variant) =>
					text(`${message.locale}: ${variant.text}`)
				)
			);
		}
		expect(
			await project.db.selectFrom("inlang_variant").selectAll().execute()
		).toHaveLength(6);
	});

	test("a reorder keeps the ids of the variants before the first moved one", async () => {
		const project = await loadProjectInMemory({ blob: await newProject() });
		await importWith(project, pluginFor(shapes["multi-selector"]!));
		const before = (await selectBundleNested(project.db).execute())[0]!;
		const swapped = structuredClone(shapes["multi-selector"]!);
		// swap the 2nd and 3rd variant
		swapped.variants.splice(1, 2, swapped.variants[2]!, swapped.variants[1]!);

		await importWith(project, pluginFor(swapped));

		const after = (await selectBundleNested(project.db).execute())[0]!;
		for (const message of after.messages) {
			const previous = before.messages.find(
				(m) => m.locale === message.locale
			)!;
			expect(message.variants.map((variant) => variant.pattern)).toEqual(
				swapped.variants.map((variant) =>
					text(`${message.locale}: ${variant.text}`)
				)
			);
			expect(message.variants[0]!.id).toBe(previous.variants[0]!.id);
			expect(message.variants).toHaveLength(4);
		}
	});

	test("new variants are inserted at their position in the import", async () => {
		const project = await loadProjectInMemory({ blob: await newProject() });
		await importWith(project, pluginFor(shapes.plural!));
		const withZero = structuredClone(shapes.plural!);
		withZero.variants.unshift({
			matches: [literal("count", "zero")],
			text: "No items",
		});

		await importWith(project, pluginFor(withZero));

		const [bundle] = await selectBundleNested(project.db).execute();
		for (const message of bundle!.messages) {
			expect(message.variants.map((variant) => variant.pattern)).toEqual(
				withZero.variants.map((variant) =>
					text(`${message.locale}: ${variant.text}`)
				)
			);
		}
	});
});

test("a fresh import upserts variants whose matches differ only in order", async () => {
	const project = await loadProjectInMemory({ blob: await newProject() });
	const plugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "bundle" }],
			messages: [{ bundleId: "bundle", locale: "en" }],
			variants: [
				{
					messageBundleId: "bundle",
					messageLocale: "en",
					matches: [literal("gender", "female"), catchall("count")],
					pattern: text("first"),
				},
				{
					messageBundleId: "bundle",
					messageLocale: "en",
					matches: [
						{ key: "count", type: "catchall-match" },
						{ value: "female", key: "gender", type: "literal-match" },
					],
					pattern: text("last"),
				},
			],
		}),
	};

	await importWith(project, plugin);

	const variants = await project.db
		.selectFrom("inlang_variant")
		.selectAll()
		.execute();
	expect(variants).toHaveLength(1);
	expect(variants[0]?.pattern).toEqual(text("last"));
});

describe("variants that exist with ids the import doesn't create", () => {
	/** A plural `en` message with variants of the given ids, in DB order. */
	async function projectWith(variants: Array<{ id: string; value: string }>) {
		const project = await loadProjectInMemory({ blob: await newProject() });
		await project.db
			.insertInto("inlang_bundle")
			.values({ id: "bundle" })
			.execute();
		await project.db
			.insertInto("inlang_message")
			.values({
				id: "message",
				bundle_id: "bundle",
				locale: "en",
				selectors: [{ type: "variable-reference", name: "count" }],
			})
			.execute();
		for (const variant of variants) {
			await project.db
				.insertInto("inlang_variant")
				.values({
					id: variant.id,
					message_id: "message",
					matches:
						variant.value === "*"
							? [catchall("count")]
							: [literal("count", variant.value)],
					pattern: text(variant.value),
				})
				.execute();
		}
		return project;
	}

	const pluralPlugin: InlangPlugin = {
		key: "mock",
		importFiles: async () => ({
			bundles: [{ id: "bundle" }],
			messages: [
				{
					bundleId: "bundle",
					locale: "en",
					selectors: [{ type: "variable-reference", name: "count" }],
				},
			],
			variants: [
				{
					messageBundleId: "bundle",
					messageLocale: "en",
					matches: [literal("count", "one")],
					pattern: text("one"),
				},
				{
					messageBundleId: "bundle",
					messageLocale: "en",
					matches: [catchall("count")],
					pattern: text("*"),
				},
			],
		}),
	};

	const variantRows = async (
		project: Awaited<ReturnType<typeof loadProjectInMemory>>
	) =>
		(
			await selectBundleNested(project.db).execute()
		)[0]!.messages[0]!.variants.map((variant) => ({
			id: variant.id,
			pattern: variant.pattern,
		}));

	test.each([
		// uuid v4, as `insertBundleNested` creates them
		[
			"uuid v4",
			"f0000000-0000-4000-8000-000000000000",
			"a0000000-0000-4000-8000-000000000000",
		],
		// ids an app or a plugin chose
		["custom", "greeting_other", "greeting_one"],
	])(
		"%s ids out of order take the order of the import and keep it",
		async (_, oneId, otherId) => {
			const project = await projectWith([
				{ id: otherId, value: "*" },
				{ id: oneId, value: "one" },
			]);

			await importWith(project, pluralPlugin);
			const first = await variantRows(project);
			expect(first.map((variant) => variant.pattern)).toEqual([
				text("one"),
				text("*"),
			]);

			await importWith(project, pluralPlugin);
			expect(await variantRows(project)).toEqual(first);
		}
	);

	test("custom ids that are in order are kept", async () => {
		const project = await projectWith([
			{ id: "greeting_a_one", value: "one" },
			{ id: "greeting_b_other", value: "*" },
		]);

		await importWith(project, pluralPlugin);

		expect(await variantRows(project)).toEqual([
			{ id: "greeting_a_one", pattern: text("one") },
			{ id: "greeting_b_other", pattern: text("*") },
		]);
	});

	test("duplicates that earlier re-imports created are removed", async () => {
		const project = await projectWith([
			{ id: "01900000-0000-7000-8000-000000000001", value: "one" },
			{ id: "01900000-0000-7000-8000-000000000002", value: "*" },
			{ id: "01900000-0000-7000-8000-000000000003", value: "one" },
			{ id: "01900000-0000-7000-8000-000000000004", value: "*" },
		]);

		await importWith(project, pluralPlugin);

		expect(await variantRows(project)).toEqual([
			{ id: "01900000-0000-7000-8000-000000000001", pattern: text("one") },
			{ id: "01900000-0000-7000-8000-000000000002", pattern: text("*") },
		]);
	});

	test("variants of a message with ids from the plugin keep their ids", async () => {
		const project = await projectWith([
			{ id: "v-other", value: "*" },
			{ id: "v-one", value: "one" },
		]);
		const plugin: InlangPlugin = {
			key: "mock",
			importFiles: async () => ({
				bundles: [],
				messages: [],
				variants: [
					{
						id: "v-other",
						messageId: "message",
						matches: [catchall("count")],
						pattern: text("*"),
					},
					{
						id: "v-one",
						messageId: "message",
						matches: [literal("count", "one")],
						pattern: text("one"),
					},
				],
			}),
		};

		await importWith(project, plugin);

		expect((await variantRows(project)).map((v) => v.id)).toEqual([
			"v-one",
			"v-other",
		]);
	});
});
