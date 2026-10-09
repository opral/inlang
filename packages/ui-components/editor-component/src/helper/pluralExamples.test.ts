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
	expect(pluralExamples("ru")).toEqual(pluralExamples("ru"));
	expect(pluralExamples("ru", "ordinal")).not.toEqual(pluralExamples("ru"));
	expect(pluralExamples("zz")).toEqual({});
	expect(pluralExamples("bad_locale")).toEqual({});
});

it("leaves out numbers that have their own form", () => {
	expect(pluralExamples("en", "cardinal", { exclude: [0] })).toEqual({
		one: "1",
		other: "2, 3, 4…",
	});
	expect(pluralExamples("ja", "cardinal", { exclude: ["0"] })).toEqual({
		other: "1, 2, 3…",
	});
	// every number of "one" has its own form
	expect(pluralExamples("en", "cardinal", { exclude: [0, 1] })).toEqual({
		other: "2, 3, 4…",
	});
	expect(pluralExamples("en", "cardinal", { exclude: [0] })).not.toBe(
		pluralExamples("en")
	);
});

it("returns a copy: changing the result does not change the next call", () => {
	const first = pluralExamples("en");
	first.one = "changed";
	delete (first as Record<string, string>).other;
	expect(pluralExamples("en")).toEqual({ one: "1", other: "0, 2, 3…" });
});

it("shifts examples by an ICU offset; excluded numbers are the numbers themselves", () => {
	expect(pluralExamples("en", "cardinal", { offset: 1 })).toEqual({ one: "2", other: "1, 3, 4…" });
	expect(pluralExamples("en", "cardinal", { offset: 1, exclude: [0, 1] })).toEqual({ one: "2", other: "3, 4, 5…" });
});
