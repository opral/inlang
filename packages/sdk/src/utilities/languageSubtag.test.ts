import { test, expect } from "vitest";
import { getPrimaryLanguageSubtag } from "./languageSubtag.js";

test("getPrimaryLanguageSubtag returns the subtag of a simple language tag", () => {
	expect(getPrimaryLanguageSubtag("en")).toBe("en");
	expect(getPrimaryLanguageSubtag("de")).toBe("de");
});

test("getPrimaryLanguageSubtag returns the subtag of a regional language tag", () => {
	expect(getPrimaryLanguageSubtag("en-US")).toBe("en");
	expect(getPrimaryLanguageSubtag("fr-FR")).toBe("fr");
	expect(getPrimaryLanguageSubtag("pt-BR")).toBe("pt");
});

test("getPrimaryLanguageSubtag returns the subtag of a tag with script and region", () => {
	expect(getPrimaryLanguageSubtag("zh-Hant-TW")).toBe("zh");
	expect(getPrimaryLanguageSubtag("sr-Latn-RS")).toBe("sr");
	expect(getPrimaryLanguageSubtag("az-Arab-IR")).toBe("az");
});

test("getPrimaryLanguageSubtag returns the subtag of a tag with variants and extensions", () => {
	expect(getPrimaryLanguageSubtag("de-AT-1996")).toBe("de");
	expect(getPrimaryLanguageSubtag("en-US-u-ca-gregory")).toBe("en");
});

test("getPrimaryLanguageSubtag returns 5-8 letter primary subtags unchanged", () => {
	expect(getPrimaryLanguageSubtag("haw-US")).toBe("haw");
	expect(getPrimaryLanguageSubtag("haw")).toBe("haw");
});

test("getPrimaryLanguageSubtag preserves the case of the primary subtag", () => {
	expect(getPrimaryLanguageSubtag("EN-US")).toBe("EN");
});

test("getPrimaryLanguageSubtag returns an invalid locale unchanged", () => {
	expect(getPrimaryLanguageSubtag("en_US")).toBe("en_US");
	expect(getPrimaryLanguageSubtag("e")).toBe("e");
	expect(getPrimaryLanguageSubtag("123")).toBe("123");
	expect(getPrimaryLanguageSubtag("")).toBe("");
});
