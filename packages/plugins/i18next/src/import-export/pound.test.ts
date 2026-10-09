import { expect, test } from "vitest";
import i18next from "i18next";
import type {
	Bundle,
	Declaration,
	Message,
	Pattern,
	Variant,
} from "@inlang/sdk";
import { exportFiles } from "./exportFiles.js";

// `@inlang/plugin-icu1` imports ICU `#` as `{$count :icu:pound}`, with an
// `offset` option when its plural has an offset. When an editor removes the
// plural around `#`, the i18next export sees `#` on its own.

const pound = (offset?: number): Pattern[number] => ({
	type: "expression",
	arg: { type: "variable-reference", name: "count" },
	annotation: {
		type: "function-reference",
		name: "icu:pound",
		options:
			offset === undefined
				? []
				: [
						{
							name: "offset",
							value: { type: "literal", value: String(offset) },
						},
					],
	},
});

const pluralLocal = (name: string, offset?: number): Declaration => ({
	type: "local-variable",
	name,
	value: {
		type: "expression",
		arg: { type: "variable-reference", name: "count" },
		annotation: {
			type: "function-reference",
			name: "plural",
			options:
				offset === undefined
					? []
					: [
							{
								name: "offset",
								value: { type: "literal", value: String(offset) },
							},
						],
		},
	},
});

async function exportPattern(
	pattern: Pattern,
	declarations: Declaration[] = [{ type: "input-variable", name: "count" }]
): Promise<Record<string, string>> {
	const bundle: Bundle = { id: "guests", declarations };
	const message: Message = {
		id: "guests-en",
		bundleId: "guests",
		locale: "en",
		selectors: [],
	};
	const variant: Variant = {
		id: "guests-en-default",
		messageId: "guests-en",
		matches: [],
		pattern,
	};
	const files = await exportFiles({
		bundles: [bundle],
		messages: [message],
		variants: [variant],
		settings: {} as any,
	});
	return JSON.parse(new TextDecoder().decode(files[0]!.content));
}

test("exports # without an offset as the number it displays", async () => {
	const exported = await exportPattern([
		pound(),
		{ type: "text", value: " guests" },
	]);
	expect(exported).toStrictEqual({ guests: "{{count, number}} guests" });

	// i18next displays what ICU `#` displays: count formatted as a number
	const runtime = i18next.createInstance();
	await runtime.init({
		lng: "en",
		resources: { en: { translation: exported } },
	});
	for (const count of [0, 1, 2, 5, 22, 1000]) {
		expect(runtime.t("guests", { count })).toBe(
			`${new Intl.NumberFormat("en").format(count)} guests`
		);
	}
});

test("exports # with offset 0 as the number it displays", async () => {
	expect(
		await exportPattern([pound(0), { type: "text", value: " guests" }])
	).toStrictEqual({ guests: "{{count, number}} guests" });
});

test("refuses # with an offset, naming the bundle, the locale and the reason", async () => {
	await expect(
		exportPattern([
			{ type: "text", value: "You and " },
			pound(1),
			{ type: "text", value: " others" },
		])
	).rejects.toThrow(
		'i18next export cannot represent "#" of bundle "guests" (en): it displays count - 1 (the plural offset), and i18next cannot subtract from a variable.'
	);
});

test("refuses a # imported before the offset was kept on #", async () => {
	// such a # has no offset option, but every plural on its argument has an
	// offset
	await expect(
		exportPattern(
			[
				{ type: "text", value: "You and " },
				pound(),
				{ type: "text", value: " others" },
			],
			[
				{ type: "input-variable", name: "count" },
				pluralLocal("countPluralOffset1", 1),
			]
		)
	).rejects.toThrow("it displays count - 1 (the plural offset)");
});

test("exports # without an offset when a plural on its argument has no offset", async () => {
	expect(
		await exportPattern(
			[pound(), { type: "text", value: " guests" }],
			[
				{ type: "input-variable", name: "count" },
				pluralLocal("countPlural"),
				pluralLocal("countPluralOffset1", 1),
			]
		)
	).toStrictEqual({ guests: "{{count, number}} guests" });
});

test("refuses function options with a descriptive error", async () => {
	await expect(
		exportPattern([
			{
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{ name: "style", value: { type: "literal", value: "percent" } },
					],
				},
			},
		])
	).rejects.toThrow(
		'i18next export cannot represent the options "style=percent" of the function "number" on "count" in bundle "guests" (en)'
	);
});
