import { expect, test } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { PluginSettings } from "./settings.js";

test("context values can be explicit, empty, or contain underscores", () => {
	for (const contextValues of [
		[],
		["male"],
		["male_formal", "female_formal"],
	]) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: "./{locale}.json",
				contextValues,
			})
		).toBe(true);
	}
	for (const contextValues of [[""], ["male", "male"], [1]]) {
		expect(
			Value.Check(PluginSettings, {
				pathPattern: "./{locale}.json",
				contextValues,
			})
		).toBe(false);
	}
});

test("valid path patterns", async () => {
	const validPathPatterns = [
		"/folder/{locale}.json",
		"./{locale}/file.json",
		"../folder/{locale}/file.json",
		"./{locale}.json",
		"./{locale}/folder/file.json",
	];

	for (const pathPattern of validPathPatterns) {
		const isValid = Value.Check(PluginSettings, {
			pathPattern,
		});
		expect(isValid).toBe(true);
	}
});

test("it should fail if the path pattern does not start as a ralaitve path with a /,./ or ../", async () => {
	const pathPattern = "{locale}.json";

	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});
test("if path patter does include the word `{locale}`", async () => {
	const pathPattern = "./examplePath.json";

	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});

test("should fail if the path does not end with .json", async () => {
	const pathPattern = "./{locale}.";

	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});

test("if curly brackets {} does to cointain the word languageTag", async () => {
	const pathPattern = "./{en}.json";

	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});

test("the pathPattern can contain the {language} placeholder", async () => {
	const isValid = Value.Check(PluginSettings, {
		pathPattern: "./{language}.json",
	});
	expect(isValid).toBe(true);
});

test("if pathPattern doesn't includes a '*' wildcard. This was deprecated in version 3.0.0.", async () => {
	const pathPattern = "./{locale}/*.json";
	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});

test("if pathPattern with namespaces include the correct pathpattern schema", async () => {
	const pathPattern = {
		website: "./{locale}folder/file.json",
		app: "../{locale}folder/file.json",
		footer: "./{locale}folder/file.json",
	};
	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(true);
});

test("if pathPattern with namespaces include a incorrect pathpattern", async () => {
	const pathPattern = {
		website: "./folder/file.json",
		app: "../{locale}folder/file.json",
		footer: "./{locale}folder/file.json",
	};
	const isValid = Value.Check(PluginSettings, {
		pathPattern,
	});
	expect(isValid).toBe(false);
});

test("if sourceLanguageFilePath with namespaces include the correct sourceLanguageFilePath schema", async () => {
	const sourceLanguageFilePath = {
		website: "./{locale}folder/file.json",
		app: "../{locale}folder/file.json",
		footer: "./{locale}folder/file.json",
	};
	const isValid = Value.Check(PluginSettings, {
		sourceLanguageFilePath,
	});
	expect(isValid).toBe(false);
});
