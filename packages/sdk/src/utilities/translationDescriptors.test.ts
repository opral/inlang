import { expect, test } from "vitest";
import {
	getTranslationDescription,
	parseTranslationDescriptors,
} from "./translationDescriptors.js";

test("parses descriptions and looks them up by exact bundle ID", () => {
	const descriptors = parseTranslationDescriptors(`
"reviews:misc.port":
  description: in computing
"misc.portRange":
  description: a range in computing
`);

	expect(getTranslationDescription("reviews:misc.port", descriptors)).toBe(
		"in computing"
	);
	expect(getTranslationDescription("misc.portRange", descriptors)).toBe(
		"a range in computing"
	);
	expect(
		getTranslationDescription("reviews:other", descriptors)
	).toBeUndefined();
});

test("converts i18n-ally namespace.key entries to bundle IDs", () => {
	const descriptors = parseTranslationDescriptors(`
reviews:
  misc.port:
    description: in computing
  misc.portRange:
    description: a range in computing
`);

	expect(getTranslationDescription("misc:port", descriptors)).toBe(
		"in computing"
	);
	expect(getTranslationDescription("misc:portRange", descriptors)).toBe(
		"a range in computing"
	);
});

test("preserves dots after the namespace separator in review keys", () => {
	const descriptors = parseTranslationDescriptors(`
reviews:
  misc.port.range:
    description: in computing
`);

	expect(getTranslationDescription("misc:port.range", descriptors)).toBe(
		"in computing"
	);
});

test("rejects i18n-ally review keys without a namespace and key", () => {
	expect(() =>
		parseTranslationDescriptors(`
reviews:
  port:
    description: in computing
`)
	).toThrow(
		'i18n-ally review key "port" must use the "<namespace>.<key>" format.'
	);
});

test("reports invalid descriptor entries with their file and key", () => {
	expect(() =>
		parseTranslationDescriptors(
			`
"reviews:misc.port": in computing
`,
			"descriptors.yml"
		)
	).toThrow(
		'descriptors.yml: "reviews:misc.port" must have a string description.'
	);
});
