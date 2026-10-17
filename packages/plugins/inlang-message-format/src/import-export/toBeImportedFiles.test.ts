import { test, expect } from "vitest";
import { toBeImportedFiles } from "./toBeImportedFiles.js";

test.each([
	"/translations/{locale}/{locale}.json",
	"/translations/{languageTag}/{languageTag}.json",
	"/translations/{locale}/{languageTag}.json",
])(
	"toBeImportedFiles replaces every placeholder in %s",
	async (pathPattern) => {
		const result = await toBeImportedFiles({
			settings: {
				baseLocale: "en",
				locales: ["en", "de"],
				"plugin.inlang.messageFormat": { pathPattern },
			},
		});

		expect(result).toEqual([
			{ locale: "en", path: "/translations/en/en.json" },
			{ locale: "de", path: "/translations/de/de.json" },
		]);
	}
);

test("toBeImportedFiles preserves array and locale order with repeated placeholders", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				pathPattern: [
					"/defaults/{locale}/{locale}.json",
					"/translations/{languageTag}/{locale}.json",
				],
			},
		},
	});

	expect(result).toEqual([
		{ locale: "en", path: "/defaults/en/en.json" },
		{ locale: "de", path: "/defaults/de/de.json" },
		{ locale: "en", path: "/translations/en/en.json" },
		{ locale: "de", path: "/translations/de/de.json" },
	]);
});

test("toBeImportedFiles should work with locale as setting", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				pathPattern: "/translations/{locale}.json",
			},
		},
	});

	expect(result).toEqual([
		{
			locale: "en",
			path: "/translations/en.json",
		},
		{
			locale: "de",
			path: "/translations/de.json",
		},
	]);
});

test("toBeImportedFiles returns [] if the pathPattern is not provided", async () => {
	const result = await toBeImportedFiles({
		nodeFs: {} as any,
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				// @ts-expect-error - testing defined plugin settings without pathPattern
				"some-other-prop": "value",
				// pathPattern: "/translations/{locale}.json",
			},
		},
	});

	expect(result).toEqual([]);
});

test("toBeImportedFiles should work with languageTag as setting for backward compatibility", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				pathPattern: "/translations/{languageTag}.json",
			},
		},
	});

	expect(result).toEqual([
		{
			locale: "en",
			path: "/translations/en.json",
		},
		{
			locale: "de",
			path: "/translations/de.json",
		},
	]);
});

test("toBeImportedFiles should work with both locale and languageTag and multiple pathPatterns", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				pathPattern: ["/defaults/{locale}.json", "/translations/{locale}.json"],
			},
		},
	});

	expect(result).toEqual([
		{
			locale: "en",
			path: "/defaults/en.json",
		},
		{
			locale: "de",
			path: "/defaults/de.json",
		},
		{
			locale: "en",
			path: "/translations/en.json",
		},
		{
			locale: "de",
			path: "/translations/de.json",
		},
	]);
});
