import { expect, it } from "vitest";
import type { Declaration } from "@inlang/sdk";
import { formatMessage, formatPattern, toDate } from "./formatPattern.js";
import {
	message,
	pluralDeclarations,
	text,
	v,
	variant,
} from "./fixtures.test-util.js";

it("resolves input and local variables and merges text", () => {
	expect(
		formatPattern({
			pattern: [v("countPlural"), text(" files for "), v("name")],
			declarations: [
				...pluralDeclarations,
				{ type: "input-variable", name: "name" },
			],
			values: { count: 1234, name: "Anna" },
			locale: "en",
		})
	).toEqual([{ type: "text", value: "1,234 files for Anna" }]);
});

it("renders missing values as {name} and keeps markup", () => {
	expect(
		formatPattern({
			pattern: [
				{ type: "markup-start", name: "b" },
				v("name"),
				{ type: "markup-end", name: "b" },
				text("!"),
				{ type: "markup-standalone", name: "br" },
			],
			locale: "en",
		})
	).toEqual([
		{ type: "markup-start", name: "b" },
		{ type: "text", value: "{name}" },
		{ type: "markup-end", name: "b" },
		{ type: "text", value: "!" },
		{ type: "markup-standalone", name: "br" },
	]);
});

it("formats numbers with options from annotations and locales", () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "price" },
		{
			type: "local-variable",
			name: "priceFormatted",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "price" },
				annotation: {
					type: "function-reference",
					name: "number",
					options: [
						{ name: "style", value: { type: "literal", value: "currency" } },
						{ name: "currency", value: { type: "literal", value: "EUR" } },
						{
							name: "minimumFractionDigits",
							value: { type: "literal", value: "2" },
						},
					],
				},
			},
		},
	];
	const format = (locale: string) =>
		formatPattern({
			pattern: [v("priceFormatted")],
			declarations,
			values: { price: 5 },
			locale,
		})[0];
	expect(format("en")).toEqual({ type: "text", value: "€5.00" });
	expect((format("de") as { value: string }).value.replace(/\s/g, " ")).toBe(
		"5,00 €"
	);
	expect(
		formatPattern({
			pattern: [
				{
					type: "expression",
					arg: { type: "variable-reference", name: "n" },
					annotation: {
						type: "function-reference",
						name: "integer",
						options: [],
					},
				},
			],
			values: { n: 2.7 },
			locale: "en",
		})
	).toEqual([{ type: "text", value: "3" }]);
});

it("formats dates from Date, ISO strings and timestamps", () => {
	const declarations: Declaration[] = [
		{ type: "input-variable", name: "sentDate" },
		{
			type: "local-variable",
			name: "sentDateFormatted",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "sentDate" },
				annotation: {
					type: "function-reference",
					name: "datetime",
					options: [
						{ name: "dateStyle", value: { type: "literal", value: "long" } },
					],
				},
			},
		},
	];
	const format = (value: unknown, locale = "en") =>
		(
			formatPattern({
				pattern: [v("sentDateFormatted")],
				declarations,
				values: { sentDate: value },
				locale,
			})[0] as { value: string }
		).value;
	expect(format(new Date(2026, 9, 8))).toBe("October 8, 2026");
	expect(format("2026-10-08")).toBe("October 8, 2026");
	expect(format(new Date(2026, 9, 8).getTime())).toBe("October 8, 2026");
	expect(format("not a date")).toBe("not a date");
	// default datetime style is a medium date
	expect(
		(
			formatPattern({
				pattern: [
					{
						type: "expression",
						arg: { type: "variable-reference", name: "d" },
						annotation: {
							type: "function-reference",
							name: "datetime",
							options: [],
						},
					},
				],
				values: { d: "2026-10-08" },
				locale: "ru",
			})[0] as { value: string }
		).value
	).toBe("8 окт. 2026 г.");
	expect(toDate("2026-10-08")?.getDate()).toBe(8);
	expect(toDate("")).toBeUndefined();
});

it("formatMessage selects a variant and drops markup", () => {
	const variants = [
		variant({ countPlural: "one" }, [
			{ type: "markup-start", name: "b" },
			v("count"),
			{ type: "markup-end", name: "b" },
			text(" file"),
		]),
		variant({ countPlural: "*" }, [v("count"), text(" files")]),
	];
	const args = {
		message: message("en", ["countPlural"]),
		variants,
		declarations: pluralDeclarations,
		locale: "en",
	};
	expect(formatMessage({ ...args, values: { count: 1 } })).toBe("1 file");
	expect(formatMessage({ ...args, values: { count: 2 } })).toBe("2 files");
	expect(
		formatMessage({ ...args, variants: [variants[0]!], values: { count: 2 } })
	).toBe("");
});

it("formats an ICU # (icu:pound) as the number minus its offset, with locale number formatting", () => {
	const pound = (offset?: string) => ({
		type: "expression" as const,
		arg: { type: "variable-reference" as const, name: "count" },
		annotation: {
			type: "function-reference" as const,
			name: "icu:pound",
			options: offset ? [{ name: "offset", value: { type: "literal" as const, value: offset } }] : [],
		},
	});
	const text = (value: string) => ({ type: "text" as const, value });
	expect(
		formatPattern({ pattern: [text("You and "), pound("1"), text(" others")], values: { count: 5 }, locale: "en" })
	).toEqual([{ type: "text", value: "You and 4 others" }]);
	expect(formatPattern({ pattern: [pound()], values: { count: "1234" }, locale: "de" })).toEqual([
		{ type: "text", value: "1.234" },
	]);
	expect(formatPattern({ pattern: [pound("1")], values: { count: 1235 }, locale: "en" })).toEqual([
		{ type: "text", value: "1,234" },
	]);
});
