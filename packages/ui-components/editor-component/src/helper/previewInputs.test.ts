import { expect, it } from "vitest";
import type { Declaration } from "@inlang/sdk";
import { previewInputs } from "./previewInputs.js";
import {
	genderPluralDeclarations,
	message,
	text,
	v,
	variant,
} from "./fixtures.test-util.js";

it("derives input kinds from declarations, selectors and patterns", () => {
	const declarations: Declaration[] = [
		...genderPluralDeclarations,
		{ type: "input-variable", name: "sentDate" },
		{ type: "input-variable", name: "price" },
		{
			type: "local-variable",
			name: "sentDateFormatted",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "sentDate" },
				annotation: {
					type: "function-reference",
					name: "datetime",
					options: [],
				},
			},
		},
	];
	const variants = [
		variant({ actorGender: "female", countPlural: "one" }, [v("actorName")]),
		variant({ actorGender: "male", countPlural: "*" }, [
			text("x"),
			{
				type: "expression",
				arg: { type: "variable-reference", name: "price" },
				annotation: { type: "function-reference", name: "number", options: [] },
			},
		]),
	];
	expect(
		previewInputs(declarations, [
			{ message: message("ru", ["actorGender", "countPlural"]), variants },
		])
	).toEqual([
		{ name: "actorName", kind: "text" },
		{
			name: "actorGender",
			kind: "select",
			options: ["female", "male", "other"],
		},
		{ name: "count", kind: "number" },
		{ name: "sentDate", kind: "date" },
		{ name: "price", kind: "number" },
	]);
});
