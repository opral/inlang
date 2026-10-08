import { expect, it } from "vitest";
import { selectorGroups } from "./selectorGroups.js";
import { requiredForms } from "./requiredForms.js";
import { messageIssues } from "./messageIssues.js";
import { selectVariant } from "./selectVariant.js";
import {
	genderPluralDeclarations,
	icuExactPluralDeclarations,
	message,
	pluralDeclarations,
	text,
	v,
	variant,
} from "./fixtures.test-util.js";

const icu = (locale: string, forms: [string, string, string][]) => ({
	message: message(locale, ["countPluralExact", "countPlural"]),
	variants: forms.map(([exact, plural, value]) =>
		variant({ countPluralExact: exact, countPlural: plural }, [text(value)])
	),
});

const values = (forms: ReturnType<typeof requiredForms>) =>
	forms.map((form) =>
		form.map((m) => (m.type === "literal-match" ? m.value : "*")).join(" · ")
	);

const en = icu("en", [
	["0", "*", "No items"],
	["*", "one", "# item"],
	["*", "*", "# items"],
]);

it("joins an exact number and a plural category of the same input into one group", () => {
	const groups = selectorGroups(
		en.message,
		icuExactPluralDeclarations,
		"en",
		en.variants
	);
	expect(groups).toHaveLength(1);
	expect(groups[0]!.names).toEqual(["countPluralExact", "countPlural"]);
	expect(groups[0]!.input).toBe("count");
	expect(groups[0]!.keys).toEqual(["0", "one", "*"]);
	expect(groups[0]!.values("0")).toEqual({
		countPluralExact: "0",
		countPlural: "*",
	});
	expect(groups[0]!.values("one")).toEqual({
		countPluralExact: "*",
		countPlural: "one",
	});
	expect(groups[0]!.keyOf(en.variants[0]!)).toBe("0");
	expect(groups[0]!.keyOf(en.variants[1]!)).toBe("one");
	expect(groups[0]!.keyOf(en.variants[2]!)).toBe("*");
});

it("never requires an exact number together with a plural category", () => {
	// before: countPluralExact (0, *) x countPlural (one, *) asked for "0 · one"
	expect(
		values(
			requiredForms(en.message, icuExactPluralDeclarations, "en", en.variants)
		)
	).toEqual(["0 · *", "* · one", "* · *"]);
	expect(
		values(requiredForms(en.message, icuExactPluralDeclarations, "ru", []))
	).toEqual(["* · one", "* · few", "* · many", "* · *"]);
});

it("has no missing form for a complete ICU import in en and asks for the other categories in ru", () => {
	expect(
		messageIssues({
			reference: en,
			target: en,
			declarations: icuExactPluralDeclarations,
			locale: "en",
		})
	).toEqual([]);
	const ru = icu("ru", [
		["0", "*", "Нет"],
		["*", "one", "# штука"],
		["*", "*", "# штук"],
	]);
	expect(
		messageIssues({
			reference: en,
			target: ru,
			declarations: icuExactPluralDeclarations,
			locale: "ru",
		}).map((issue) => issue.type)
	).toEqual(["missing-form", "missing-form"]);
});

it("exempts the exact-number form of an ICU import from the missing-variable check", () => {
	const reference = icu("en", [
		["0", "*", "No items"],
		["*", "one", "{count} item"],
		["*", "*", "{count} items"],
	]);
	reference.variants[1]!.pattern = [v("count"), text(" item")];
	reference.variants[2]!.pattern = [v("count"), text(" items")];
	expect(
		messageIssues({
			reference,
			target: reference,
			declarations: icuExactPluralDeclarations,
			locale: "en",
		})
	).toEqual([]);
});

it("keeps unrelated selectors apart and selects the exact number first", () => {
	const m = message("en", ["countPluralExact", "countPlural"]);
	expect(
		selectVariant({
			message: m,
			variants: en.variants,
			declarations: icuExactPluralDeclarations,
			values: { count: 0 },
			locale: "en",
		})
	).toBe(en.variants[0]);
	expect(
		selectVariant({
			message: m,
			variants: en.variants,
			declarations: icuExactPluralDeclarations,
			values: { count: 1 },
			locale: "en",
		})
	).toBe(en.variants[1]);
	// a select on another variable is a group of its own
	const mixed = message("en", ["actorGender", "countPlural"]);
	expect(
		selectorGroups(mixed, genderPluralDeclarations, "en", []).map(
			(group) => group.names
		)
	).toEqual([["actorGender"], ["countPlural"]]);
});

it("does not join a select with non-numeric keys on the plural's input", () => {
	const declarations = [...pluralDeclarations];
	const m = message("en", ["count", "countPlural"]);
	const variants = [
		variant({ count: "many", countPlural: "*" }, [text("a")]),
		variant({ count: "*", countPlural: "*" }, [text("b")]),
	];
	expect(
		selectorGroups(m, declarations, "en", variants).map((group) => group.names)
	).toEqual([["count"], ["countPlural"]]);
});

it("joins the pair when the exact-number selector comes after the plural and for plain `count`", () => {
	const m = message("en", ["countPlural", "count"]);
	const variants = [
		variant({ count: "0", countPlural: "*" }, [text("a")]),
		variant({ count: "*", countPlural: "one" }, [text("b")]),
		variant({ count: "*", countPlural: "*" }, [text("c")]),
	];
	const groups = selectorGroups(m, pluralDeclarations, "en", variants);
	expect(groups).toHaveLength(1);
	expect(groups[0]!.names).toEqual(["countPlural", "count"]);
	expect(groups[0]!.keys).toEqual(["0", "one", "*"]);
	expect(values(requiredForms(m, pluralDeclarations, "en", variants))).toEqual([
		"* · 0",
		"one · *",
		"* · *",
	]);
});

it("asks a translation for the literal keys of the reference's selects", () => {
	const m = message("de", ["actorGender"]);
	const reference = [
		variant({ actorGender: "female" }, [text("Sie")]),
		variant({ actorGender: "male" }, [text("Er")]),
		variant({ actorGender: "*" }, [text("Sie")]),
	];
	expect(values(requiredForms(m, genderPluralDeclarations, "de", []))).toEqual([
		"*",
	]);
	expect(
		values(requiredForms(m, genderPluralDeclarations, "de", [], reference))
	).toEqual(["female", "male", "*"]);
	expect(
		selectorGroups(m, genderPluralDeclarations, "de", [], reference)[0]!.keys
	).toEqual(["female", "male", "*"]);
	// plural categories come from the locale, not from the reference
	const plural = message("de", ["countPlural"]);
	expect(
		values(
			requiredForms(
				plural,
				pluralDeclarations,
				"de",
				[],
				[variant({ countPlural: "few" }, [text("x")])]
			)
		)
	).toEqual(["one", "*"]);
});
