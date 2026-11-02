import { expect, test } from "vitest";
import { importFiles } from "./importFiles.js";

const settings = {
	baseLocale: "en",
	locales: ["en", "de"],
	"plugin.inlang.i18next": { pathPattern: "./{locale}.json" },
};

const file = (
	resource: Record<string, string>,
	locale = "en",
	namespace?: string
) => ({
	locale,
	content: new TextEncoder().encode(JSON.stringify(resource)),
	...(namespace === undefined
		? {}
		: { toBeImportedFilesMetadata: { namespace } }),
});

test("plural, context, ordinal and exact-zero forms share one message", async () => {
	const imported = await importFiles({
		settings,
		files: [
			file({
				friend: "A friend",
				friend_male: "He",
				friend_female: "She",
				friend_one: "One friend",
				friend_other: "{{count}} friends",
				friend_zero: "No friends",
				friend_ordinal_one: "First friend",
				friend_ordinal_other: "Nth friend",
			}),
		],
	});

	expect(imported.bundles).toHaveLength(1);
	expect(imported.messages).toEqual([
		{
			bundleId: "friend",
			locale: "en",
			selectors: [
				{ type: "variable-reference", name: "context" },
				{ type: "variable-reference", name: "pluralType" },
				{ type: "variable-reference", name: "count" },
				{ type: "variable-reference", name: "countPlural" },
			],
		},
	]);
	// Every resource entry has one editable variant.
	expect(imported.variants).toHaveLength(8);
	expect(
		imported.variants.every(
			(variant) =>
				variant.messageBundleId === "friend" && variant.messageLocale === "en"
		)
	).toBe(true);
	expect(
		imported.variants.flatMap((variant) => variant.pattern ?? [])
	).toContainEqual({
		type: "text",
		value: "First friend",
	});
});

test("messages are unique across files while locales and namespaces remain distinct", async () => {
	const imported = await importFiles({
		settings,
		files: [
			file({ item_one: "One" }, "en", "common"),
			file({ item_other: "Many" }, "en", "common"),
			file({ item_one: "Eins", item_other: "Viele" }, "de", "common"),
			file(
				{ item_one: "Another one", item_other: "Another many" },
				"en",
				"other"
			),
		],
	});

	expect(
		imported.messages.map(({ bundleId, locale }) => [bundleId, locale])
	).toEqual([
		["common:item", "en"],
		["common:item", "de"],
		["other:item", "en"],
	]);
	expect(imported.variants).toHaveLength(6);
	expect(imported.bundles.map(({ id }) => id)).toEqual([
		"common:item",
		"other:item",
	]);
});

test.each([false, true])(
	"colliding bundle ids keep the last message selectors (plain last: %s)",
	async (plainLast) => {
		const plain = file({ "foo:bar": "Plain" });
		const plural = file({ bar_one: "One", bar_other: "Many" }, "en", "foo");
		const imported = await importFiles({
			settings,
			files: plainLast ? [plural, plain] : [plain, plural],
		});

		expect(imported.messages).toEqual([
			{
				bundleId: "foo:bar",
				locale: "en",
				selectors: plainLast
					? []
					: [{ type: "variable-reference", name: "countPlural" }],
			},
		]);
		expect(imported.variants).toHaveLength(3);
	}
);
