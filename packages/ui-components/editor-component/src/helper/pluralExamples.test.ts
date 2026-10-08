import { expect, it } from "vitest";
import { pluralExamples } from "./pluralExamples.js";

it("compresses Russian cardinal examples into short ranges", () => {
	expect(pluralExamples("ru")).toEqual({
		one: "1, 21, 31…",
		few: "2–4, 22…",
		many: "0, 5–20…",
		other: "1.5",
	});
});

it("lists open-ended runs number by number and omits the ellipsis when complete", () => {
	expect(pluralExamples("en")).toEqual({ one: "1", other: "0, 2, 3…" });
});

it("supports ordinal rules", () => {
	expect(pluralExamples("en", "ordinal")).toEqual({
		one: "1, 21, 31…",
		two: "2, 22, 32…",
		few: "3, 23, 33…",
		other: "0, 4–20…",
	});
});

it("finds categories only reached by large numbers", () => {
	expect(pluralExamples("fr").many).toContain("1000000");
});

it("caches per locale and type and returns {} for unsupported locales", () => {
	expect(pluralExamples("ru")).toBe(pluralExamples("ru"));
	expect(pluralExamples("ru", "ordinal")).not.toBe(pluralExamples("ru"));
	expect(pluralExamples("zz")).toEqual({});
	expect(pluralExamples("bad_locale")).toEqual({});
});
