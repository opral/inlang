import { expect, it } from "vitest";
import { selectVariant } from "./selectVariant.js";
import {
	genderPluralDeclarations,
	icuExactPluralDeclarations,
	message,
	pluralDeclarations,
	text,
	variant,
} from "./fixtures.test-util.js";

const ru = [
	variant({ countPlural: "one" }, [text("one")]),
	variant({ countPlural: "few" }, [text("few")]),
	variant({ countPlural: "many" }, [text("many")]),
	variant({ countPlural: "*" }, [text("other")]),
];
const pick = (values: Record<string, unknown>, variants = ru, locale = "ru") =>
	(
		selectVariant({
			message: message(locale, ["countPlural"]),
			variants,
			declarations: genderPluralDeclarations,
			values,
			locale,
		})?.pattern[0] as { value: string } | undefined
	)?.value;

it("selects by Intl plural category through a local variable", () => {
	expect(pick({ count: 1 })).toBe("one");
	expect(pick({ count: 3 })).toBe("few");
	expect(pick({ count: 11 })).toBe("many");
	expect(pick({ count: "21" })).toBe("one");
	expect(pick({ count: 1.5 })).toBe("other");
});

it("prefers exact numeric literal matches over categories", () => {
	const variants = [...ru, variant({ countPlural: "0" }, [text("none")])];
	expect(pick({ count: 0 }, variants)).toBe("none");
	expect(pick({ count: 5 }, variants)).toBe("many");
});

it("falls back to catch-all and returns undefined when nothing matches", () => {
	expect(pick({ count: 2 }, [ru[0]!, ru[3]!])).toBe("other");
	expect(pick({ count: 2 }, [ru[0]!])).toBeUndefined();
	expect(pick({}, [ru[0]!])).toBeUndefined();
});

it("ranks selectors in order: exact matches on the first selector win", () => {
	const variants = [
		variant({ actorGender: "*", countPlural: "few" }, [text("any few")]),
		variant({ actorGender: "female", countPlural: "*" }, [text("female any")]),
		variant({ actorGender: "female", countPlural: "few" }, [
			text("female few"),
		]),
		variant({ actorGender: "*", countPlural: "*" }, [text("fallback")]),
	];
	const choose = (values: Record<string, unknown>, list = variants) =>
		(
			selectVariant({
				message: message("ru", ["actorGender", "countPlural"]),
				variants: list,
				declarations: genderPluralDeclarations,
				values,
				locale: "ru",
			})?.pattern[0] as { value: string }
		).value;
	expect(choose({ actorGender: "female", count: 3 })).toBe("female few");
	expect(
		choose(
			{ actorGender: "female", count: 3 },
			variants.filter((_, i) => i !== 2)
		)
	).toBe("female any");
	expect(choose({ actorGender: "male", count: 3 })).toBe("any few");
	expect(choose({ actorGender: "male", count: 5 })).toBe("fallback");
});

it("compares non-plural selectors as strings and treats missing matches as catch-all", () => {
	const variants = [
		variant({ isAdmin: "true" }, [text("admin")]),
		variant({}, [text("default")]),
	];
	const choose = (value: unknown) =>
		(
			selectVariant({
				message: message("en", ["isAdmin"]),
				variants,
				declarations: [{ type: "input-variable", name: "isAdmin" }],
				values: { isAdmin: value },
				locale: "en",
			})?.pattern[0] as { value: string }
		).value;
	expect(choose(true)).toBe("admin");
	expect(choose(false)).toBe("default");
});

it("uses English rules for en and handles messages without selectors", () => {
	expect(
		pick(
			{ count: 1 },
			[
				variant({ countPlural: "one" }, [text("one")]),
				variant({ countPlural: "other" }, [text("other")]),
			],
			"en"
		)
	).toBe("one");
	const only = variant({}, [text("hi")]);
	expect(
		selectVariant({
			message: message("en", []),
			variants: [only],
			declarations: pluralDeclarations,
			locale: "en",
		})
	).toBe(only);
});

it("selects the exact number of an imported ICU =0 before the plural category", () => {
	const m = message("en", ["countPluralExact", "countPlural"]);
	const variants = [
		variant({ countPluralExact: "0", countPlural: "*" }, [text("none")]),
		variant({ countPluralExact: "*", countPlural: "one" }, [text("one")]),
		variant({ countPluralExact: "*", countPlural: "*" }, [text("other")]),
	];
	const pickIcu = (count: number) =>
		selectVariant({
			message: m,
			variants,
			declarations: icuExactPluralDeclarations,
			values: { count },
			locale: "en",
		});
	expect(pickIcu(0)).toBe(variants[0]);
	expect(pickIcu(1)).toBe(variants[1]);
	expect(pickIcu(5)).toBe(variants[2]);
});

it("chooses the plural category for the number minus an ICU offset; exact numbers compare the number itself", () => {
	// {count, plural, offset:1 =0 {…} =1 {…} one {you and one other} other {…}}
	const declarations = [
		{ type: "input-variable", name: "count" },
		{
			type: "local-variable",
			name: "countPlural",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "count" },
				annotation: {
					type: "function-reference",
					name: "plural",
					options: [{ name: "offset", value: { type: "literal", value: "1" } }],
				},
			},
		},
	] as const;
	const variants = [
		variant({ countPlural: "0" }, [text("nobody")]),
		variant({ countPlural: "1" }, [text("you")]),
		variant({ countPlural: "one" }, [text("you and one other")]),
		variant({ countPlural: "*" }, [text("you and # others")]),
	];
	const pickOffset = (count: number) =>
		(
			selectVariant({
				message: message("en", ["countPlural"]),
				variants,
				declarations: declarations as never,
				values: { count },
				locale: "en",
			})?.pattern[0] as { value: string }
		).value;
	expect(pickOffset(0)).toBe("nobody");
	expect(pickOffset(1)).toBe("you");
	expect(pickOffset(2)).toBe("you and one other");
	expect(pickOffset(3)).toBe("you and # others");
});
