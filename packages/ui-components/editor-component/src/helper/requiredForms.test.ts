import { expect, it } from "vitest";
import { requiredForms } from "./requiredForms.js";
import {
	genderPluralDeclarations,
	message,
	pluralDeclarations,
	text,
	variant,
} from "./fixtures.test-util.js";

const values = (forms: ReturnType<typeof requiredForms>) =>
	forms.map((form) =>
		form.map((m) => (m.type === "literal-match" ? m.value : "*")).join(" · ")
	);

it("returns one empty form for messages without selectors", () => {
	expect(requiredForms(message("en", []), [], "en")).toEqual([[]]);
});

it("uses the locale's plural categories in CLDR order", () => {
	const m = message("ru", ["countPlural"]);
	expect(values(requiredForms(m, pluralDeclarations, "ru"))).toEqual([
		"one",
		"few",
		"many",
		"other",
	]);
	expect(values(requiredForms(m, pluralDeclarations, "en"))).toEqual([
		"one",
		"other",
	]);
	expect(requiredForms(m, pluralDeclarations, "en")[0]).toEqual([
		{ type: "literal-match", key: "countPlural", value: "one" },
	]);
});

it("builds the cartesian product with literal keys and a catch-all for other selectors", () => {
	const m = message("ru", ["actorGender", "countPlural"]);
	const variants = [
		variant({ actorGender: "female", countPlural: "one" }, [text("a")]),
		variant({ actorGender: "male", countPlural: "*" }, [text("b")]),
	];
	const forms = requiredForms(m, genderPluralDeclarations, "ru", variants);
	expect(forms).toHaveLength(12);
	expect(values(forms).slice(0, 5)).toEqual([
		"female · one",
		"female · few",
		"female · many",
		"female · other",
		"male · one",
	]);
	expect(values(forms).at(-1)).toBe("* · other");
	expect(forms.at(-1)![0]).toEqual({
		type: "catchall-match",
		key: "actorGender",
	});
});

it("reads variants from a nested message and respects ordinal plurals", () => {
	const declarations = structuredClone(pluralDeclarations);
	const local = declarations[1]!;
	if (local.type === "local-variable")
		local.value.annotation!.options.push({
			name: "type",
			value: { type: "literal", value: "ordinal" },
		});
	expect(
		values(
			requiredForms(
				{ ...message("en", ["countPlural"]), variants: [] },
				declarations,
				"en"
			)
		)
	).toEqual(["one", "two", "few", "other"]);
});

it("falls back to literal keys when plural rules are unknown", () => {
	const m = message("zz", ["countPlural"]);
	const variants = [variant({ countPlural: "one" }, [text("x")])];
	expect(values(requiredForms(m, pluralDeclarations, "zz", variants))).toEqual([
		"one",
		"*",
	]);
});
