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

test("toBeImportedFiles should work with language as setting", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.messageFormat": {
				pathPattern: "/translations/{language}.json",
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

test.each([
	["en-US", "/translations/en.json"],
	["fr-FR", "/translations/fr.json"],
	["pt-BR", "/translations/pt.json"],
	["zh-Hant-TW", "/translations/zh.json"],
])(
	"toBeImportedFiles resolves {language} from the primary language subtag of %s",
	async (locale, expectedPath) => {
		const result = await toBeImportedFiles({
			settings: {
				baseLocale: "en-US",
				locales: [locale],
				"plugin.inlang.messageFormat": {
					pathPattern: "/translations/{language}.json",
				},
			},
		});

		expect(result).toEqual([
			{
				locale,
				path: expectedPath,
			},
		]);
	}
);

test("toBeImportedFiles resolves {language} and {locale} in the same pathPattern", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en-US",
			locales: ["en-US", "fr-FR"],
			"plugin.inlang.messageFormat": {
				pathPattern: "/translations/{language}/{locale}.json",
			},
		},
	});

	expect(result).toEqual([
		{ locale: "en-US", path: "/translations/en/en-US.json" },
		{ locale: "fr-FR", path: "/translations/fr/fr-FR.json" },
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
