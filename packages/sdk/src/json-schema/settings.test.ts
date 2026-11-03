import { TypeCompiler } from "@sinclair/typebox/compiler";
import { ProjectSettings } from "./settings.js";
import { test, expect } from "vitest";

const C = TypeCompiler.Compile(ProjectSettings);

test("valid settings file", () => {
	const settings: ProjectSettings = {
		baseLocale: "en",
		locales: ["en", "de"],
		translationDescriptors: "./descriptors.yml",
		modules: [
			"https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@3/dist/index.js",
			"https://cdn.jsdelivr.net/npm/@inlang/plugin-csv@1/dist/index.js",
		],
		"plugin.something": {
			key: "value",
			nested: {
				moreNested: {},
			},
		},
	};

	const errors = [...C.Errors(settings)];

	expect(errors).toEqual([]);
});
