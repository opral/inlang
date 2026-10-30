import { test, expect } from "vitest";
import { PluginSettings } from "./settings.js";
import { Value } from "@sinclair/typebox/value";

test("the file path pattern must end with .json", () => {
	const valid = [
		"./messages/{locale}.json",
		"./src/i18n/{locale}.json",
		"./translations/{locale}.json",
	];
	const invalid = ["./messages/{locale}.json.txt", "./messages/{locale}.js"];
	for (const path of valid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(true);
	}
	for (const path of invalid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(false);
	}
});

test("the file path pattern can contain the {languageTag} placeholder for legacy reasons", () => {
	const valid = [
		"./messages/{languageTag}.json",
		"./src/i18n/{languageTag}.json",
		"./translations/{languageTag}.json",
	];
	const invalid = ["./messages/messages.json", "./messages/{invalid}.json"];
	for (const path of valid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(true);
	}
	for (const path of invalid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(false);
	}
});

test("the file path pattern can contain the {language} placeholder", () => {
	const valid = [
		"./messages/{language}.json",
		"./src/i18n/{language}.json",
		"./translations/{language}.json",
	];
	const invalid = ["./messages/messages.json", "./messages/{language}.js"];
	for (const path of valid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(true);
	}
	for (const path of invalid) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: path,
			} satisfies PluginSettings)
		).toBe(false);
	}
});

test("it should be possible to use an absolute path", () => {
	const settings = {
		pathPattern: "/home/{locale}.json",
	} satisfies PluginSettings;
	expect(Value.Check(PluginSettings, settings)).toBe(true);
});

test("it should be possible to use a relative path", () => {
	const settings = {
		pathPattern: "./home/{locale}.json",
	} satisfies PluginSettings;
	expect(Value.Check(PluginSettings, settings)).toBe(true);
});

test("it should be possible to use parent directories in the storage path", () => {
	const settings = {
		pathPattern: "../home/{locale}.json",
	} satisfies PluginSettings;
	expect(Value.Check(PluginSettings, settings)).toBe(true);
});

test("it should be possible to use multiple storage paths given as array", () => {
	const valid = [
		"./messages/{locale}.json",
		"./src/i18n/{locale}.json",
		"./translations/{locale}.json",
	];
	const invalid = ["./messages/{locale}.json.txt", "./messages/{locale}.js"];
	expect(
		Value.Check(PluginSettings, {
			pathPattern: valid,
		} satisfies PluginSettings)
	).toBe(true);
	expect(
		Value.Check(PluginSettings, {
			pathPattern: invalid,
		} satisfies PluginSettings)
	).toBe(false);
});
