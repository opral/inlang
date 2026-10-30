import { expect, test } from "vitest";
import { toBeImportedFiles } from "./toBeImportedFiles.js";
import type { PluginSettings } from "../settings.js";

test("discovers modern and legacy locale placeholders", async () => {
	const files = await toBeImportedFiles({
		settings: {
			baseLocale: "en",
			locales: ["en", "de"],
			"plugin.inlang.json": {
				pathPattern: "/messages/{locale}/{languageTag}.json",
			} satisfies PluginSettings,
		} as any,
	});

	expect(files).toEqual([
		{ locale: "en", path: "/messages/en/en.json" },
		{ locale: "de", path: "/messages/de/de.json" },
	]);
});

test("resolves the {language} placeholder to the primary language subtag", async () => {
	const files = await toBeImportedFiles({
		settings: {
			baseLocale: "en-US",
			locales: ["en-US", "fr-FR", "zh-Hant-TW"],
			"plugin.inlang.json": {
				pathPattern: "/messages/{language}.json",
			} satisfies PluginSettings,
		} as any,
	});

	expect(files).toEqual([
		{ locale: "en-US", path: "/messages/en.json" },
		{ locale: "fr-FR", path: "/messages/fr.json" },
		{ locale: "zh-Hant-TW", path: "/messages/zh.json" },
	]);
});

test("uses legacy languageTags when locales are unavailable", async () => {
	const files = await toBeImportedFiles({
		settings: {
			sourceLanguageTag: "en",
			languageTags: ["en", "de"],
			"plugin.inlang.json": {
				pathPattern: "/messages/{languageTag}.json",
			} satisfies PluginSettings,
		} as any,
	});

	expect(files).toEqual([
		{ locale: "en", path: "/messages/en.json" },
		{ locale: "de", path: "/messages/de.json" },
	]);
});

test("discovers every namespaced resource with namespace metadata", async () => {
	const files = await toBeImportedFiles({
		settings: {
			locales: ["en", "de"],
			"plugin.inlang.json": {
				pathPattern: {
					common: "/messages/{locale}/common.json",
					auth: "/messages/{languageTag}/auth.json",
				},
			} satisfies PluginSettings,
		} as any,
	});

	expect(files).toEqual([
		{
			locale: "en",
			path: "/messages/en/common.json",
			metadata: { namespace: "common" },
		},
		{
			locale: "en",
			path: "/messages/en/auth.json",
			metadata: { namespace: "auth" },
		},
		{
			locale: "de",
			path: "/messages/de/common.json",
			metadata: { namespace: "common" },
		},
		{
			locale: "de",
			path: "/messages/de/auth.json",
			metadata: { namespace: "auth" },
		},
	]);
});

test("returns no files without a path pattern", async () => {
	const files = await toBeImportedFiles({
		settings: {
			locales: ["en"],
			"plugin.inlang.json": {},
		} as any,
	});

	expect(files).toEqual([]);
});
