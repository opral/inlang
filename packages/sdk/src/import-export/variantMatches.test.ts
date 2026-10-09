import { describe, expect, test } from "vitest";
import { variantMatchesKey } from "./variantMatches.js";

describe("variantMatchesKey", () => {
	test("ignores the order of the properties of a match", () => {
		expect(
			variantMatchesKey([{ type: "literal-match", key: "count", value: "one" }])
		).toBe(
			variantMatchesKey([{ key: "count", type: "literal-match", value: "one" }])
		);
	});

	test("ignores the order of the matches", () => {
		expect(
			variantMatchesKey([
				{ type: "literal-match", key: "gender", value: "female" },
				{ type: "catchall-match", key: "count" },
			])
		).toBe(
			variantMatchesKey([
				{ key: "count", type: "catchall-match" },
				{ key: "gender", type: "literal-match", value: "female" },
			])
		);
	});

	test("missing matches are no matches", () => {
		expect(variantMatchesKey(undefined)).toBe(variantMatchesKey([]));
		expect(variantMatchesKey(null)).toBe(variantMatchesKey([]));
	});

	test("tells different matches apart", () => {
		const keys = [
			[],
			[{ type: "catchall-match", key: "count" }],
			[{ type: "literal-match", key: "count", value: "one" }],
			[{ type: "literal-match", key: "count", value: "other" }],
			[{ type: "literal-match", key: "countPlural", value: "one" }],
			[
				{ type: "literal-match", key: "count", value: "one" },
				{ type: "catchall-match", key: "gender" },
			],
		].map(variantMatchesKey);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
