import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createOpenAITranslateProvider,
  DEFAULT_OPENAI_MODEL,
  OPENAI_RESPONSES_URL,
} from "./openai.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOpenAITranslateProvider", () => {
  test("translates text via the OpenAI Responses API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "Hallo Welt" }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAITranslateProvider("openai-key", "gpt-test");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(result).toEqual({ ok: true, translatedText: "Hallo Welt" });
    expect(fetchMock).toHaveBeenCalledWith(
      OPENAI_RESPONSES_URL,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer openai-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-test",
          instructions:
            "You are a translation engine. Translate the user's text from the source language to the target language. Preserve HTML tags, placeholders, and formatting. Return only the translated text, without explanations or quotation marks.",
          input:
            "Source language: en\nTarget language: de\n\nText:\nHello World",
        }),
      }),
    );
  });

  test("uses the default model when one is not specified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "Hallo Welt" }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAITranslateProvider("openai-key");
    await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) {
      throw new Error("Expected an OpenAI API request");
    }
    expect(JSON.parse(request.body).model).toBe(DEFAULT_OPENAI_MODEL);
  });

  test.each([
    {
      inputText: "Hello World",
      outputText: "Hallo Welt\n",
      expectedText: "Hallo Welt",
    },
    {
      inputText: "Hello World\n",
      outputText: "Hallo Welt\n",
      expectedText: "Hallo Welt\n",
    },
  ])(
    "preserves only the trailing newline from the input",
    async ({ inputText, outputText, expectedText }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            status: "completed",
            output: [
              {
                type: "message",
                status: "completed",
                content: [{ type: "output_text", text: outputText }],
              },
            ],
          }),
        }),
      );

      const provider = createOpenAITranslateProvider("openai-key");
      const result = await provider.translateText({
        text: inputText,
        sourceLocale: "en",
        targetLocale: "de",
      });

      expect(result).toEqual({ ok: true, translatedText: expectedText });
    },
  );

  test("sends the configured reasoning effort", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "Hallo Welt" }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAITranslateProvider(
      "openai-key",
      "gpt-test",
      "high",
    );
    await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) {
      throw new Error("Expected an OpenAI API request");
    }
    expect(JSON.parse(request.body).reasoning).toEqual({ effort: "high" });
  });

  test("returns an error when the API request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    const provider = createOpenAITranslateProvider("openai-key");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(result).toEqual({
      ok: false,
      error: "401 Unauthorized: translating from en to de",
    });
  });

  test.each([
    [429, "Too Many Requests"],
    [500, "Internal Server Error"],
    [503, "Service Unavailable"],
    [599, "Server Error"],
  ])("marks HTTP %i as unavailable", async (status, statusText) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
      }),
    );

    const provider = createOpenAITranslateProvider("openai-key");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(result).toEqual({
      ok: false,
      error: `${status} ${statusText}: translating from en to de`,
      unavailable: true,
    });
  });

  test.each([
    {
      status: "incomplete",
      messageStatus: "incomplete",
    },
    {
      status: "completed",
      messageStatus: "incomplete",
    },
  ])(
    "rejects a response or message that is not completed",
    async ({ status, messageStatus }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            status,
            output: [
              {
                type: "message",
                status: messageStatus,
                content: [{ type: "output_text", text: "Hallo" }],
              },
            ],
          }),
        }),
      );

      const provider = createOpenAITranslateProvider("openai-key");
      const result = await provider.translateText({
        text: "Hello World",
        sourceLocale: "en",
        targetLocale: "de",
      });

      expect(result).toEqual({
        ok: false,
        error: "OpenAI response was not completed: translating from en to de",
        unavailable: true,
      });
    },
  );

  test("returns an error when the response has no translation text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "completed", output: [] }),
      }),
    );

    const provider = createOpenAITranslateProvider("openai-key");
    const result = await provider.translateText({
      text: "Hello World",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(result).toEqual({
      ok: false,
      error: "Invalid response from OpenAI: translating from en to de",
    });
  });
});
