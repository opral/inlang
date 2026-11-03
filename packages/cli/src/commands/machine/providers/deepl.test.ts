import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getDeepLApiUrl,
  toDeepLSourceLocale,
  toDeepLTargetLocale,
  createDeepLTranslateProvider,
} from "./deepl.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toDeepLSourceLocale", () => {
  test("strips region subtag from source locale", () => {
    expect(toDeepLSourceLocale("en-US")).toBe("en");
    expect(toDeepLSourceLocale("zh-Hans")).toBe("zh");
    expect(toDeepLSourceLocale("de")).toBe("de");
  });
});

describe("toDeepLTargetLocale", () => {
  test("passes through target locale", () => {
    expect(toDeepLTargetLocale("en-US")).toBe("en-US");
    expect(toDeepLTargetLocale("de")).toBe("de");
  });
});

describe("getDeepLApiUrl", () => {
  test("uses free endpoint for free API keys", () => {
    expect(getDeepLApiUrl("abc123:fx")).toBe(
      "https://api-free.deepl.com/v2/translate",
    );
  });

  test("uses pro endpoint for pro API keys", () => {
    expect(getDeepLApiUrl("abc123")).toBe(
      "https://api.deepl.com/v2/translate",
    );
  });
});

describe("createDeepLTranslateProvider", () => {
  test("translates text via DeepL API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [{ text: "Hallo Welt" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createDeepLTranslateProvider("test-key:fx");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en-US",
      targetLocale: "de",
    });

    expect(result).toEqual({ ok: true, translatedText: "Hallo Welt" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-free.deepl.com/v2/translate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "DeepL-Auth-Key test-key:fx",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: ["Hello World"],
          source_lang: "en",
          target_lang: "de",
          tag_handling: "html",
        }),
      }),
    );
  });

  test("sends contextual descriptions to DeepL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: "Hafen" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createDeepLTranslateProvider("test-key");
    await provider.translateText({
      text: "Port",
      sourceLocale: "en",
      targetLocale: "de",
      context: "in computing",
    });

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) {
      throw new Error("Expected a DeepL API request");
    }
    expect(JSON.parse(request.body).context).toBe("in computing");
  });

  test("returns error when API request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      }),
    );

    const provider = createDeepLTranslateProvider("test-key");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "xx",
    });

    expect(result).toEqual({
      ok: false,
      error: "400 Bad Request: translating from en to xx",
    });
  });
});
