import { afterEach, expect, test, vi } from "vitest";
import type { BundleNested } from "@inlang/sdk";
import { machineTranslateBundle } from "./machineTranslateBundle.js";
import { createDeepLTranslateProvider } from "./providers/deepl.js";
import { createOpenAITranslateProvider } from "./providers/openai.js";

afterEach(() => vi.unstubAllGlobals());

test.each(["openai", "deepl"] as const)(
  "%s receives the bundle description for every translated variant",
  async (providerName) => {
    const description =
      'Shopping CTA: save money.\nKeep {amount}; "Save" is not file storage.';
    const bundle: BundleNested = {
      id: "save",
      description,
      declarations: [],
      messages: [
        {
          id: "en",
          bundle_id: "save",
          locale: "en",
          selectors: [{ type: "variable-reference", name: "count" }],
          variants: ["Save", "Save more"].map((value, index) => ({
            id: `v${index}`,
            message_id: "en",
            matches: [
              { type: "literal-match", key: "count", value: String(index) },
            ],
            pattern: [{ type: "text", value }],
          })),
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () =>
        providerName === "deepl"
          ? { translations: [{ text: "Sparen" }] }
          : {
              status: "completed",
              output: [
                {
                  type: "message",
                  status: "completed",
                  content: [{ type: "output_text", text: "Sparen" }],
                },
              ],
            },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const provider =
      providerName === "deepl"
        ? createDeepLTranslateProvider("test-key")
        : createOpenAITranslateProvider("test-key");
    const result = await machineTranslateBundle({
      bundle,
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      provider,
    });
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, request] of fetchMock.mock.calls) {
      const body = JSON.parse(request.body);
      if (providerName === "deepl") {
        expect(body.context).toBe(description);
        expect(body.text).not.toContain(description);
      } else {
        expect(body.input).toContain(JSON.stringify(description));
        expect(body.instructions).not.toContain(description);
      }
    }
    expect(result.data?.description).toBe(description);
    expect(bundle.messages).toHaveLength(1);
    expect(
      result.data?.messages.find((m) => m.locale === "de")?.variants[0]
        ?.pattern,
    ).toEqual([{ type: "text", value: "Sparen" }]);
  },
);

test.each([null, "", undefined])(
  "omits empty description %s from provider arguments",
  async (description) => {
    const translateText = vi
      .fn()
      .mockResolvedValue({ ok: true, translatedText: "Sparen" });
    await machineTranslateBundle({
      bundle: {
        id: "save",
        description,
        declarations: [],
        messages: [
          {
            id: "en",
            bundle_id: "save",
            locale: "en",
            selectors: [],
            variants: [
              {
                id: "v",
                message_id: "en",
                matches: [],
                pattern: [{ type: "text", value: "Save" }],
              },
            ],
          },
        ],
      },
      sourceLocale: "en",
      targetLocales: ["de"],
      provider: { translateText },
    });
    expect(translateText).toHaveBeenCalledWith({
      text: "Save",
      sourceLocale: "en",
      targetLocale: "de",
    });
  },
);
