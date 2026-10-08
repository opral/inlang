import { expect, it } from "vitest";
import { messageIssues } from "./messageIssues.js";
import {
	genderPluralDeclarations,
	message,
	pluralDeclarations,
	text,
	v,
	variant,
} from "./fixtures.test-util.js";

const en = {
	message: message("en", ["countPlural"]),
	variants: [
		variant({ countPlural: "one" }, [v("count"), text(" file left")]),
		variant({ countPlural: "*" }, [v("count"), text(" files left")]),
	],
};

it("reports a missing translation and nothing else", () => {
	expect(
		messageIssues({ reference: en, target: undefined, locale: "ru" })
	).toEqual([{ type: "missing-translation" }]);
	expect(
		messageIssues({
			reference: en,
			target: {
				message: message("ru", ["countPlural"]),
				variants: [variant({ countPlural: "one" }, [text("  ")])],
			},
			declarations: pluralDeclarations,
			locale: "ru",
		})
	).toEqual([{ type: "missing-translation" }]);
});

it("is clean for a complete Russian plural translation", () => {
	const ru = {
		message: message("ru", ["countPlural"]),
		variants: ["one", "few", "many", "other"].map((c) =>
			variant({ countPlural: c }, [text("Осталось "), v("count")])
		),
	};
	expect(
		messageIssues({
			reference: en,
			target: ru,
			declarations: pluralDeclarations,
			locale: "ru",
		})
	).toEqual([]);
});

it("does not count catch-all as covering a plural category the locale has", () => {
	const ru = {
		message: message("ru", ["countPlural"]),
		variants: [
			variant({ countPlural: "one" }, [v("count"), text(" файл")]),
			variant({ countPlural: "*" }, [v("count"), text(" файлов")]),
		],
	};
	expect(
		messageIssues({
			reference: en,
			target: ru,
			declarations: pluralDeclarations,
			locale: "ru",
		})
	).toEqual([
		{
			type: "missing-form",
			matches: [{ type: "literal-match", key: "countPlural", value: "few" }],
		},
		{
			type: "missing-form",
			matches: [{ type: "literal-match", key: "countPlural", value: "many" }],
		},
		{
			type: "missing-form",
			matches: [{ type: "literal-match", key: "countPlural", value: "other" }],
		},
	]);
});

it("reports missing and extra variables per target variant, ignoring selector-only variables", () => {
	const reference = {
		message: message("en", []),
		variants: [
			variant({}, [v("used"), text(" of "), v("total"), text(" used")]),
		],
	};
	const target = {
		message: message("ru", []),
		variants: [
			variant({}, [text("Использовано "), v("used"), text(" "), v("extra")]),
		],
	};
	expect(messageIssues({ reference, target, locale: "ru" })).toEqual([
		{ type: "missing-variable", name: "total" },
		{ type: "extra-variable", name: "extra" },
	]);
	// countPlural is only a selector in the reference: never required in patterns
	expect(
		messageIssues({
			reference: en,
			target: {
				message: message("ja", []),
				variants: [variant({}, [v("count"), text("ファイル")])],
			},
			declarations: pluralDeclarations,
			locale: "ja",
		})
	).toEqual([]);
});

it("flags a variable missing in any non-empty variant but exempts exact number variants", () => {
	const ru = {
		message: message("ru", ["countPlural"]),
		variants: [
			variant({ countPlural: "0" }, [text("Файлов нет")]),
			variant({ countPlural: "one" }, [text("Один файл")]),
			variant({ countPlural: "few" }, [v("count"), text(" файла")]),
			variant({ countPlural: "many" }, []),
			variant({ countPlural: "other" }, [v("count"), text(" файла")]),
		],
	};
	expect(
		messageIssues({
			reference: en,
			target: ru,
			declarations: pluralDeclarations,
			locale: "ru",
		})
	).toEqual([{ type: "missing-variable", name: "count" }]);
});

it("reports missing markup", () => {
	const reference = {
		message: message("en", []),
		variants: [
			variant({}, [
				text("Welcome back, "),
				{ type: "markup-start", name: "b" },
				v("name"),
				{ type: "markup-end", name: "b" },
				text("!"),
			]),
		],
	};
	const target = {
		message: message("ru", []),
		variants: [variant({}, [text("С возвращением, "), v("name"), text("!")])],
	};
	expect(messageIssues({ reference, target, locale: "ru" })).toEqual([
		{ type: "missing-markup", name: "b" },
	]);
});

it("checks every gender × plural combination exactly", () => {
	const reference = {
		message: message("en", ["actorGender", "countPlural"]),
		variants: [
			variant({ actorGender: "*", countPlural: "*" }, [
				v("actorName"),
				text(" sent you "),
				v("count"),
				text(" files"),
			]),
		],
	};
	const forms: Array<[string, string]> = [];
	for (const g of ["female", "male", "*"])
		for (const c of ["one", "few", "many", "other"]) forms.push([g, c]);
	const target = {
		message: message("ru", ["actorGender", "countPlural"]),
		variants: forms
			.filter(([g, c]) => !(g === "male" && c === "many"))
			.map(([g, c]) =>
				variant({ actorGender: g, countPlural: c }, [
					v("actorName"),
					text(" отправил "),
					v("count"),
				])
			),
	};
	expect(
		messageIssues({
			reference,
			target,
			declarations: genderPluralDeclarations,
			locale: "ru",
		})
	).toEqual([
		{
			type: "missing-form",
			matches: [
				{ type: "literal-match", key: "actorGender", value: "male" },
				{ type: "literal-match", key: "countPlural", value: "many" },
			],
		},
	]);
	// English has only one/other and the reference covers them with catch-alls
	expect(
		messageIssues({
			target: reference,
			declarations: genderPluralDeclarations,
			locale: "en",
		})
	).toEqual([
		{
			type: "missing-form",
			matches: [
				{ type: "catchall-match", key: "actorGender" },
				{ type: "literal-match", key: "countPlural", value: "one" },
			],
		},
		{
			type: "missing-form",
			matches: [
				{ type: "catchall-match", key: "actorGender" },
				{ type: "literal-match", key: "countPlural", value: "other" },
			],
		},
	]);
});
