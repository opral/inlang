import { test, expect } from "vitest";
import { toBeImportedFiles } from "./toBeImportedFiles.js";
import type { PluginSettings } from "../settings.js";

test("it should work for a single namespace", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.i18next": {
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

test("it should work for multiple namespaces", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.i18next": {
				pathPattern: {
					common: "/resources/{locale}/common.json",
					vital: "/resources/{locale}/vital.json",
				},
			} satisfies PluginSettings,
		},
	});

	expect(result).toEqual(
		expect.arrayContaining([
			{
				locale: "en",
				path: "/resources/en/common.json",
				metadata: {
					namespace: "common",
				},
			},
			{
				locale: "de",
				path: "/resources/de/common.json",
				metadata: {
					namespace: "common",
				},
			},
			{
				locale: "en",
				path: "/resources/en/vital.json",
				metadata: {
					namespace: "vital",
				},
			},
			{
				locale: "de",
				path: "/resources/de/vital.json",
				metadata: {
					namespace: "vital",
				},
			},
		])
	);
});

test("returns [] if the pathPattern is not provided", async () => {
	const result = await toBeImportedFiles({
		nodeFs: {} as any,
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.i18next": {
				// @ts-expect-error - testing defined plugin settings without pathPattern
				"some-other-prop": "value",
				// pathPattern: "/translations/{locale}.json",
			},
		},
	});

	expect(result).toEqual([]);
});

test("should work with languageTag as setting for backward compatibility", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.i18next": {
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

// saveProjectToDirectory replaces every `{locale}` of the pattern when it
// writes a file, so the file that is read must be the same
test("every `{locale}` of a pattern is replaced", async () => {
	const result = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en"],
			"plugin.inlang.i18next": {
				pathPattern: {
					common: "./{locale}/common.{locale}.json",
					"app:errors": "./{languageTag}/app-errors.{locale}.json",
				},
			} satisfies PluginSettings,
		},
	});
	expect(result).toStrictEqual([
		{
			locale: "en",
			path: "./en/common.en.json",
			metadata: { namespace: "common" },
		},
		{
			locale: "en",
			path: "./en/app-errors.en.json",
			metadata: { namespace: "app:errors" },
		},
	]);
	expect(
		await toBeImportedFiles({
			settings: {
				baseLocale: "en",
				locales: ["en"],
				"plugin.inlang.i18next": { pathPattern: "./{locale}/{locale}.json" },
			},
		})
	).toStrictEqual([{ locale: "en", path: "./en/en.json" }]);
});
