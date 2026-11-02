import { afterEach, test, expect, vi } from "vitest";
import {
  OPENAI_REASONING_EFFORT_ENV,
  resolveMachineTranslateProvider,
} from "./resolveProvider.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("uses google when its key is set and no provider is configured", () => {
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "google-key");
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("uses openai when its key is set and no provider is configured", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");
  vi.stubEnv("INLANG_OPENAI_API_KEY", "openai-key");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("falls back to the free demosjarco service when no keys are set", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");
  vi.stubEnv("INLANG_OPENAI_API_KEY", "");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("uses the free demosjarco service when explicitly selected", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "demosjarco");

  const provider = resolveMachineTranslateProvider();
  expect(provider).toBeDefined();
});

test("requires INLANG_GOOGLE_TRANSLATE_API_KEY for google provider", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "google");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    "INLANG_GOOGLE_TRANSLATE_API_KEY must be set",
  );
});

test("requires INLANG_DEEPL_API_KEY for deepl provider", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "deepl");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    "INLANG_DEEPL_API_KEY must be set",
  );
});

test("requires INLANG_OPENAI_API_KEY for openai provider", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "openai");
  vi.stubEnv("INLANG_OPENAI_API_KEY", "");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    "INLANG_OPENAI_API_KEY must be set",
  );
});

test("uses OpenAI model and reasoning effort from the environment", async () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "openai");
  vi.stubEnv("INLANG_OPENAI_API_KEY", "openai-key");
  vi.stubEnv("INLANG_OPENAI_MODEL", "gpt-custom");
  vi.stubEnv(OPENAI_REASONING_EFFORT_ENV, "medium");

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "Hallo Welt" }],
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);

  await resolveMachineTranslateProvider().translateText({
    text: "Hello World",
    sourceLocale: "en",
    targetLocale: "de",
  });

  const request = fetchMock.mock.calls[0]?.[1];
  if (!request) {
    throw new Error("Expected an OpenAI API request");
  }
  expect(JSON.parse(request.body)).toMatchObject({
    model: "gpt-custom",
    reasoning: { effort: "medium" },
  });
});

test("rejects unsupported provider values", () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "azure");

  expect(() => resolveMachineTranslateProvider()).toThrow(
    'Unsupported INLANG_MACHINE_TRANSLATE_PROVIDER value: "azure"',
  );
});
